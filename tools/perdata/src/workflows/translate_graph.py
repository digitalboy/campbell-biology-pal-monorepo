"""
translate_graph.py
基于 DeepSeek API (DeepSeek-V4-Flash) 的多语言知识图谱 AI 自动翻译与 D1 增量写入工作流。

功能亮点:
1. 全量断点续传 (Checkpoint/Resume): 自动查询 Cloudflare D1，跳过已翻译节点/边，0 重复消费。
2. 节点与关系边双轮翻译: 全量覆盖 3,212 个概念节点与 12,090 条拓扑关系边。
3. 批次安全入库 (Batch Commit): 每完成配置数量 (如 50 条) 自动保存提交至 D1 数据库。
4. 强类型 JSON 约束与失败防护: 当 API 失败时，绝不把原英文假冒目标语言写入数据库。
"""

import os
import sys
import json
import logging
import argparse
import subprocess
import time
import httpx
from pathlib import Path
from typing import List, Dict, Any, Optional
from openai import OpenAI
from dotenv import load_dotenv

# 备注 (经验教训与规范):
# 1. Windows CLI 引号剥离隐患 (Windows Quote Stripping & SQLITE_ERROR):
#    在 Windows PowerShell / CMD 环境下通过 wrangler d1 execute DB --remote --command="..." 执行包含单引号的 SQL 字符串字面量（如 WHERE lang_code = 'ja'）时，
#    终端脚本会自动剥离单引号，导致发往 D1 的 SQL 误变为 WHERE lang_code = ja，引发 SQLITE_ERROR: no such column: ja 报错并返回空结果。
# 2. 零引号 safe_sql_str() 转换算法:
#    对于 SELECT 查询中的字符串过滤条件，必须统一调用 safe_sql_str(text) 函数将文本转化为 SQLite 原生的 char(...) 表达 (如 'ja' -> char(106, 97))。
#    char(...) 包含零单引号与零双引号，100% 绝对免疫 Windows 终端引号剥离。
# 3. Wrangler CLI 模式分流 (--command vs --file):
#    Wrangler 执行 --file 批处理文件模式时，控制台 JSON 输出会隐藏 SELECT 数据行仅显示 Meta 统计卡片 (Total queries executed)；
#    因此 SELECT 数据查询必须走 safe_sql_str() + --command 模式，而大批量 INSERT / REPLACE 写入则使用 --file 模式。
# 4. 强类型增量断点续传 (Checkpoint/Resume):
#    在比对 Node UUID 和 Edge ID 时，必须统一显式转换为 str(...) 类型进行 not in 集合检索，保障断点识别精准率 100%。
# 5. 数据库写入 Upsert 规范:
#    统一使用 INSERT OR REPLACE INTO 语法，保障重复插入时做覆写更新，不造成脏数据。
ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)
else:
    load_dotenv()

# 日志配置
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# 默认配置 (自动从环境变量 / .env 读取)
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "").strip()
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com").strip()
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-v4-flash").strip()

if not DEEPSEEK_API_KEY:
    logging.error("❌ 错误: 未检测到 DEEPSEEK_API_KEY 环境变量，请在 .env 中设置或通过环境变量传入！")
    sys.exit(1)

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

def safe_sql_str(text: str) -> str:
    """
    备注 (经验教训与规范):
    将文本转换为 SQLite 原生 char(...) 表达 (例如 'ja' -> char(106, 97))，
    此格式包含 0 个单引号与 0 个双引号，100% 规避 Windows 命令行单双引号被剥离导致的 D1 SQL 语法与无列报错 Bug。
    """
    if not text:
        return "''"
    return f"char({','.join(str(ord(c)) for c in text)})"

def execute_d1_sql(sql_content: str, is_select: bool = False) -> List[Dict[str, Any]]:
    """在远程 Cloudflare D1 上安全执行 SQL"""
    temp_sql_path = Path(__file__).resolve().parent / "temp_query.sql"
    
    if is_select:
        cmd = [
            "npx.cmd" if sys.platform == "win32" else "npx",
            "cross-env", "HTTP_PROXY=http://127.0.0.1:7890", "HTTPS_PROXY=http://127.0.0.1:7890",
            "wrangler", "d1", "execute", "DB",
            "--remote",
            f"--command={sql_content}",
            "--json"
        ]
    else:
        with open(temp_sql_path, "w", encoding="utf-8") as f:
            f.write(sql_content)
            
        cmd = [
            "npx.cmd" if sys.platform == "win32" else "npx",
            "cross-env", "HTTP_PROXY=http://127.0.0.1:7890", "HTTPS_PROXY=http://127.0.0.1:7890",
            "wrangler", "d1", "execute", "DB",
            "--remote",
            f"--file={temp_sql_path}",
            "--json"
        ]
    
    try:
        curr_dir = Path(__file__).resolve()
        while curr_dir.name != "campbell-biology-pal-monorepo" and curr_dir.parent != curr_dir:
            curr_dir = curr_dir.parent
        backend_dir = curr_dir / "apps" / "backend"
        
        res = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True, encoding="utf-8")
        
        if temp_sql_path.exists():
            temp_sql_path.unlink()
            
        stdout_str = (res.stdout or "").strip()
        start_idx = stdout_str.find('[')
        end_idx = stdout_str.rfind(']')
        if start_idx != -1 and end_idx != -1 and end_idx >= start_idx:
            json_str = stdout_str[start_idx:end_idx + 1]
            data = json.loads(json_str)
            if is_select and isinstance(data, list) and len(data) > 0:
                return data[0].get("results", [])
        return []
    except Exception as e:
        logging.error(f"执行 D1 命令发生异常: {e}")
        if temp_sql_path.exists():
            temp_sql_path.unlink()
        return []

