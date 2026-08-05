# src/clients/neo4j_client.py

import os
import logging
from neo4j import GraphDatabase, exceptions
from typing import List, Dict, Any
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_fixed, retry_if_exception_type

# 在模块加载时就执行加载 .env
load_dotenv()

# 配置标准日志记录
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class Neo4jClient:
    """
    一个用于与 Neo4j AuraDB 数据库进行交互的客户端。
    经过优化以处理常见的云连接问题。
    """

    def __init__(self):
        """
        初始化 Neo4j 客户端，并建立与数据库的连接。
        """
        self.uri = os.getenv("NEO4J_URI")
        self.user = os.getenv("NEO4J_USERNAME", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD")

        if not all([self.uri, self.user, self.password]):
            error_message = ("Failed to initialize Neo4jClient. Ensure 'NEO4J_URI', "
                           "'NEO4J_USERNAME', and 'NEO4J_PASSWORD' are set in your environment.")
            logging.error(error_message)
            raise ValueError(error_message)

        self.driver = None  # 先初始化为 None
        try:
            # 严格遵循官方样例，直接创建驱动程序
            # max_connection_lifetime 参数有助于保持连接活跃，防止因长时间不活动而被网络设备关闭。
            # 对于 AuraDB，建议设置为小于其空闲超时时间的值，例如 3000 秒 (50 分钟)。
            self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password), max_connection_lifetime=3000)
            # 验证连接性，这是最可能抛出异常的地方
            self.driver.verify_connectivity()
            logging.info(f"Neo4j Client initialized and connected to database at: {self.uri}")
        except exceptions.ServiceUnavailable as e:
            # 捕获最常见的连接错误，并给出具体的建议
            logging.error(f"Could not connect to Neo4j at {self.uri}. "
                          f"This might be a DNS or firewall issue. Error: {e}")
            raise ConnectionError("Unable to connect to Neo4j. Please check your network connection, "
                                  "firewall settings (ensure port 7687 is open), and the NEO4J_URI.") from e
        except exceptions.AuthError as auth_err:
            logging.error(f"Neo4j authentication failed: {auth_err}")
            raise
        except Exception as e:
            logging.error(f"An unexpected error occurred while connecting to Neo4j: {e}")
            raise

    def close(self):
        """
        安全地关闭与数据库的连接。
        """
        if self.driver:
            self.driver.close()
            logging.info("Neo4j connection closed.")

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2), retry=retry_if_exception_type(exceptions.ServiceUnavailable))
    def execute_query(self, cypher_query: str, parameters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        """
        在一个托管事务中执行一条 Cypher 查询。
        Neo4j 驱动程序会自动处理读/写事务的选择。
        此方法可以同时处理读和写操作，并返回读操作的结果。

        Args:
            cypher_query (str): 要执行的 Cypher 语句。
            parameters (Dict[str, Any], optional): 查询中使用的参数字典。默认为 None。

        Returns:
            List[Dict[str, Any]]: 对于读查询，返回结果列表。对于写查询，通常返回空列表。
        """
        logging.info(f"Executing Neo4j query: {cypher_query[:100]}...")
        try:
            # 使用 `driver.execute_query` 是一个更现代、更简洁的方式，它能自动管理会话和事务
            records, summary, keys = self.driver.execute_query(
                cypher_query,
                parameters or {},
                database_="neo4j" # 对于 AuraDB, 数据库名通常是 "neo4j"
            )
            logging.info(f"Query executed successfully. Consumed {summary.counters.nodes_created} nodes, "
                         f"returned {len(records)} records.")
            return [record.data() for record in records]
        except Exception as e:
            logging.error(f"An error occurred during Neo4j query execution: {e}")
            raise
            
# ==============================================================================
#  该文件可独立运行以进行快速测试
# ==============================================================================
if __name__ == '__main__':
    print("Neo4j 客户端测试模块")
    neo4j_cli = None
    try:
        neo4j_cli = Neo4jClient()
        print("\033[92m✅ Neo4j Client 初始化并连接成功！\033[0m")

        # --- 测试 1: 清理测试数据 ---
        print("\n--- 测试 1: 清理旧的测试数据 ---")
        cleanup_query = "MATCH (n:TestNode) DETACH DELETE n"
        neo4j_cli.execute_query(cleanup_query)
        print("MATCH (n:TestNode)... 命令已发送。")
        
        # --- 测试 2: 创建节点和关系 ---
        print("\n--- 测试 2: 创建测试节点和关系 ---")
        create_query = """
        MERGE (p1:TestNode {id: $id1, name: $name1})
        MERGE (p2:TestNode {id: $id2, name: $name2})
        MERGE (p1)-[:KNOWS {since: $since}]->(p2)
        """
        test_params = {
            "id1": "test001", "name1": "Test Alice",
            "id2": "test002", "name2": "Test Bob",
            "since": 2025
        }
        neo4j_cli.execute_query(create_query, parameters=test_params)
        print("MERGE... 命令已发送。")

        # --- 测试 3: 查询数据 ---
        print("\n--- 测试 3: 查询创建的数据 ---")
        read_query = "MATCH (a:TestNode)-[r:KNOWS]->(b:TestNode) WHERE a.id = $id RETURN a.name AS Person1, b.name AS Person2, r.since AS KnownSince"
        results = neo4j_cli.execute_query(read_query, parameters={"id": "test001"})
        
        print("\033[92m✅ 查询成功！\033[0m")
        if results:
            print(f"找到了 {len(results)} 条记录:")
            for record in results:
                print(record)
        else:
            print("未找到任何记录。")

    except ValueError as ve:
        print(f"\n\033[91m❌ 配置错误: {ve}\033[0m")
    except ConnectionError as ce:
         print(f"\n\033[91m❌ 连接错误: {ce}\033[0m")
    except Exception as e:
        print(f"\n\033[91m❌ 测试中发生未知错误: {e}\033[0m")
    finally:
        if neo4j_cli:
            neo4j_cli.close()