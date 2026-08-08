"""
日语 (ja) 知识图谱节点翻译法医级完整性与重复性数据质量审计工具

备注 (经验教训与规范):
1. 规避 Windows Quote Stripping Bug:
   使用 safe_sql_str() 将字符串转化成 char(...)，杜绝 Cmd/Powershell 脚本传参破坏单引号引起 'no such column: ja' 导致的误判。
2. 统一 SELECT --command 执行模式:
   D1 命令行对于 --command 模式能完备序列化结果集列表；--file 批处理模式下只返回 Meta 汇总。
"""

import json
import logging
import re
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

def safe_sql_str(text: str) -> str:
    """
    备注 (经验教训与规范):
    将文本转换为 SQLite char(...) 表达 (例如 'ja' -> char(106, 97))，
    此格式包含 0 个单引号与 0 个双引号，100% 规避 Windows 命令行单双引号被剥离导致的 D1 SQL 语法与无列报错 Bug。
    """
    if not text:
        return "''"
    return f"char({','.join(str(ord(c)) for c in text)})"

def execute_d1_sql(sql_content: str) -> List[Dict[str, Any]]:
    """在 Cloudflare D1 远程数据库安全执行 SQL"""
    cmd = [
        "npx.cmd" if sys.platform == "win32" else "npx",
        "cross-env", "HTTP_PROXY=http://127.0.0.1:7890", "HTTPS_PROXY=http://127.0.0.1:7890",
        "wrangler", "d1", "execute", "DB",
        "--remote",
        f"--command={sql_content}",
        "--json"
    ]
    
    try:
        curr_dir = Path(__file__).resolve()
        while curr_dir.name != "campbell-biology-pal-monorepo" and curr_dir.parent != curr_dir:
            curr_dir = curr_dir.parent
        backend_dir = curr_dir / "apps" / "backend"
        
        res = subprocess.run(cmd, cwd=backend_dir, capture_output=True, text=True, encoding="utf-8")
        
        stdout_str = (res.stdout or "").strip()
        start_idx = stdout_str.find('[')
        end_idx = stdout_str.rfind(']')
        if start_idx != -1 and end_idx != -1 and end_idx >= start_idx:
            json_str = stdout_str[start_idx:end_idx + 1]
            data = json.loads(json_str)
            if isinstance(data, list) and len(data) > 0:
                return data[0].get("results", [])
        return []
    except Exception as e:
        logging.error(f"❌ SQL 执行异常: {e}")
        return []

def is_japanese_text(text: str) -> bool:
    """检查文本是否包含日文平假名、片假名或汉字"""
    if not text:
        return False
    # 日文平假名: \u3040-\u309f, 片假名: \u30a0-\u30ff, CJK 汉字: \u4e00-\u9faf
    pattern = re.compile(r'[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]')
    return bool(pattern.search(text))

