import os
import glob
import logging
import re
import sys
import json

# Add project root to the Python path
project_root = os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)
sys.path.append(project_root)

from src.clients.gemini_client import GeminiClient
from src.clients.d1_client import D1Client

# --- Configuration ---
PDF_DIRECTORY = os.path.join(project_root, "pdfs")
LOG_FILE = os.path.join(project_root, "output", "pdf_processing.log")
# 新增：本地处理状态日志文件，用于跟踪已成功处理的页面
STATUS_FILE = os.path.join(project_root, "output", "pdf_processing_status.json")


# --- Logging Setup ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.FileHandler(LOG_FILE, mode="w"), logging.StreamHandler()],
)

# --- 本地状态文件读写辅助函数 ---


def load_processed_pages(filepath: str) -> set:
    """从本地 JSON 文件加载已成功处理的页面编号集合。"""
    if not os.path.exists(filepath):
        return set()
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
            if (
                isinstance(data, dict)
                and "processed_pages" in data
                and isinstance(data["processed_pages"], list)
            ):
                return set(data["processed_pages"])
            else:
                logging.warning(f"状态文件 {filepath} 格式不正确，将视为空文件。")
                return set()
    except (json.JSONDecodeError, IOError) as e:
        logging.warning(f"无法读取或解析状态文件 {filepath}，将视为空文件。错误: {e}")
        return set()


def save_processed_page(filepath: str, page_number: int):
    """将新处理完成的页面编号安全地写入本地 JSON 状态文件。"""
    # 总是先读取现有集合，再添加新页面，以保证操作的原子性
    pages_set = load_processed_pages(filepath)
    pages_set.add(page_number)
    try:
        with open(filepath, "w", encoding="utf-8") as f:
            # 为了可读性和版本控制的友好性，保存时进行排序
            json.dump({"processed_pages": sorted(list(pages_set))}, f, indent=4)
    except IOError as e:
        logging.error(f"无法写入状态文件 {filepath}。错误: {e}")


def extract_page_number(filename):
    """Extracts the page number from a filename like 'page-123.pdf'."""
    match = re.search(r"page-(\d+)\.pdf$", filename)
    if match:
        return int(match.group(1))
    return None


def process_all_pdfs(force: bool = False):
    """
    遍历所有 PDF，使用 Gemini 提取内容，并存入远程 D1 数据库。
    现在使用本地 JSON 文件来跟踪已处理的页面，以避免 D1 的最终一致性问题。

    Args:
        force (bool): 如果为 True，将忽略本地状态文件，重新处理所有页面。
    """
    logging.info(
        "Starting PDF processing workflow (using local status file for checks)..."
    )
    if force:
        logging.warning(
            "FORCE mode enabled. All pages will be re-processed and local status will be ignored."
        )

    try:
        gemini = GeminiClient()
        d1 = D1Client()
        d1.ensure_page_content_table()
    except Exception as e:
        logging.error(
            f"Failed to initialize clients or database table. Aborting. Error: {e}"
        )
        return

    # --- 核心修改：从本地文件加载状态 ---
    if force and os.path.exists(STATUS_FILE):
        try:
            os.remove(STATUS_FILE)
            logging.info(f"Cleared old local status file: {STATUS_FILE}")
        except OSError as e:
            logging.error(f"Could not remove status file {STATUS_FILE}: {e}")

    processed_pages = set() if force else load_processed_pages(STATUS_FILE)
    if not force:
        logging.info(
            f"Loaded {len(processed_pages)} processed pages from local status file."
        )

    pdf_files = glob.glob(os.path.join(PDF_DIRECTORY, "page-*.pdf"))

    if not pdf_files:
        logging.warning(f"No PDF files found in {PDF_DIRECTORY}. Nothing to process.")
        return

    logging.info(f"Found {len(pdf_files)} PDF files to process.")

    sorted_files = sorted(
        pdf_files, key=lambda x: extract_page_number(os.path.basename(x)) or 0
    )

    for pdf_path in sorted_files:
        filename = os.path.basename(pdf_path)
        page_number = extract_page_number(filename)

        if page_number is None:
            logging.warning(f"Could not extract page number from {filename}. Skipping.")
            continue

        logging.info(f"--- Processing Page: {page_number} ({filename}) ---")

        try:
            # --- 核心修改：使用本地集合进行检查 ---
            if not force and page_number in processed_pages:
                logging.info(
                    f"Page {page_number} already processed (according to local status file). Skipping."
                )
                continue

            markdown_content = gemini.extract_markdown_from_local_pdf(pdf_path)

            if markdown_content:
                d1.upsert_page_content(page_number, markdown_content)
                logging.info(
                    f"Successfully processed and saved page {page_number} to remote D1 DB."
                )

                # --- 核心修改：更新本地状态文件 ---
                save_processed_page(STATUS_FILE, page_number)
                processed_pages.add(page_number)  # 保持内存中的集合同步
                logging.info(f"Updated local status file with page {page_number}.")
            else:
                logging.warning(
                    f"Failed to extract content for page {page_number}. It might be empty or an error occurred."
                )

        except Exception as e:
            logging.error(
                f"An unexpected error occurred while processing page {page_number}: {e}"
            )

    logging.info("--- PDF processing workflow finished. ---")


if __name__ == "__main__":
    # 运行示例。在实际使用中，此脚本由 main.py 通过 Typer 调用。
    # 将 force 设置为 False 以使用本地状态文件进行跳过。
    # 将 force 设置为 True 以强制重新处理所有内容。
    process_all_pdfs(force=False)
