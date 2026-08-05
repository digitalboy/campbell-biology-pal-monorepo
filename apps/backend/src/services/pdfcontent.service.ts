import { Env } from '../index';
import { PageContent, UpsertPageContentPayload } from '../models/pdfcontent.models';

/**
 * Retrieves the markdown content for a specific page number.
 * @param env The environment object containing the DB binding.
 * @param pageNumber The page number to fetch content for.
 * @returns A promise that resolves to the PageContent object or null if not found.
 */
export async function getPageContent(env: Env, pageNumber: number): Promise<PageContent | null> {
  const stmt = env.DB.prepare(
    'SELECT * FROM PageContent WHERE page_number = ?'
  );
  const content = await stmt.bind(pageNumber).first<PageContent>();
  return content;
}

/**
 * Creates or updates the content for a specific page.
 * This is an idempotent "upsert" operation.
 * @param env The environment object containing the DB binding.
 * @param payload The data for the page content.
 * @returns A promise that resolves to the created or updated PageContent object.
 */
export async function upsertPageContent(env: Env, payload: UpsertPageContentPayload): Promise<PageContent> {
  const { page_number, markdown_text } = payload;
  const id = crypto.randomUUID(); // Generate a new UUID for potential insertion.

  const stmt = env.DB.prepare(
    `INSERT INTO PageContent (id, page_number, markdown_text)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(page_number) DO UPDATE SET
       markdown_text = excluded.markdown_text`
  );

  await stmt.bind(id, page_number, markdown_text).run();

  // After upserting, fetch the definitive record to return it.
  // This ensures we get the correct ID if the record already existed.
  const updatedContent = await getPageContent(env, page_number);
  if (!updatedContent) {
    // This should not happen in a normal flow
    throw new Error('Failed to retrieve content after upsert.');
  }
  return updatedContent;
}