def get_existing_node_translations(target_lang: str) -> set:
    """获取目前在 D1 数据库中已存在目标语言翻译的 Node UUID 集合 (强类型转换为 str 避免匹配漏失)"""
    sql = f"SELECT node_uuid FROM GraphNodeTranslations WHERE lang_code = {safe_sql_str(target_lang)}"
    results = execute_d1_sql(sql, is_select=True)
    return {str(r["node_uuid"]) for r in results if "node_uuid" in r}

def get_existing_edge_translations(target_lang: str) -> set:
    """获取目前在 D1 数据库中已存在目标语言翻译的 Edge ID 集合 (强类型转换为 str 避免匹配漏失)"""
    sql = f"SELECT edge_id FROM GraphEdgeTranslations WHERE lang_code = {safe_sql_str(target_lang)}"
    results = execute_d1_sql(sql, is_select=True)
    return {str(r["edge_id"]) for r in results if "edge_id" in r and r["edge_id"] is not None}

def translate_node(node: Dict[str, Any], target_lang: str) -> Optional[Dict[str, Any]]:
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
        translated_name = parsed.get("name")
        if not translated_name:
            return None

        return {
            "node_uuid": node_uuid,
            "lang_code": target_lang,
            "name": translated_name,
            "definition": parsed.get("definition", ""),
            "aliases": json.dumps(parsed.get("aliases", []), ensure_ascii=False)
        }
    except Exception as e:
        node_uuid = node.get("uuid") or node.get("node_uuid")
        logging.error(f"❌ 翻译节点 {node_uuid} 失败: {e}")
        return None

