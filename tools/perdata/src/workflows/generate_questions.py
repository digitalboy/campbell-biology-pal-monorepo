
import logging
from pydantic import ValidationError

from src.clients.gemini_client import GeminiClient
from src.clients.d1_client import D1Client
from src.utils.prompt_loader import load_prompt
from src.models.quiz_models import GeminiQuestionSchema, ValidatedQuestion

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)

def run(start_page: int, end_page: int, force: bool = False):
    """
    For a given page range, fetches content from the D1 `PageContent` table,
    generates questions, and upserts them directly into the D1 `Questions` table.

    Args:
        start_page (int): The starting page number.
        end_page (int): The ending page number.
        force (bool): If True, re-generates questions even if they already exist.
    """
    logging.info(
        f"--- Starting direct-to-database question generation for pages {start_page}-{end_page} ---"
    )
    if force:
        logging.warning("FORCE mode enabled. All pages will be re-processed.")

    try:
        gemini_client = GeminiClient()
        d1_client = D1Client()
        prompt = load_prompt("generate_questions")
    except Exception as e:
        logging.error(f"Failed to initialize clients or load prompt. Aborting. Error: {e}")
        return

    successful_pages = 0
    failed_pages = []
    skipped_pages = 0
    total_questions_generated = 0

    for page_number in range(start_page, end_page + 1):
        questions_on_page = 0
        try:
            logging.info(f"--- Processing page {page_number}... ---")

            # Step 1: Check if questions for this page already exist in D1
            if not force and d1_client.do_questions_exist_for_page(page_number):
                logging.info(f"Questions for page {page_number} already exist. Skipping.")
                skipped_pages += 1
                continue
            
            # Step 2: Fetch page content from D1
            markdown_content = d1_client.get_page_content_by_number(page_number)
            if not markdown_content:
                logging.warning(f"No content found for page {page_number} in D1. Skipping.")
                failed_pages.append(page_number)
                continue

            # Step 3: Generate structured questions from the text content
            gemini_output = gemini_client.generate_structured_content_from_text(
                prompt=prompt,
                text_content=markdown_content,
                response_schema=list[GeminiQuestionSchema],
                model_name="gemini-1.5-flash",
            )

            if not gemini_output:
                logging.warning(f"Gemini returned no valid data for page {page_number}. Skipping.")
                failed_pages.append(page_number)
                continue

            # Step 4: Validate, inject page number, and upsert each question to D1
            for question_from_ai in gemini_output:
                try:
                    q_dict = question_from_ai.model_dump()
                    q_dict["page_number"] = page_number # Enforce correct page number

                    final_question = ValidatedQuestion.model_validate(q_dict)
                    
                    d1_client.upsert_question(final_question)
                    questions_on_page += 1

                except ValidationError as e:
                    logging.error(f"Validation failed for a question on page {page_number}. Error: {e}")
                except Exception as e:
                    logging.error(f"Failed to upsert question for page {page_number}. Error: {e}")
            
            if questions_on_page > 0:
                logging.info(f"Successfully generated and upserted {questions_on_page} questions for page {page_number}.")
                total_questions_generated += questions_on_page
                successful_pages += 1
            else:
                logging.warning(f"No questions were successfully generated or upserted for page {page_number}.")
                failed_pages.append(page_number)

        except Exception as e:
            logging.error(f"--- Failed to process page {page_number}. Error: {e} ---")
            failed_pages.append(page_number)
            continue

    logging.info("--- Batch question generation finished ---")
    logging.info(f"Total new questions generated and upserted: {total_questions_generated}")
    logging.info(f"Successfully processed pages: {successful_pages}")
    logging.info(f"Skipped pages (already had questions): {skipped_pages}")
    if failed_pages:
        unique_failed_pages = sorted(list(set(failed_pages)))
        logging.warning(f"Failed to process pages: {len(unique_failed_pages)}")
        logging.warning(f"Failed page numbers: {unique_failed_pages}")
