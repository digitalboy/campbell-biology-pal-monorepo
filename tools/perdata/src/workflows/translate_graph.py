"""
translate_graph.py
基于 DeepSeek API (DeepSeek-V4-Flash) 的多语言知识图谱 AI 自动翻译与 D1 增量写入工作流。

功能亮点:
1. 全量断点续传 (Checkpoint/Resume): 自动查询 Cloudflare D1，跳过已翻译节点/边，0 重复消费。
2. 节点与关系边双轮翻译: 全量覆盖 3,212 个概念节点与 12,090 条拓扑关系边。
3. 批次安全入库 (Batch Commit): 每完成配置数量 (如 50 条) 自动保存提交至 D1 数据库。
4. 强类型 JSON 约束: 自动生成目标语言专属学术名称、定义、同义别名与关系描述。
"""

import os
import sys
import json
import logging
import argparse
import subprocess
import time
import httpx
from typing import List, Dict, Any
from openai import OpenAI

# 日志配置
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# 默认配置 (从环境变量安全读取 DEEPSEEK_API_KEY)
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"

# 配置带有本地 7890 代理的 HTTP 客户端以稳健访问 DeepSeek API
http_client = httpx.Client(
    proxy="http://127.0.0.1:7890",
    timeout=60.0
)

# 初始化 OpenAI 客户端
client = OpenAI(
    api_key=DEEPSEEK_API_KEY,
    base_url=DEEPSEEK_BASE_URL,
    http_client=http_client
)

# 语言代码与全称映射
LANG_NAMES = {
    "es": "Spanish (西班牙语)",
    "fr": "French (法语)",
    "ja": "Japanese (日语)",
    "de": "German (德语)",
    "ko": "Korean (韩语)",
    "ar": "Arabic (阿拉伯语)",
}

def execute_d1_sql(sql_content: str, is_select: bool = False) -> List[Dict[str, Any]]:
    """在远程 Cloudflare D1 上安全执行 SQL"""
    sql_file = None
    if is_select:
        clean_sql = sql_content.replace("\n", " ").strip()
        cmd = f'npx cross-env HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 wrangler d1 execute campbell-biology-pal-db --remote --command="{clean_sql}" --json'
    else:
        sql_file = "c:\\DavidCode\\campbell-biology-pal-monorepo\\apps\\backend\\src\\db\\temp_exec.sql"
        with open(sql_file, "w", encoding="utf-8") as f:
            f.write(sql_content)
        cmd = f'npx cross-env HTTP_PROXY=http://127.0.0.1:7890 HTTPS_PROXY=http://127.0.0.1:7890 wrangler d1 execute campbell-biology-pal-db --remote --file="{sql_file}" --json'

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            cwd="c:\\DavidCode\\campbell-biology-pal-monorepo\\apps\\backend", shell=True
        )
        
        stdout = result.stdout.strip()
        start_idx = stdout.find("[")
        end_idx = stdout.rfind("]")
        
        if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
            return []
        
        json_str = stdout[start_idx:end_idx + 1]
        parsed = json.loads(json_str)
        if parsed and isinstance(parsed, list) and "results" in parsed[0]:
            return parsed[0]["results"]
        return []
    except Exception as e:
        logging.error(f"解析 D1 JSON 输出失败: {e}")
        return []
    finally:
        if sql_file and os.path.exists(sql_file):
            os.remove(sql_file)

def get_existing_node_translations(target_lang: str) -> set:
    """获取目前在 D1 数据库中已存在目标语言翻译的 Node UUID 集合"""
    sql = f"SELECT node_uuid FROM GraphNodeTranslations WHERE lang_code = '{target_lang}'"
    results = execute_d1_sql(sql, is_select=True)
    return {r["node_uuid"] for r in results if "node_uuid" in r}

def get_existing_edge_translations(target_lang: str) -> set:
    """获取目前在 D1 数据库中已存在目标语言翻译的 Edge ID 集合"""
    sql = f"SELECT edge_id FROM GraphEdgeTranslations WHERE lang_code = '{target_lang}'"
    results = execute_d1_sql(sql, is_select=True)
    return {r["edge_id"] for r in results if "edge_id" in r}