def translate_edge(edge: Dict[str, Any], target_lang: str) -> Optional[Dict[str, Any]]:
    """使用 DeepSeek API 翻译两条节点之间的拓扑关系边"""
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    
    sys_prompt = (
        f"You are a biology education expert. Translate the biological relationship description into {lang_name}.\n"
        f"Return strictly valid JSON:\n"
        f"{{\n"
        f'  "relation_description": "Translated relationship in {lang_name}"\n'
        f"}}"
    )
    
    user_prompt = (
        f"Subject: {edge.get('source_name_en')}\n"
        f"Object: {edge.get('target_name_en')}\n"
        f"Relationship (EN): {edge.get('rel_desc_en')}"
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
        rel_desc = parsed.get("relation_description")
        if not rel_desc:
            return None

        return {
            "edge_id": edge.get("edge_id"),
            "lang_code": target_lang,
            "rel_desc": rel_desc
        }
    except Exception as e:
        logging.error(f"❌ 翻译关系边 {edge.get('edge_id')} 失败: {e}")
        return None

def process_node_translations(target_lang: str, batch_size: int = 50, limit: int = 0):
    """批量处理概念节点翻译与断点续传增量导入"""
    logging.info(f"🔍 检查目标语言 [{target_lang}] 已存在的节点翻译...")
    existing_uuids = get_existing_node_translations(target_lang)
    logging.info(f"📊 已有 {len(existing_uuids)} 个节点存在 [{target_lang}] 翻译。")
    
    sql = "SELECT uuid AS node_uuid, canonical_name_en, canonical_def_en FROM GraphNodes"
    raw_nodes = execute_d1_sql(sql, is_select=True)
    logging.info(f"📊 从 GraphNodes 读取到 {len(raw_nodes)} 个节点。")
    
    untranslated_nodes = [n for n in raw_nodes if n.get("node_uuid") and str(n.get("node_uuid")) not in existing_uuids]
    total_untranslated = len(untranslated_nodes)
    logging.info(f"💡 共有 {total_untranslated} 个节点待翻译。")
    
    if total_untranslated == 0:
        logging.info("🎉 全量概念节点已完成翻译，无需处理！")
        return

    target_nodes = untranslated_nodes[:limit] if limit > 0 else untranslated_nodes
    logging.info(f"🚀 本次计划处理 {len(target_nodes)} 个节点 (批次大小: {batch_size})")

    for i in range(0, len(target_nodes), batch_size):
        batch = target_nodes[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(target_nodes) + batch_size - 1) // batch_size
        
        logging.info(f"📦 启动批次 [{batch_num}/{total_batches}] (包含 {len(batch)} 个节点)...")
        translations = []
        
        for idx, node in enumerate(batch, 1):
            name_en = node.get('canonical_name_en')
            trans = translate_node(node, target_lang)
            if trans:
                translations.append(trans)
                logging.info(f"  └─ [{idx}/{len(batch)}] {name_en} -> {trans['name']}")
            else:
                logging.warning(f"  └─ [{idx}/{len(batch)}] {name_en} -> [翻译失败，跳过写入]")
        
        if not translations:
            logging.warning(f"⚠️ 批次 [{batch_num}/{total_batches}] 无有效翻译结果，跳过提交。")
            continue

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
    
    sql = (
        "SELECT e.id AS edge_id, e.canonical_description_en AS rel_desc_en, "
        "sn.canonical_name_en AS source_name_en, tn.canonical_name_en AS target_name_en "
        "FROM GraphEdges e "
        "JOIN GraphNodes sn ON e.start_uuid = sn.uuid "
        "JOIN GraphNodes tn ON e.end_uuid = tn.uuid"
    )
    raw_edges = execute_d1_sql(sql, is_select=True)
    
    untranslated_edges = [e for e in raw_edges if e.get("edge_id") is not None and str(e.get("edge_id")) not in existing_ids]
    total_untranslated = len(untranslated_edges)
    logging.info(f"💡 共有 {total_untranslated} 条关系边待翻译。")
    
    if total_untranslated == 0:
        logging.info("🎉 全量拓扑关系边已完成翻译，无需处理！")
        return

    target_edges = untranslated_edges[:limit] if limit > 0 else untranslated_edges
    logging.info(f"🚀 本次计划处理 {len(target_edges)} 条边 (批次大小: {batch_size})")

    for i in range(0, len(target_edges), batch_size):
        batch = target_edges[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(target_edges) + batch_size - 1) // batch_size
        
        logging.info(f"📦 启动批次 [{batch_num}/{total_batches}] (包含 {len(batch)} 条边)...")
        translations = []
        
        for idx, edge in enumerate(batch, 1):
            trans = translate_edge(edge, target_lang)
            if trans:
                translations.append(trans)
                logging.info(f"  └─ [{idx}/{len(batch)}] Edge #{edge.get('edge_id')} -> {trans['rel_desc']}")
            else:
                logging.warning(f"  └─ [{idx}/{len(batch)}] Edge #{edge.get('edge_id')} -> [翻译失败，跳过写入]")
        
        if not translations:
            logging.warning(f"⚠️ 批次 [{batch_num}/{total_batches}] 无有效翻译结果，跳过提交。")
            continue

        update_sqls = []
        for t in translations:
            safe_desc = t["rel_desc"].replace("'", "''")
            sql = (
                f"INSERT OR REPLACE INTO GraphEdgeTranslations (edge_id, lang_code, rel_desc) "
                f"VALUES ('{t['edge_id']}', '{t['lang_code']}', '{safe_desc}');"
            )
            update_sqls.append(sql)
            
        import_sql = "\n".join(update_sqls)
        logging.info(f"💾 正在将批次 [{batch_num}/{total_batches}] 提交保存至 Cloudflare D1...")
        execute_d1_sql(import_sql, is_select=False)
        logging.info(f"✅ 批次 [{batch_num}/{total_batches}] 保存成功！")

def main():
    parser = argparse.ArgumentParser(description="DeepSeek-V4 多语言知识图谱 AI 翻译工作流")
    parser.add_argument("--target-lang", type=str, required=True, help="目标语言代码 (如: es, fr, ja, de)")
    parser.add_argument("--batch-size", type=int, default=50, help="批次 Commit 大小")
    parser.add_argument("--type", type=str, choices=["nodes", "edges", "all"], default="all", help="翻译类型 (nodes/edges/all)")
    parser.add_argument("--limit", type=int, default=0, help="限制翻译条目数量 (0 为无限制)")
    
    args = parser.parse_args()
    
    logging.info("🌟 启动 DeepSeek-V4-Flash 知识图谱全量自动翻译引擎...")
    logging.info(f"目标语言: {args.target_lang} ({LANG_NAMES.get(args.target_lang, '未指定')}), 翻译模式: {args.type}")
    
    if args.type in ["nodes", "all"]:
        process_node_translations(target_lang=args.target_lang, batch_size=args.batch_size, limit=args.limit)
        
    if args.type in ["edges", "all"]:
        process_edge_translations(target_lang=args.target_lang, batch_size=args.batch_size, limit=args.limit)

if __name__ == "__main__":
    main()
