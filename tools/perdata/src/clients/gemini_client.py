# src/clients/gemini_client.py (V2.6 - 终极单位修正版)

import os
import logging
import httpx
from google import genai
from google.genai import types
from google.api_core import exceptions as google_api_exceptions
from pydantic import BaseModel
from typing import List, Type
from dotenv import load_dotenv


load_dotenv()
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


class GeminiClient:
    def __init__(self, timeout_seconds: int = 1800, attempts: int = 3):
        """
        初始化 Gemini 客户端。
        V2.6: 严格遵循官方文档，精确区分并使用毫秒(timeout)和秒(retry_delay)。

        Args:
            timeout_seconds (int): 所有 API 请求的全局超时时间（秒）。
            attempts (int): 最大尝试次数（包括第一次请求）。
        """
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in environment variables.")

        try:
            # --- 核心修正点: 精确区分并使用毫秒和秒 ---

            # 1. 配置原生重试，单位是秒 (seconds)
            retry_options = types.HttpRetryOptions(
                attempts=attempts,
                initial_delay=5.0,  # 初始延迟 5 秒
                max_delay=240.0,  # 最大延迟 240 秒
                exp_base=2.0,  # 指数基数
            )

            # 2. 配置超时，单位是毫秒 (milliseconds)
            timeout_milliseconds = timeout_seconds * 1000

            # 3. 组装最终的 HttpOptions
            http_options = types.HttpOptions(
                timeout=timeout_milliseconds, retry_options=retry_options
            )

            self.client = genai.Client(api_key=api_key, http_options=http_options)
            logging.info(
                f"Gemini Client initialized with native retries (attempts={attempts}) and timeout ({timeout_seconds}s / {timeout_milliseconds}ms)."
            )
        except Exception as e:
            logging.error(
                f"An unexpected error occurred during Gemini Client initialization: {e}"
            )
            raise

    def generate_structured_content_from_url(
        self,
        prompt: str,
        file_url: str,
        response_schema: Type[BaseModel] | List[Type[BaseModel]],
        model_name: str = "gemini-2.5-flash",
    ) -> List[BaseModel] | BaseModel | None:
        """
        从 URL 下载 PDF，并请求 Gemini 返回结构化 JSON。
        错误处理完全依赖于客户端初始化时配置的健壮的重试和超时机制。
        """
        # 步骤 1: 下载 PDF (保持不变)
        try:
            logging.info(f"Downloading PDF from URL: {file_url}")
            with httpx.Client() as http_client:
                response = http_client.get(
                    file_url, follow_redirects=True, timeout=30.0
                )
                response.raise_for_status()
                pdf_bytes = response.content
            logging.info("Successfully downloaded PDF.")
        except httpx.HTTPStatusError as http_err:
            logging.error(
                f"HTTP error occurred while downloading {file_url}: {http_err}"
            )
            raise

        # 步骤 2: 构建请求内容 (保持不变)
        pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
        contents = [pdf_part, prompt]
        generation_config = {
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

        # 步骤 3: 直接调用 API，不再需要手动循环或传递任何超时参数
        try:
            logging.info(
                f"Generating structured content for {file_url} (relying on SDK for retries and timeout)..."
            )

            api_response = self.client.models.generate_content(
                model=model_name, contents=contents, config=generation_config
            )

            parsed_objects = api_response.parsed
            if not parsed_objects:
                logging.warning(
                    f"Gemini response was parsed as empty by the SDK for URL: {file_url}"
                )
                return None

            logging.info(
                f"Structured content generated and parsed successfully for URL: {file_url}"
            )
            return parsed_objects

        # 捕获在所有原生重试都失败后，SDK 最终抛出的异常
        except google_api_exceptions.DeadlineExceeded as e:
            logging.error(
                f"Global client timeout was exceeded for URL: {file_url}. This page will be skipped. Error: {e}"
            )
            return None

        except google_api_exceptions.ResourceExhausted as e:
            logging.error(
                f"API rate limit hit and all retries failed for URL: {file_url}. Error: {e}"
            )
            raise

        except (
            google_api_exceptions.InternalServerError,
            google_api_exceptions.ServiceUnavailable,
        ) as e:
            logging.error(
                f"Service unavailable and all retries failed for URL: {file_url}. Error: {e}"
            )
            raise

        except Exception as e:
            logging.error(f"An unexpected, non-retryable error occurred: {e}")
            raise

    def extract_markdown_from_local_pdf(
        self, file_path: str, model_name: str = "gemini-2.5-flash"
    ) -> str | None:
        """
        从本地 PDF 文件中提取内容并以 Markdown 格式返回。
        """
        try:
            logging.info(f"Reading local PDF file: {file_path}")
            with open(file_path, "rb") as f:
                pdf_bytes = f.read()
            logging.info("Successfully read PDF file.")
        except FileNotFoundError:
            logging.error(f"File not found: {file_path}")
            return None
        except IOError as e:
            logging.error(f"Could not read file {file_path}: {e}")
            return None

        prompt = "Your task is to convert the provided PDF page into a comprehensive and well-structured Markdown document.\n\nFollow these instructions carefully:\n1.  Extract all text accurately, preserving the original structure, headings, lists, and paragraphs.\n2.  If the page contains any images, diagrams, charts, or figures, you MUST insert a descriptive placeholder in the text at the appropriate location.\n3.  The placeholder must follow this exact format: `[Image: A brief, one-sentence description of the image's content and its biological context.]`\n4.  For example, if you see a diagram of the cell cycle, you would insert: `[Image: A circular diagram illustrating the phases of the eukaryotic cell cycle, including Interphase (G1, S, G2) and the Mitotic (M) phase.]`\n\nBegin the conversion now."
        pdf_part = types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf")
        contents = [pdf_part, prompt]
        generation_config = {"response_mime_type": "text/plain"}

        try:
            logging.info(
                f"Requesting Markdown extraction for {file_path} (relying on SDK for retries and timeout)..."
            )
            api_response = self.client.models.generate_content(
                model=model_name, contents=contents, config=generation_config
            )
            
            if api_response.text:
                logging.info(f"Markdown content extracted successfully for {file_path}")
                return api_response.text
            else:
                logging.warning(f"Gemini returned an empty response for {file_path}")
                return None

        except google_api_exceptions.DeadlineExceeded as e:
            logging.error(
                f"Global client timeout was exceeded for {file_path}. This file will be skipped. Error: {e}"
            )
            return None
        except google_api_exceptions.ResourceExhausted as e:
            logging.error(
                f"API rate limit hit and all retries failed for {file_path}. Error: {e}"
            )
            return None
        except (
            google_api_exceptions.InternalServerError,
            google_api_exceptions.ServiceUnavailable,
        ) as e:
            logging.error(
                f"Service unavailable and all retries failed for {file_path}. Error: {e}"
            )
            return None
        except Exception as e:
            logging.error(f"An unexpected, non-retryable error occurred for {file_path}: {e}")
            return None

    def generate_structured_content_from_text(
        self,
        prompt: str,
        text_content: str,
        response_schema: Type[BaseModel] | List[Type[BaseModel]],
        model_name: str = "gemini-1.5-flash",
    ) -> List[BaseModel] | BaseModel | None:
        """
        Sends text content to Gemini and requests structured JSON output.
        """
        logging.info(f"Generating structured content from text (first 50 chars: '{text_content[:50]}...')")
        
        contents = [text_content, prompt]
        generation_config = {
            "response_mime_type": "application/json",
            "response_schema": response_schema,
        }

        try:
            api_response = self.client.models.generate_content(
                model=model_name, contents=contents, config=generation_config
            )
            
            parsed_objects = api_response.parsed
            if not parsed_objects:
                logging.warning("Gemini response was parsed as empty by the SDK.")
                return None

            logging.info("Structured content generated and parsed successfully from text.")
            return parsed_objects

        except google_api_exceptions.DeadlineExceeded as e:
            logging.error(f"Global client timeout was exceeded for text content. Error: {e}")
            return None
        except Exception as e:
            logging.error(f"An unexpected error occurred during text content generation: {e}")
            raise