def run_audit():
    logging.info("🔍 开始对 Cloudflare D1 中的 日语 (ja) 节点翻译数据进行法医级质量审计...")
    
    # 1. 查基准表 GraphNodes 节点总数与数据
    sql_base = "SELECT uuid, canonical_name_en FROM GraphNodes;"
    base_nodes = execute_d1_sql(sql_base)
    total_base_count = len(base_nodes)
    base_dict = {n["uuid"]: n["canonical_name_en"] for n in base_nodes if "uuid" in n}
    logging.info(f"📌 [基准表] GraphNodes 总节点数: {total_base_count}")
    
    # 2. 查日语翻译表 GraphNodeTranslations 数据
    sql_ja = f"SELECT node_uuid, name, definition, aliases FROM GraphNodeTranslations WHERE lang_code = {safe_sql_str('ja')};"
    ja_records = execute_d1_sql(sql_ja)
    total_ja_count = len(ja_records)
    logging.info(f"📌 [翻译表] GraphNodeTranslations (lang=ja) 总翻译记录数: {total_ja_count}")
    
    # 3. 检查【主键重复性】
    uuid_occurrences: Dict[str, int] = {}
    for r in ja_records:
        uuid = r.get("node_uuid")
        if uuid:
            uuid_occurrences[uuid] = uuid_occurrences.get(uuid, 0) + 1
            
    dup_uuids = {uuid: count for uuid, count in uuid_occurrences.items() if count > 1}
    logging.info(f"🧐 [重复性审查] 存在多条翻译的主键 (node_uuid) 数量: {len(dup_uuids)}")
    if dup_uuids:
        for uuid, count in list(dup_uuids.items())[:5]:
            logging.warning(f"  ⚠️ 重复 UUID: {uuid} 出现 {count} 次")
            
    # 4. 检查【遗漏节点】
    ja_uuids = set(uuid_occurrences.keys())
    missing_uuids = set(base_dict.keys()) - ja_uuids
    logging.info(f"🧐 [遗漏性审查] 未翻译的缺失节点数量: {len(missing_uuids)}")
    if missing_uuids:
        logging.warning("⚠️ 以下为部分未完成日文翻译的遗漏节点示例:")
        for uuid in list(missing_uuids)[:10]:
            logging.warning(f"  ❌ [{uuid}] -> {base_dict.get(uuid)}")
            
    # 5. 检查【同名/译名碰撞】
    name_to_uuids: Dict[str, List[str]] = {}
    for r in ja_records:
        name = r.get("name", "").strip()
        uuid = r.get("node_uuid")
        if name and uuid:
            name_to_uuids.setdefault(name, []).append(uuid)
            
    collided_names = {name: uuids for name, uuids in name_to_uuids.items() if len(uuids) > 1}
    logging.info(f"🧐 [同名译名审查] 多个节点共享相同日文译名的碰撞组数: {len(collided_names)}")
    if collided_names:
        logging.info("💡 常见同名译名组示例 (可能属于不同生物上下文中的相同译名):")
        for name, uuids in list(collided_names.items())[:5]:
            en_names = [base_dict.get(u, "Unknown") for u in uuids]
            logging.info(f"  🔹 日文译名 '{name}' 对应 {len(uuids)} 个节点: {en_names}")

    # 6. 检查【文本质量与残留英文】
    non_ja_names = []
    empty_defs = []
    for r in ja_records:
        name = r.get("name", "").strip()
        definition = (r.get("definition") or "").strip()
        uuid = r.get("node_uuid")
        en_name = base_dict.get(uuid, "")
        
        # 判断是否包含日文字符（若纯英文且与英文名相同，则怀疑翻译残留）
        if not is_japanese_text(name):
            non_ja_names.append((uuid, en_name, name))
            
        if not definition:
            empty_defs.append((uuid, en_name, name))
            
    logging.info(f"🧐 [质量审查] 名字未包含日文字符/疑似保留英文的节点数: {len(non_ja_names)}")
    if non_ja_names:
        for uuid, en_name, ja_name in non_ja_names[:5]:
            logging.warning(f"  ⚠️ 疑似未翻译节点: [{en_name}] -> '{ja_name}'")
            
    logging.info(f"🧐 [质量审查] 释义 (definition) 为空的节点数: {len(empty_defs)}")
    
    # 7. 终极数据汇总报告
    print("\n" + "=" * 60)
    print("📊 Cloudflare D1 日语 (ja) 节点翻译完整性法医诊断总报")
    print("=" * 60)
    print(f"1. 数据库基准节点总数 (GraphNodes):         {total_base_count}")
    print(f"2. 日语翻译已录入总数 (GraphNodeTranslations): {total_ja_count}")
    print(f"3. 真实覆盖独立节点数:                        {len(ja_uuids)}")
    print(f"4. 缺失/未翻译节点数 (Missing):               {len(missing_uuids)}")
    print(f"5. 重复主键条目数 (Duplicate UUIDs):           {len(dup_uuids)}")
    print(f"6. 同名日文译名分组数 (Name Collisions):        {len(collided_names)}")
    print(f"7. 疑似纯英文/未译名称节点数 (Pure EN Names):   {len(non_ja_names)}")
    print(f"8. 空释义节点数 (Empty Definitions):           {len(empty_defs)}")
    print("=" * 60)

if __name__ == "__main__":
    run_audit()
