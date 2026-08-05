# src/utils/prompt_loader.py

import os
import logging
from pathlib import Path

# 配置标准日志记录
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


def load_prompt(prompt_name: str) -> str:
    """
    从 /src/prompts 目录加载一个 prompt 模板文件。
    V1.1: 修正了路径计算逻辑以匹配实际的文件结构。
    """
    try:
        # --- 核心修正点 ---
        # __file__ -> .../src/utils/prompt_loader.py
        # .parent -> .../src/utils/
        # .parent -> .../src/  (这就是 src 目录的根)
        src_root = Path(__file__).parent.parent

        # 现在，我们从 src 根目录开始构建 prompts 目录的路径
        prompt_dir = src_root / "prompts"
        prompt_file_path = prompt_dir / f"{prompt_name}.md"

        logging.info(f"Attempting to load prompt from: {prompt_file_path}")

        if not prompt_file_path.is_file():
            error_message = f"Prompt file not found at '{prompt_file_path}'"
            logging.error(error_message)
            raise FileNotFoundError(error_message)

        # 读取文件内容并返回
        with open(prompt_file_path, "r", encoding="utf-8") as f:
            prompt_content = f.read()

        logging.info(f"Successfully loaded prompt '{prompt_name}'.")
        return prompt_content

    except FileNotFoundError:
        raise
    except Exception as e:
        error_message = (
            f"An unexpected error occurred while loading prompt '{prompt_name}': {e}"
        )
        logging.error(error_message)
        raise Exception(error_message) from e


# ==============================================================================
#  测试模块现在也应该能正确工作
# ==============================================================================
if __name__ == "__main__":
    print("Prompt 加载器测试模块")

    # 路径计算现在与修正后的逻辑一致
    PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

    try:
        # --- 准备测试环境 ---
        print("\n--- 准备测试环境 ---")
        if not PROMPTS_DIR.exists():
            PROMPTS_DIR.mkdir()
            print(f"创建了 prompts 目录: {PROMPTS_DIR}")

        test_prompt_file = PROMPTS_DIR / "test_prompt.md"
        with open(test_prompt_file, "w", encoding="utf-8") as f:
            f.write("这是一个测试用的 Prompt。")
        print(f"创建了测试文件: {test_prompt_file}")

        # --- 测试 1: 成功加载存在的 prompt ---
        print("\n--- 测试 1: 加载存在的 Prompt ---")
        try:
            loaded_prompt = load_prompt("test_prompt")
            print("\033[92m✅ 加载成功！\033[0m")
        except Exception as e:
            print(f"\033[91m❌ 测试失败: {e}\033[0m")

        # --- 测试 2: 尝试加载不存在的 prompt ---
        print("\n--- 测试 2: 加载不存在的 Prompt ---")
        try:
            load_prompt("non_existent_prompt")
        except FileNotFoundError:
            print("\033[92m✅ 测试成功！成功捕获了 FileNotFoundError。\033[0m")

    finally:
        # --- 清理测试环境 ---
        print("\n--- 清理测试环境 ---")
        if "test_prompt_file" in locals() and test_prompt_file.exists():
            test_prompt_file.unlink()
            print(f"删除了测试文件: {test_prompt_file}")
