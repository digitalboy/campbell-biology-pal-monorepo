import os
import logging
import json
from pathlib import Path
from typing import List, Dict, Set, Any
from datetime import datetime, timezone

from src.clients.gemini_client import GeminiClient
from src.clients.neo4j_client import Neo4jClient
from src.utils.prompt_loader import load_prompt
from src.models.graph_models import KnowledgeGraph, TopicNode, KnowledgePointNode

# 配置日志记录
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
PROJECT_ROOT = Path(__file__).parent.parent.parent
STATUS_FILE_PATH = PROJECT_ROOT / "output" / "graph_build_status.json"
SYLLABUS_FILE_PATH = PROJECT_ROOT / "src" / "data" / "ibo_syllabus.json"

# --- [A] 状态管理与数据加载辅助函数 ---


def _load_processed_pages() -> Set[int]:
    if not STATUS_FILE_PATH.exists():
        return set()
    try:
        with open(STATUS_FILE_PATH, "r", encoding="utf-8") as f:
            status_data = json.load(f)
        return {
            int(page)
            for page, data in status_data.items()
            if data.get("status") == "success"
        }
    except (json.JSONDecodeError, IOError) as e:
        logging.warning(f"无法读取状态文件: {e}。将从头开始。")
        return set()


def _update_status(page_number: int, status: str, error_message: str = ""):
    STATUS_FILE_PATH.parent.mkdir(exist_ok=True)
    all_statuses = {}
    if STATUS_FILE_PATH.exists():
        try:
            with open(STATUS_FILE_PATH, "r", encoding="utf-8") as f:
                all_statuses = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    all_statuses[str(page_number)] = {
        "status": status,
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "error": error_message,
    }
    with open(STATUS_FILE_PATH, "w", encoding="utf-8") as f:
        json.dump(all_statuses, f, indent=2, ensure_ascii=False)


