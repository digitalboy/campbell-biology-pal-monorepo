/**
 * Represents the content of a single textbook page, extracted and converted to Markdown.
 * This interface mirrors the structure of the `PageContent` table in the database.
 */
export interface PageContent {
  id: string;          // Unique identifier (UUID) for the record
  page_number: number; // The unique page number from the textbook
  markdown_text: string; // The page content in Markdown format
}

/**
 * Defines the payload for creating or updating (upserting) a page's content.
 * The `page_number` is used as the key for the upsert operation.
 */
export interface UpsertPageContentPayload {
  page_number: number;
  markdown_text: string;
}
