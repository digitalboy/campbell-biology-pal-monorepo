# src/clients/d1_client.py

import os
import logging
import httpx
import uuid
import json
import time
from typing import List, Dict, Any, TYPE_CHECKING
from dotenv import load_dotenv

if TYPE_CHECKING:
    from src.models.quiz_models import ValidatedQuestion

load_dotenv()
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


class D1Client:
    """
    A client to interact with the Cloudflare D1 Database HTTP API.
    This client is designed to be robust against D1's quirks, such as
    eventual consistency and specific API payload requirements.
    """

    BASE_URL = "https://api.cloudflare.com/client/v4/accounts"

    def __init__(self):
        """Initializes the D1 client, loading credentials and setting up headers."""
        self.account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
        self.api_token = os.getenv("CLOUDFLARE_API_TOKEN")
        self.database_id = os.getenv("D1_DATABASE_ID")

        if not all([self.account_id, self.api_token, self.database_id]):
            raise ValueError(
                "CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and D1_DATABASE_ID must be set in .env file"
            )

        self.api_endpoint = (
            f"{self.BASE_URL}/{self.account_id}/d1/database/{self.database_id}/query"
        )

        self.proxy = "http://127.0.0.1:7890"

        # Add cache-control headers to mitigate potential API-level caching issues.
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }
        logging.info(f"D1 Client initialized for database ID: {self.database_id} (Proxy: {self.proxy})")

    def execute_query(self, sql: str, params: List[Any] = None) -> Dict[str, Any]:
        """
        Executes a SQL query against the D1 database.
        
        备注 (经验教训): 
        在 Windows 代理环境下访问 Cloudflare D1 HTTP API 时，Cloudflare 服务器会触发 TLS Renegotiation。
        Python 内置的 ssl / httpx 模块在 Windows 上会抛出 [SSL: UNEXPECTED_EOF_WHILE_READING] 异常；
        使用 Windows 原生 curl.exe (schannel 引擎) 能原生处理 TLS 重协商并稳定返回 HTTP 200。
        """
        if params:
            payload = {"sql": sql, "params": params}
            logging.info(f"Executing D1 query: {sql[:60]}... with {len(params)} params")
        else:
            payload = {"sql": sql}
            logging.info(f"Executing D1 query: {sql[:60]}... (no params)")

        payload_json = json.dumps(payload, ensure_ascii=False)

        cmd = [
            "curl.exe", "-s",
            "-x", self.proxy,
            "-H", f"Authorization: Bearer {self.api_token}",
            "-H", "Content-Type: application/json",
            "-d", "@-",  # 通过标准输入 (stdin) 传递 payload，规避 Windows 命令行 8191 字符长度限制
            self.api_endpoint
        ]

        try:
            import subprocess
            res = subprocess.run(cmd, input=payload_json, capture_output=True, text=True, timeout=45)
            
            if res.returncode != 0:
                raise Exception(f"curl process failed with exit code {res.returncode}: {res.stderr}")

            result = json.loads(res.stdout)
            if result.get("success"):
                logging.info("D1 query executed successfully via curl.")
                return result
            else:
                errors = result.get("errors", "Unknown error")
                raise Exception(f"D1 query failed: {errors}")
        except json.JSONDecodeError:
            raise Exception(f"Failed to parse D1 response: {res.stdout}")
        except Exception as e:
            logging.error(f"An unexpected error occurred during D1 query execution: {e}")
            raise



    def ensure_page_content_table(self):
        """Ensures the PageContent table exists in the D1 database."""
        logging.info("Ensuring PageContent table exists...")
        sql = """
        CREATE TABLE IF NOT EXISTS PageContent (
            id TEXT PRIMARY KEY,
            page_number INTEGER UNIQUE NOT NULL,
            markdown_text TEXT NOT NULL
        );
        """
        try:
            self.execute_query(sql)
            logging.info("PageContent table check/creation complete.")
        except Exception as e:
            logging.error(f"Failed to ensure PageContent table: {e}")
            raise

    def get_page_by_number(self, page_number: int) -> Dict[str, Any] | None:
        """
        Retrieves a page from PageContent by its page number to check for existence.
        Uses direct SQL string formatting as it proved more reliable with the D1 API.
        """
        logging.info(f"Checking for page {page_number} in remote database...")
        sql = f"SELECT id FROM PageContent WHERE page_number = {page_number};"
        try:
            result = self.execute_query(sql, params=None)
            records = result.get("results", [])
            if records:
                logging.info(f"Page {page_number} found in remote database.")
                return records[0]
            logging.info(f"Page {page_number} not found.")
            return None
        except Exception as e:
            logging.error(f"Failed to get page {page_number}: {e}")
            raise

    def get_page_content_by_number(self, page_number: int) -> str | None:
        """
        Retrieves the markdown_text of a page by its page number.
        """
        logging.info(f"Getting content for page {page_number} from remote database...")
        sql = (
            f"SELECT markdown_text FROM PageContent WHERE page_number = {page_number};"
        )
        try:
            result = self.execute_query(sql, params=None)
            records = result.get("results", [])
            if records and "markdown_text" in records[0]:
                logging.info(f"Content for page {page_number} found.")
                return records[0]["markdown_text"]
            logging.info(f"Content for page {page_number} not found.")
            return None
        except Exception as e:
            logging.error(f"Failed to get content for page {page_number}: {e}")
            raise

    def upsert_page_content(self, page_number: int, markdown_text: str):
        """
        Inserts or replaces a page's content in the PageContent table.
        Uses direct SQL string formatting and escapes single quotes in the text.
        """
        logging.info(
            f"Upserting content for page {page_number} into remote database..."
        )
        record_id = str(uuid.uuid4())
        # Escape single quotes in markdown_text to prevent SQL syntax errors.
        escaped_text = markdown_text.replace("'", "''")
        sql = f"REPLACE INTO PageContent (id, page_number, markdown_text) VALUES ('{record_id}', {page_number}, '{escaped_text}');"
        try:
            self.execute_query(sql, params=None)
            logging.info(f"Successfully upserted page {page_number}.")
        except Exception as e:
            logging.error(f"Failed to upsert page {page_number}: {e}")
            raise

    def upsert_question(self, question: "ValidatedQuestion"):
        """
        Inserts or replaces a question in the Questions table using parameterized queries.
        """
        logging.info(
            f"Upserting question for page {question.page_number} into remote database..."
        )
        sql = "REPLACE INTO Questions (id, page_number, difficulty, question_text, options, correct_answers, explanation) VALUES (?, ?, ?, ?, ?, ?, ?);"
        try:
            params = [
                str(uuid.uuid4()),
                question.page_number,
                question.difficulty.value,
                json.dumps(question.question_text.model_dump(), ensure_ascii=False),
                json.dumps(
                    [opt.model_dump() for opt in question.options], ensure_ascii=False
                ),
                json.dumps(question.correct_answers, ensure_ascii=False),
                json.dumps(question.explanation.model_dump(), ensure_ascii=False),
            ]
            self.execute_query(sql, params=params)
            logging.info(
                f"Successfully upserted question for page {question.page_number}."
            )
        except Exception as e:
            logging.error(
                f"Failed to upsert question for page {question.page_number}: {e}"
            )
            raise

    def do_questions_exist_for_page(self, page_number: int) -> bool:
        """
        Checks if any questions exist for a given page number.
        """
        logging.info(f"Checking for existing questions for page {page_number}...")
        sql = f"SELECT 1 FROM Questions WHERE page_number = {page_number} LIMIT 1;"
        try:
            result = self.execute_query(sql, params=None)
            if result.get("results"):
                logging.info(f"Questions for page {page_number} found in D1.")
                return True
            logging.info(f"No questions found for page {page_number} in D1.")
            return False
        except Exception as e:
            logging.error(f"Failed to check for questions for page {page_number}: {e}")
            raise