def _load_syllabus() -> List[Dict]:
    """从 JSON 文件加载 IBO 教学大纲。"""
    if not SYLLABUS_FILE_PATH.exists():
        logging.error(f"教学大纲文件未找到: {SYLLABUS_FILE_PATH}")
        return []
    with open(SYLLABUS_FILE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


# --- [B] 工作流核心函数 ---


def _construct_pdf_urls(pages: List[int]) -> list[str]:
    r2_base_url = os.getenv("R2_PUBLIC_BASE_URL")
    if not r2_base_url:
        raise ValueError("环境变量 R2_PUBLIC_BASE_URL 未找到。")
    urls = [f"{r2_base_url}/pdf-by-pages/page-{i}.pdf" for i in pages]
    return urls


def _flatten_node_properties(node_dict: Dict[str, Any]) -> Dict[str, Any]:
    """将包含多语言嵌套字典的节点字典转换为扁平化字典。"""
    flat_dict = {}
    for key, value in node_dict.items():
        if isinstance(value, dict):
            prefix = key[:-1] if key.endswith("s") else key
            for lang_code, text in value.items():
                flat_key = f"{prefix}_{lang_code}"
                flat_dict[flat_key] = text
        else:
            flat_dict[key] = value
    return flat_dict


def _seed_syllabus_topics(neo4j_client: Neo4jClient, syllabus_topics: List[Dict]):
    """将教学大纲中的所有主题预先植入 Neo4j 数据库，确保它们存在。"""
    if not syllabus_topics:
        return

    logging.info(f"正在播种/验证 {len(syllabus_topics)} 个 IBO 教学大纲主题到 Neo4j...")
    # 我们需要先将原始的 syllabus 字典扁平化
    flat_syllabus_data = [_flatten_node_properties(topic) for topic in syllabus_topics]

    query = "UNWIND $data as props MERGE (t:Topic {id: props.id}) SET t += props"
    neo4j_client.execute_query(query, parameters={"data": flat_syllabus_data})
    logging.info("IBO 教学大纲主题已成功同步。")


def _inject_graph_data(
    neo4j_client: Neo4jClient, graph: KnowledgeGraph, page_number: int
):
    """将 LLM 返回的知识图谱数据注入 Neo4j，并由代码创建页面关系。"""
    # 1. 注入 LLM 返回的 Topic 和 KnowledgePoint 节点
    if graph.topics:
        # Pydantic 对象需要先用 model_dump 转成字典
        topic_dicts = [t.model_dump(exclude_none=True) for t in graph.topics]
        topic_data = [_flatten_node_properties(td) for td in topic_dicts]
        neo4j_client.execute_query(
            "UNWIND $data as props MERGE (t:Topic {id: props.id}) SET t += props",
            parameters={"data": topic_data},
        )
    if graph.knowledge_points:
        kp_dicts = [kp.model_dump(exclude_none=True) for kp in graph.knowledge_points]
        kp_data = [_flatten_node_properties(kpd) for kpd in kp_dicts]
        neo4j_client.execute_query(
            "UNWIND $data as props MERGE (kp:KnowledgePoint {id: props.id}) SET kp += props",
            parameters={"data": kp_data},
        )
    logging.info(
        f"已合并 {len(graph.topics)} 个主题和 {len(graph.knowledge_points)} 个知识点。"
    )

    # 2. 注入 Page 节点并创建页面关系
    if graph.topics or graph.knowledge_points:
        neo4j_client.execute_query(
            "MERGE (p:Page {number: $page_number})", {"page_number": page_number}
        )
        logging.info(f"已合并页面节点: {page_number}。")
        for node in graph.topics + graph.knowledge_points:
            label = "Topic" if isinstance(node, TopicNode) else "KnowledgePoint"
            query = f"""
            MATCH (n:{label} {{id: $node_id}})
            MATCH (p:Page {{number: $page_number}})
            MERGE (n)-[:MENTIONED_ON_PAGE]->(p)
            """
            neo4j_client.execute_query(
                query, {"node_id": node.id, "page_number": page_number}
            )
        logging.info(
            f"已为 {len(graph.topics) + len(graph.knowledge_points)} 个节点创建到页面的关系。"
        )

    # 3. 注入 LLM 提供的、节点之间的关系
    for rel in graph.relationships:
        query = f"""
        MATCH (source {{id: $source_id}})
        MATCH (target {{id: $target_id}})
        MERGE (source)-[r:{rel.type}]->(target)
        """
        params = {"source_id": rel.source_id, "target_id": rel.target_id}
        if rel.properties:
            query += " SET r += $props"
            params["props"] = rel.properties.model_dump()
        neo4j_client.execute_query(query, params)
    logging.info(f"已合并 {len(graph.relationships)} 个由 LLM 提供的节点间关系。")


# --- [C] 主运行函数 ---


def run(
    start_page: int,
    end_page: int,
    force: bool = False,
    model_name: str = "gemini-2.5-flash",
):
    logging.info(f"--- 开始为页面 {start_page}-{end_page} 生成知识图谱 ---")

    # 1. 加载所有静态资源
    ibo_syllabus_topics = _load_syllabus()
    prompt_template = load_prompt("generate_graph")

    # 将教学大纲注入到 Prompt 模板中
    syllabus_json_string = json.dumps(ibo_syllabus_topics, indent=2, ensure_ascii=False)
    final_prompt = prompt_template.replace(
        "{{IBO_SYLLABUS_JSON}}", syllabus_json_string
    )

    # 2. 确定要处理的页面
    all_requested_pages = set(range(start_page, end_page + 1))
    if not force:
        pages_to_process = all_requested_pages - _load_processed_pages()
    else:
        pages_to_process = all_requested_pages

    if not pages_to_process:
        logging.info("所有请求的页面均已成功处理。无需任何操作。")
        return

    logging.info(
        f"将要处理 {len(pages_to_process)} 个新页面: {sorted(list(pages_to_process))}"
    )
    neo4j_client = None
    try:
        # 3. 初始化客户端并播种基础数据
        neo4j_client = Neo4jClient()
        gemini_client = GeminiClient()
        _seed_syllabus_topics(neo4j_client, ibo_syllabus_topics)

        # 4. 循环处理每个页面
        for page in sorted(list(pages_to_process)):
            logging.info(f"--- 正在处理页面 {page} ---")
            try:
                pdf_url = _construct_pdf_urls([page])[0]

                graph_data = gemini_client.generate_structured_content_from_url(
                    prompt=final_prompt,  # 使用注入了教学大纲的最终 Prompt
                    file_url=pdf_url,
                    response_schema=KnowledgeGraph,
                    model_name=model_name,
                )

                if not graph_data or (
                    not graph_data.topics and not graph_data.knowledge_points
                ):
                    logging.warning(
                        f"页面 {page} 未能提取任何图谱数据，将标记为空并跳过。"
                    )
                    _update_status(page, "success_empty")
                    continue

                logging.info(
                    f"成功从 Gemini API 获取 {len(graph_data.topics)} 个主题和 {len(graph_data.knowledge_points)} 个知识点，开始注入..."
                )
                _inject_graph_data(neo4j_client, graph_data, page)

                _update_status(page, "success")
                logging.info(f"--- 页面 {page} 处理成功 ---")

            except Exception as e:
                logging.error(f"处理页面 {page} 失败: {e}", exc_info=True)
                _update_status(page, "error", str(e))
    finally:
        if neo4j_client:
            neo4j_client.close()
            logging.info("Neo4j 客户端连接已关闭。")
    logging.info(f"--- 知识图谱生成运行结束 ---")