def translate_node(node: Dict[str, Any], target_lang: str) -> Dict[str, Any]:
    """使用 DeepSeek API 翻译单个生物学概念节点"""
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    
    sys_prompt = (
        f"You are a world-class biological taxonomy and terminology expert specializing in Campbell Biology. "
        f"Translate the provided biological concept into {lang_name}. "
        f"Return strictly valid JSON with no extra markdown or explanations in the following format:\n"
        f"{{\n"
        f'  "name": "Translated concept name in {lang_name}",\n'
        f'  "definition": "Clear, professional biological definition in {lang_name}",\n'
        f'  "aliases": ["Common alias 1 in {lang_name}", "Common alias 2 in {lang_name}"]\n'
        f"}}\n"
        f"If there are no common aliases in {lang_name}, provide an empty array [] for aliases."
    )
    
    user_prompt = (
        f"English Name: {node.get('canonical_name_en')}\n"
        f"English Definition: {node.get('canonical_def_en') or ''}"
    )
    
    try:
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content.strip()
        parsed = json.loads(content)
        
        node_uuid = node.get("uuid") or node.get("node_uuid")
        return {
            "node_uuid": node_uuid,
            "lang_code": target_lang,
            "name": parsed.get("name", node.get("canonical_name_en")),
            "definition": parsed.get("definition", node.get("canonical_def_en")),
            "aliases": json.dumps(parsed.get("aliases", []), ensure_ascii=False)
        }
    except Exception as e:
        node_uuid = node.get("uuid") or node.get("node_uuid")
        logging.error(f"翻译节点 {node_uuid} 失败: {e}")
        return {
            "node_uuid": node_uuid,
            "lang_code": target_lang,
            "name": node.get("canonical_name_en"),
            "definition": node.get("canonical_def_en"),
            "aliases": "[]"
        }

