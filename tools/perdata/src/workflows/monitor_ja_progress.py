"""
日语 (ja) 知识图谱实时翻译进度与质量监控工具
"""

import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Dict, Any, List

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

def safe_sql_str(text: str) -> str:
    if not text:
        return "''"
    return f"char({','.join(str(ord(c)) for c in text)})"

def execute_d1_sql(sql_content: str) -> List[Dict[str, Any]]:
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

def main():
    sql = (
        f"SELECT "
        f"(SELECT COUNT(*) FROM GraphNodes) AS total_nodes, "
        f"(SELECT COUNT(*) FROM GraphNodeTranslations WHERE lang_code = {safe_sql_str('ja')}) AS ja_nodes, "
        f"(SELECT COUNT(*) FROM GraphEdges) AS total_edges, "
        f"(SELECT COUNT(*) FROM GraphEdgeTranslations WHERE lang_code = {safe_sql_str('ja')}) AS ja_edges;"
    )
    res = execute_d1_sql(sql)
    if res:
        r = res[0]
        t_nodes, j_nodes = r.get("total_nodes", 0), r.get("ja_nodes", 0)
        t_edges, j_edges = r.get("total_edges", 0), r.get("ja_edges", 0)
        
        node_pct = (j_nodes / t_nodes * 100) if t_nodes > 0 else 0
        edge_pct = (j_edges / t_edges * 100) if t_edges > 0 else 0
        
        print("\n" + "=" * 65)
        print("🌟 Cloudflare D1 日语 (ja) 知识图谱翻译实时进度与质量大盘")
        print("=" * 65)
        print(f"1. 概念节点进度 (GraphNodes):      {j_nodes} / {t_nodes} ({node_pct:.2f}%) ✅")
        print(f"2. 拓扑关系边进度 (GraphEdges):     {j_edges} / {t_edges} ({edge_pct:.2f}%) 🚀")
        print(f"3. 剩余待处理关系边条数:            {t_edges - j_edges} 条")
        print("=" * 65)

if __name__ == "__main__":
    main()
