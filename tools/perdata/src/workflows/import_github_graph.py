import os
import sys
import json
import urllib.request
import logging
import uuid
import time
from typing import List, Dict, Any

# Ensure project root is in python path
project_root = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
sys.path.append(project_root)

from src.clients.d1_client import D1Client
from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn

console = Console()
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

RAW_GRAPH_URL = "https://raw.githubusercontent.com/digitalboy/RCAE_graph_data/refs/heads/main/%E7%94%9F%E7%89%A9%E7%9A%84%E8%8A%82%E7%82%B9%E5%92%8C%E8%BE%B9%EF%BC%88%E5%88%9D%E4%B8%AD%EF%BC%8C%E9%AB%98%E4%B8%AD%E5%92%8C%E7%AB%9E%E8%B5%9B%EF%BC%89.json"
LOCAL_JSON_PATH = os.path.join(project_root, "data", "raw_graph_backup.json")

CHUNK_SIZE_NODES = 25 
CHUNK_SIZE_EDGES = 50 


def sql_quote(val: Any) -> str:
    """安全转义 SQL 字符串与 NULL 值"""
    if val is None:
        return "NULL"
    escaped = str(val).replace("'", "''")
    return f"'{escaped}'"


def download_or_load_graph_data() -> Dict[str, Any]:
    """下载或从本地加载 GitHub 图谱 JSON 数据"""
    os.makedirs(os.path.dirname(LOCAL_JSON_PATH), exist_ok=True)
    
    if not os.path.exists(LOCAL_JSON_PATH):
        console.print(f"[cyan]🌐 正在从 GitHub 下载原始图谱数据 (~13.8MB)...[/cyan]")
        proxy_support = urllib.request.ProxyHandler({
            'http': 'http://127.0.0.1:7890',
            'https': 'http://127.0.0.1:7890'
        })
        opener = urllib.request.build_opener(proxy_support)
        urllib.request.install_opener(opener)
        
        req = urllib.request.urlopen(RAW_GRAPH_URL)
        content = req.read()
        with open(LOCAL_JSON_PATH, "wb") as f:
            f.write(content)
        console.print(f"[green]✅ 成功下载并保存至本地: {LOCAL_JSON_PATH}[/green]")

    console.print(f"[cyan]📖 正在解析本地 JSON 数据...[/cyan]")
    with open(LOCAL_JSON_PATH, "r", encoding="utf-8", errors="ignore") as f:
        data = json.load(f, strict=False)
        
    return data


def execute_with_retry(d1: D1Client, sql: str, max_retries: int = 10) -> Dict[str, Any]:
    """带指数退避自动重试机制的 D1 查询执行器 (最多重试 10 次，应对代理网络波动)"""
    last_err = None
    for attempt in range(1, max_retries + 1):
        try:
            return d1.execute_query(sql)
        except Exception as e:
            last_err = e
            wait_time = attempt * 3
            logging.warning(f"D1 query retry {attempt}/{max_retries} due to: {e}. Waiting {wait_time}s...")
            time.sleep(wait_time)
    raise last_err