# ==============================================================================
#  测试模块
# ==============================================================================
if __name__ == "__main__":
    print("D1 客户端实战测试模块")
    try:
        d1_cli = D1Client()
        print("\033[92m✅ D1 Client 初始化成功！\033[0m")

        # --- 测试 1: 创建表 ---
        print("\n--- 测试 1: 创建 Questions 表 ---")
        create_table_sql = "CREATE TABLE IF NOT EXISTS Questions (id TEXT PRIMARY KEY, page_number INTEGER NOT NULL, difficulty TEXT NOT NULL, question_text TEXT NOT NULL, options TEXT NOT NULL, correct_answers TEXT NOT NULL, explanation TEXT NOT NULL);"
        d1_cli.execute_query(sql=create_table_sql)
        print("CREATE TABLE... 命令已发送。")

        # --- 测试 2: 插入数据 (使用参数化查询) ---
        print("\n--- 测试 2: 准备并插入一条题目数据 ---")
        test_uuid = str(uuid.uuid4())
        test_question_data = {
            "id": test_uuid,
            "page_number": 192,
            "difficulty": "medium",
            "question_text": {"en": "Test question?", "zh": "测试问题？"},
            "options": [{"id": "A", "text": {"en": "Opt A", "zh": "选项A"}}],
            "correct_answers": ["A"],
            "explanation": {"en": "Explanation.", "zh": "解释。"},
        }
        insert_params = [
            test_question_data["id"],
            test_question_data["page_number"],
            test_question_data["difficulty"],
            json.dumps(test_question_data["question_text"], ensure_ascii=False),
            json.dumps(test_question_data["options"], ensure_ascii=False),
            json.dumps(test_question_data["correct_answers"], ensure_ascii=False),
            json.dumps(test_question_data["explanation"], ensure_ascii=False),
        ]
        insert_sql = "REPLACE INTO Questions (id, page_number, difficulty, question_text, options, correct_answers, explanation) VALUES (?, ?, ?, ?, ?, ?, ?);"
        d1_cli.execute_query(sql=insert_sql, params=insert_params)
        print(f"REPLACE INTO... 命令已发送，UUID: {test_uuid}")

        # --- 延迟以适应 D1 的最终一致性 ---
        wait_seconds = 5
        print(f"\n[等待 {wait_seconds} 秒以确保数据同步...]")
        time.sleep(wait_seconds)

        # --- 测试 3: 查询已插入的数据 (使用直接 SQL 字符串) ---
        print("\n--- 测试 3: 查询已插入的数据 (使用直接 SQL 字符串) ---")
        select_sql_direct = f"SELECT * FROM Questions WHERE id = '{test_uuid}';"
        result_data = d1_cli.execute_query(sql=select_sql_direct, params=None)
        print("\033[92m✅ 查询成功！\033[0m")

        question_record = result_data.get("results", [])
        if question_record:
            print("\n从数据库中取回的原始记录:")
            print(question_record[0])
        else:
            print(
                "\n\033[91m未找到指定记录。这表明即使等待后查询也失败了，可能存在网络或更深的 D1 延迟问题。\033[0m"
            )

    except Exception as e:
        print(f"\n\033[91m❌ 测试中发生错误: {e}\033[0m")
