
import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- 配置 ---
# 从 .env 文件或直接在这里设置基础 URL
# 为了简单起见，我们直接使用您 .env 文件中的值
BASE_URL = "https://campbell-12e-pdf-by-pages.beikee.org/pdf-by-pages/"
OUTPUT_DIR = "pdfs"
MAX_CONCURRENT_DOWNLOADS = 10  # 并发下载数
START_PAGE = 1
MAX_PAGE_GUESS = 2000 # 先假设一个比较大的总页数，比如2000页

# --- 函数定义 ---

def download_pdf(page_number):
    """下载单个 PDF 文件"""
    file_name = f"page-{page_number}.pdf"
    url = f"{BASE_URL}{file_name}"
    save_path = os.path.join(OUTPUT_DIR, file_name)

    try:
        response = requests.get(url, stream=True, timeout=30)
        # 如果遇到 404 或其他客户端/服务器错误，requests 不会抛出异常，但会记录在 status_code 中
        if response.status_code == 404:
            # 这是我们预期的循环终止条件
            return page_number, "Not Found"
        
        response.raise_for_status()  # 对其他错误状态码 (如 500, 403) 抛出异常

        with open(save_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return page_number, "Success"
    except requests.exceptions.RequestException as e:
        # 处理网络相关的其他异常
        return page_number, f"Failed: {e}"

def download_all_pdfs():
    """
    并发下载所有 PDF 页面，直到遇到第一个 404 Not Found。
    """
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"创建目录: {OUTPUT_DIR}")

    # 我们使用线程池来并发下载
    # ThreadPoolExecutor 在 I/O 密集型任务（如网络请求）中表现很好
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT_DOWNLOADS) as executor:
        
        print(f"开始从第 {START_PAGE} 页下载，最多尝试到 {MAX_PAGE_GUESS} 页...")
        
        # 提交所有下载任务
        future_to_page = {executor.submit(download_pdf, page): page for page in range(START_PAGE, MAX_PAGE_GUESS + 1)}
        
        first_not_found_page = float('inf')

        # 按完成顺序处理结果
        for future in as_completed(future_to_page):
            page = future_to_page[future]
            try:
                _, status = future.result()
                if status == "Success":
                    print(f"  [成功] 页面 {page} 已下载。 সন")
                elif status == "Not Found":
                    print(f"  [停止] 页面 {page} 未找到 (404)。假定这是最后一页。")
                    # 记录第一个未找到的页面
                    if page < first_not_found_page:
                        first_not_found_page = page
                    # 一旦找到404，我们可以开始取消其他更高页码的任务
                    for fut in future_to_page:
                        p = future_to_page[fut]
                        if p > page:
                            fut.cancel() # 尝试取消未来的任务
                else:
                    print(f"  [失败] 页面 {page} 下载失败: {status}")

            except Exception as exc:
                print(f"  [异常] 页面 {page} 下载时产生异常: {exc}")

    print("\n--------------------------------------------------")
    if first_not_found_page != float('inf'):
        print(f"下载完成。脚本在第 {first_not_found_page} 页停止。")
        print(f"所有已成功下载的 PDF 文件都保存在 '{OUTPUT_DIR}/' 目录下。")
    else:
        print(f"下载尝试完成。似乎已达到猜测的最大页数 ({MAX_PAGE_GUESS})。")
        print("如果书籍页数超过这个值，请增大脚本中的 MAX_PAGE_GUESS。")
    print("--------------------------------------------------\n")


# --- 主程序入口 ---
if __name__ == "__main__":
    download_all_pdfs()
