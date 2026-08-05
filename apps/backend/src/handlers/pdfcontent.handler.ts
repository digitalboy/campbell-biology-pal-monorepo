import { Context } from 'hono';
import { Env } from '../index';
import { HonoContextVariables } from '../router';
import { getPageContent, upsertPageContent } from '../services/pdfcontent.service';
import { UpsertPageContentPayload } from '../models/pdfcontent.models';

/**
 * Handles GET /api/v1/pdf-content/:pageNumber
 * Fetches the markdown content for a specific page.
 */
export const getPageContentHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const pageParam = c.req.param('pageNumber');
  const pageNumber = parseInt(pageParam || '', 10);

  if (isNaN(pageNumber)) {
    return c.json({ ok: false, message: 'Invalid page number provided.' }, 400);
  }

  try {
    const content = await getPageContent(c.env, pageNumber);

    if (!content) {
      return c.json({ ok: false, message: 'Content not found for the given page number.' }, 404);
    }

    return c.json({ ok: true, data: content });
  } catch (error: any) {
    console.error(`[PDF Content Handler] Error fetching content for page ${pageNumber}:`, error);
    return c.json({ ok: false, message: 'Failed to fetch page content.', error: error.message }, 500);
  }
};

/**
 * Handles PUT /api/v1/pdf-content
 * Creates or updates the markdown content for a page.
 * This is a protected route intended for admin use.
 */
export const upsertPageContentHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const payload: UpsertPageContentPayload = await c.req.json();

    if (typeof payload.page_number !== 'number' || typeof payload.markdown_text !== 'string') {
      return c.json({ ok: false, message: 'Invalid payload. page_number (number) and markdown_text (string) are required.' }, 400);
    }

    const updatedContent = await upsertPageContent(c.env, payload);

    return c.json({ ok: true, data: updatedContent }, 200);
  } catch (error: any) {
    console.error('[PDF Content Handler] Error upserting content:', error);
    return c.json({ ok: false, message: 'Failed to upsert page content.', error: error.message }, 500);
  }
};