def ensure_d1_schema(d1: D1Client):
    """确保 D1 数据库中存在 GraphNodes 与 GraphEdges 表及索引"""
    console.print("[cyan]⚙️ 正在检查并创建 D1 表与索引...[/cyan]")
    
    create_nodes_sql = """
    CREATE TABLE IF NOT EXISTS GraphNodes (
        uuid TEXT PRIMARY KEY,
        node_name_zh TEXT NOT NULL,
        node_name_en TEXT,
        definition_zh TEXT,
        definition_en TEXT,
        multilingual_names TEXT,
        multilingual_definitions TEXT,
        aliases TEXT,
        grade TEXT,
        publisher TEXT DEFAULT '人民教育出版社',
        subject TEXT DEFAULT '生物',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    
    create_edges_sql = """
    CREATE TABLE IF NOT EXISTS GraphEdges (
        id TEXT PRIMARY KEY,
        start_uuid TEXT NOT NULL,
        end_uuid TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        edge_label_zh TEXT,
        edge_label_en TEXT,
        description_zh TEXT,
        description_en TEXT,
        multilingual_descriptions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (start_uuid) REFERENCES GraphNodes(uuid) ON DELETE CASCADE,
        FOREIGN KEY (end_uuid) REFERENCES GraphNodes(uuid) ON DELETE CASCADE
    );
    """
    
    indexes_sqls = [
        "CREATE INDEX IF NOT EXISTS idx_graph_nodes_name_zh ON GraphNodes(node_name_zh);",
        "CREATE INDEX IF NOT EXISTS idx_graph_nodes_grade ON GraphNodes(grade);",
        "CREATE INDEX IF NOT EXISTS idx_graph_edges_start ON GraphEdges(start_uuid);",
        "CREATE INDEX IF NOT EXISTS idx_graph_edges_end ON GraphEdges(end_uuid);",
        "CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON GraphEdges(edge_type);",
        "CREATE INDEX IF NOT EXISTS idx_graph_edges_composite ON GraphEdges(start_uuid, edge_type);"
    ]
    
    execute_with_retry(d1, create_nodes_sql)
    execute_with_retry(d1, create_edges_sql)
    for sql in indexes_sqls:
        execute_with_retry(d1, sql)
        
    console.print("[green]✅ D1 表与索引准备完毕！[/green]")


def import_nodes_in_chunks(d1: D1Client, nodes: List[Dict[str, Any]]):
    """分块批量导入节点数据 (带已存在检查与断点续传)"""
    total_nodes = len(nodes)
    
    # 检查已存在节点数
    try:
        res = execute_with_retry(d1, "SELECT COUNT(*) as count FROM GraphNodes WHERE uuid != 'test-uuid-1234';")
        existing_count = res.get("result", [{}])[0].get("results", [{}])[0].get("count", 0)
        if existing_count >= total_nodes:
            console.print(f"[bold green]✅ 发现 D1 数据库中已存在 {existing_count}/{total_nodes} 个节点，跳过节点导入。[/bold green]")
            return
    except Exception as e:
        console.print(f"[yellow]无法检测已存在节点数，准备全量写入节点... ({e})[/yellow]")

    console.print(f"\n[bold cyan]📦 开始分块导入 {total_nodes} 个节点 (Chunk size: {CHUNK_SIZE_NODES})...[/bold cyan]")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console
    ) as progress:
        task = progress.add_task("导入节点...", total=total_nodes)
        
        for i in range(0, total_nodes, CHUNK_SIZE_NODES):
            chunk = nodes[i:i + CHUNK_SIZE_NODES]
            values_clauses = []
            
            for node in chunk:
                props = node.get("properties", {})
                uuid_val = props.get("uuid") or str(uuid.uuid4())
                node_name_zh = props.get("node_name", "未知概念")
                node_name_en = props.get("node_name_en")
                def_zh = props.get("description")
                def_en = props.get("description_en")
                aliases_json = json.dumps(props.get("aliases", []), ensure_ascii=False) if props.get("aliases") else None
                grade = props.get("grade")
                publisher = props.get("publisher", "人民教育出版社")
                subject = props.get("subject", "生物")
                
                row_str = f"({sql_quote(uuid_val)}, {sql_quote(node_name_zh)}, {sql_quote(node_name_en)}, {sql_quote(def_zh)}, {sql_quote(def_en)}, NULL, NULL, {sql_quote(aliases_json)}, {sql_quote(grade)}, {sql_quote(publisher)}, {sql_quote(subject)})"
                values_clauses.append(row_str)
                
            sql = f"""
            INSERT OR REPLACE INTO GraphNodes (
                uuid, node_name_zh, node_name_en, definition_zh, definition_en,
                multilingual_names, multilingual_definitions, aliases, grade, publisher, subject
            ) VALUES {', '.join(values_clauses)};
            """
            
            try:
                execute_with_retry(d1, sql)
                progress.update(task, advance=len(chunk))
            except Exception as e:
                console.print(f"[bold red]❌ 节点 Block {i // CHUNK_SIZE_NODES + 1} 导入失败: {e}[/bold red]")
                raise e


def import_edges_in_chunks(d1: D1Client, edges: List[Dict[str, Any]]):
    """分块批量导入关系边数据 (支持断点续传)"""
    total_edges = len(edges)
    
    # 获取已包含的关系边数量
    existing_count = 0
    try:
        res = execute_with_retry(d1, "SELECT COUNT(*) as count FROM GraphEdges;")
        existing_count = res.get("result", [{}])[0].get("results", [{}])[0].get("count", 0)
        console.print(f"[bold yellow]📊 当前 D1 数据库已存在关系边: {existing_count}/{total_edges}[/bold yellow]")
    except Exception as e:
        console.print(f"[yellow]无法检测已存在关系边数: {e}[/yellow]")

    console.print(f"\n[bold cyan]🔗 开始分块导入关系边 (Chunk size: {CHUNK_SIZE_EDGES})...[/bold cyan]")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console
    ) as progress:
        task = progress.add_task("导入关系边...", total=total_edges)
        progress.update(task, completed=existing_count)
        
        start_index = (existing_count // CHUNK_SIZE_EDGES) * CHUNK_SIZE_EDGES
        
        for i in range(start_index, total_edges, CHUNK_SIZE_EDGES):
            chunk = edges[i:i + CHUNK_SIZE_EDGES]
            values_clauses = []
            
            for idx, edge in enumerate(chunk):
                edge_id = f"edge-{i + idx}-{edge.get('start_uuid', '')[:8]}-{edge.get('end_uuid', '')[:8]}"
                start_uuid = edge.get("start_uuid")
                end_uuid = edge.get("end_uuid")
                edge_type = edge.get("type", "RelatedTo")
                
                props = edge.get("properties", {})
                desc_zh = props.get("description")
                desc_en = props.get("description_en")
                
                row_str = f"({sql_quote(edge_id)}, {sql_quote(start_uuid)}, {sql_quote(end_uuid)}, {sql_quote(edge_type)}, {sql_quote(edge_type)}, {sql_quote(edge_type)}, {sql_quote(desc_zh)}, {sql_quote(desc_en)}, NULL)"
                values_clauses.append(row_str)
                
            sql = f"""
            INSERT OR REPLACE INTO GraphEdges (
                id, start_uuid, end_uuid, edge_type,
                edge_label_zh, edge_label_en, description_zh, description_en, multilingual_descriptions
            ) VALUES {', '.join(values_clauses)};
            """
            
            try:
                execute_with_retry(d1, sql)
                progress.update(task, advance=len(chunk))
            except Exception as e:
                console.print(f"[bold red]❌ 关系边 Block {i // CHUNK_SIZE_EDGES + 1} 导入失败: {e}[/bold red]")
                raise e


def verify_import(d1: D1Client):
    """校验数据库最终导入的记录总数"""
    console.print("\n[bold yellow]🔍 正在验证 D1 数据库终态记录总数...[/bold yellow]")
    try:
        nodes_res = execute_with_retry(d1, "SELECT COUNT(*) as count FROM GraphNodes;")
        edges_res = execute_with_retry(d1, "SELECT COUNT(*) as count FROM GraphEdges;")
        
        node_count = nodes_res.get("result", [{}])[0].get("results", [{}])[0].get("count", 0)
        edge_count = edges_res.get("result", [{}])[0].get("results", [{}])[0].get("count", 0)
        
        console.print(f"[bold green]🎉 验证完成！D1 当前包含:[/bold green]")
        console.print(f"  • [green]GraphNodes (节点): {node_count}[/green]")
        console.print(f"  • [green]GraphEdges (关系边): {edge_count}[/green]")
    except Exception as e:
        console.print(f"[bold red]❌ 校验失败: {e}[/bold red]")


def run(force: bool = False):
    """主入口逻辑"""
    console.print("\n[bold yellow]🚀 开始知识图谱 D1 迁移全量工作流[/bold yellow]")
    
    d1 = D1Client()
    ensure_d1_schema(d1)
    
    graph_data = download_or_load_graph_data()
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])
    
    if not nodes or not edges:
        console.print("[bold red]❌ 未提取到节点或边数据！[/bold red]")
        return
        
    import_nodes_in_chunks(d1, nodes)
    import_edges_in_chunks(d1, edges)
    
    verify_import(d1)
    console.print("\n[bold green]✨ 知识图谱全量导入 D1 成功完成！[/bold green]")


if __name__ == "__main__":
    run(force=True)