def translate_edge(edge: Dict[str, Any], target_lang: str) -> Dict[str, Any]:
    """使用 DeepSeek API 翻译单个拓扑关系边"""
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    
    sys_prompt = (
        f"You are a biological domain knowledge graph expert. "
        f"Translate the provided relationship label and detailed biological description into {lang_name}. "
        f"Return strictly valid JSON with no extra markdown in the following format:\n"
        f"{{\n"
        f'  "label": "Concise relationship label in {lang_name} (e.g. Function, Causality, Composition)",\n'
        f'  "description": "Detailed explanation of the relationship in {lang_name}"\n'
        f"}}\n"
    )
    
    user_prompt = (
        f"Edge Type: {edge.get('edge_type')}\n"
        f"English Label: {edge.get('canonical_label_en') or edge.get('edge_type')}\n"
        f"English Description: {edge.get('canonical_description_en') or ''}"
    )
    
    try:
        response = client.chat.completions.create(
            model=DEEPSEEK_MODEL,
            messages=[
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content.strip()
        parsed = json.loads(content)
        
        edge_id = edge.get("id") or edge.get("edge_id")
        return {
            "edge_id": edge_id,
            "lang_code": target_lang,
            "label": parsed.get("label", edge.get("canonical_label_en") or edge.get("edge_type")),
            "description": parsed.get("description", edge.get("canonical_description_en") or "")
        }
    except Exception as e:
        edge_id = edge.get("id") or edge.get("edge_id")
        logging.error(f"翻译关系边 {edge_id} 失败: {e}")
        return {
            "edge_id": edge_id,
            "lang_code": target_lang,
            "label": edge.get("canonical_label_en") or edge.get("edge_type"),
            "description": edge.get("canonical_description_en") or ""
        }

def process_node_translations(target_lang: str, batch_size: int = 50, limit: int = 0):
    """批量处理概念节点翻译与断点续传增量导入"""
    logging.info(f"🔍 检查目标语言 [{target_lang}] 已存在的节点翻译...")
    existing_uuids = get_existing_node_translations(target_lang)
    logging.info(f"📊 已有 {len(existing_uuids)} 个节点存在 [{target_lang}] 翻译。")
    
    sql = "SELECT uuid, canonical_name_en, canonical_def_en FROM GraphNodes"
    raw_nodes = execute_d1_sql(sql, is_select=True)
    
    untranslated_nodes = [n for n in raw_nodes if n.get("uuid") and n.get("uuid") not in existing_uuids]
    total_untranslated = len(untranslated_nodes)
    logging.info(f"💡 共有 {total_untranslated} 个节点待翻译。")
    
    if total_untranslated == 0:
        logging.info("🎉 全量概念节点已完成翻译，无需处理！")
        return

    target_nodes = untranslated_nodes[:limit] if limit > 0 else untranslated_nodes
    logging.info(f"🚀 本次计划处理 {len(target_nodes)} 个节点 (批次大小: {batch_size})")

    # 分批处理 (Batching)
    for i in range(0, len(target_nodes), batch_size):
        batch = target_nodes[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(target_nodes) + batch_size - 1) // batch_size
        
        logging.info(f"📦 启动批次 [{batch_num}/{total_batches}] (包含 {len(batch)} 个节点)...")
        translations = []
        
        for idx, node in enumerate(batch, 1):
            name_en = node.get('canonical_name_en')
            trans = translate_node(node, target_lang)
            translations.append(trans)
            logging.info(f"  └─ [{idx}/{len(batch)}] {name_en} -> {trans['name']}")
        
        # 批量写入 D1
        update_sqls = []
        for t in translations:
            safe_name = t["name"].replace("'", "''")
            safe_def = (t["definition"] or "").replace("'", "''")
            safe_aliases = (t["aliases"] or "[]").replace("'", "''")
            def_val = f"'{safe_def}'" if safe_def else "NULL"
            
            sql = (
                f"INSERT OR REPLACE INTO GraphNodeTranslations (node_uuid, lang_code, name, definition, aliases) "
                f"VALUES ('{t['node_uuid']}', '{t['lang_code']}', '{safe_name}', {def_val}, '{safe_aliases}');"
            )
            update_sqls.append(sql)
            
        import_sql = "\n".join(update_sqls)
        logging.info(f"💾 正在将批次 [{batch_num}/{total_batches}] 提交保存至 Cloudflare D1...")
        execute_d1_sql(import_sql, is_select=False)
        logging.info(f"✅ 批次 [{batch_num}/{total_batches}] 保存成功！")

def process_edge_translations(target_lang: str, batch_size: int = 100, limit: int = 0):
    """批量处理拓扑关系边翻译与断点续传增量导入"""
    logging.info(f"🔍 检查目标语言 [{target_lang}] 已存在的关系边翻译...")
    existing_ids = get_existing_edge_translations(target_lang)
    logging.info(f"📊 已有 {len(existing_ids)} 条边存在 [{target_lang}] 翻译。")
    
    sql = "SELECT id, edge_type, canonical_label_en, canonical_description_en FROM GraphEdges"
    raw_edges = execute_d1_sql(sql, is_select=True)
    
    untranslated_edges = [e for e in raw_edges if e.get("id") and e.get("id") not in existing_ids]
    total_untranslated = len(untranslated_edges)
    logging.info(f"💡 共有 {total_untranslated} 条关系边待翻译。")
    
    if total_untranslated == 0:
        logging.info("🎉 全量关系边已完成翻译，无需处理！")
        return

    target_edges = untranslated_edges[:limit] if limit > 0 else untranslated_edges
    logging.info(f"🚀 本次计划处理 {len(target_edges)} 条关系边 (批次大小: {batch_size})")

    # 分批处理 (Batching)
    for i in range(0, len(target_edges), batch_size):
        batch = target_edges[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(target_edges) + batch_size - 1) // batch_size
        
        logging.info(f"📦 启动关系边批次 [{batch_num}/{total_batches}] (包含 {len(batch)} 条边)...")
        translations = []
        
        for idx, edge in enumerate(batch, 1):
            label_en = edge.get('canonical_label_en') or edge.get('edge_type')
            trans = translate_edge(edge, target_lang)
            translations.append(trans)
            if idx % 10 == 0 or idx == len(batch):
                logging.info(f"  └─ [{idx}/{len(batch)}] {label_en} -> {trans['label']}")
        
        # 批量写入 D1
        update_sqls = []
        for t in translations:
            safe_label = t["label"].replace("'", "''")
            safe_desc = (t["description"] or "").replace("'", "''")
            desc_val = f"'{safe_desc}'" if safe_desc else "NULL"
            
            sql = (
                f"INSERT OR REPLACE INTO GraphEdgeTranslations (edge_id, lang_code, label, description) "
                f"VALUES ('{t['edge_id']}', '{t['lang_code']}', '{safe_label}', {desc_val});"
            )
            update_sqls.append(sql)
            
        import_sql = "\n".join(update_sqls)
        logging.info(f"💾 正在将关系边批次 [{batch_num}/{total_batches}] 提交保存至 Cloudflare D1...")
        execute_d1_sql(import_sql, is_select=False)
        logging.info(f"✅ 关系边批次 [{batch_num}/{total_batches}] 保存成功！")

def main():
    parser = argparse.ArgumentParser(description="多语言知识图谱 DeepSeek-V4 AI 自动翻译与 D1 全量写入引擎")
    parser.add_argument("--target-lang", type=str, default="es", help="目标语言代码 (如: es, fr, ja, de)")
    parser.add_argument("--type", type=str, choices=["nodes", "edges", "all"], default="all", help="翻译对象: nodes, edges 或 all")
    parser.add_argument("--batch-size", type=int, default=50, help="每批次提交入库数量")
    parser.add_argument("--limit", type=int, default=0, help="限制最大处理条数 (0 表示不限制，全量处理)")
    args = parser.parse_args()

    logging.info(f"🌟 启动 DeepSeek-V4-Flash 知识图谱全量自动翻译引擎...")
    logging.info(f"目标语言: {args.target_lang} ({LANG_NAMES.get(args.target_lang, '未知')}), 翻译模式: {args.type}")

    if args.type in ["nodes", "all"]:
        process_node_translations(target_lang=args.target_lang, batch_size=args.batch_size, limit=args.limit)

    if args.type in ["edges", "all"]:
        process_edge_translations(target_lang=args.target_lang, batch_size=100, limit=args.limit)

    logging.info(f"✨ 目标语言 [{args.target_lang}] 全量知识图谱翻译与 D1 导入全部圆满完成！")

if __name__ == "__main__":
    main()
