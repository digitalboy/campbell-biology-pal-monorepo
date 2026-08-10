import { Context } from 'hono';
import { Env } from '../index';
import { getGraphDataForPageFromD1 } from '../services/graph.service';
import { getQuestionsForPage } from '../services/content.service';
import { HonoContextVariables } from '../router';

/**
 * Handler for GET /api/v1/pages/:pageNumber/companion-data
 *
 * Fetches all companion data for a given page, including knowledge graph data
 * from Cloudflare D1 and related questions from D1.
 */
export const getPageCompanionDataHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const pageParam = c.req.param('pageNumber');
  const pageNumber = parseInt(pageParam || '', 10);
  const userId = c.get('userId') || '';

  if (isNaN(pageNumber)) {
    return c.json({ ok: false, message: 'Invalid page number provided.' }, 400);
  }

  try {
    const [graphResult, questionsResult] = await Promise.allSettled([
      getGraphDataForPageFromD1(c.env, pageNumber),
      getQuestionsForPage(c.env, pageNumber, userId),
    ]);

    const graph = graphResult.status === 'fulfilled' ? graphResult.value : null;
    if (graphResult.status === 'rejected') {
      console.error('Companion data: D1 graph fetch failed:', graphResult.reason);
    }

    const questions = questionsResult.status === 'fulfilled' ? questionsResult.value : [];
    if (questionsResult.status === 'rejected') {
      console.error('Companion data: D1 fetch for questions failed:', questionsResult.reason);
    }

    const responsePayload = {
      pageNumber: pageNumber,
      pageImageUrl: `https://campbell-12e-pdf-by-pages.beikee.org/pdf-by-pages/page-${pageNumber}.pdf`,
      graph,
      questions,
    };

    return c.json(responsePayload, 200);
  } catch (error: any) {
    console.error(`Unexpected error in getPageCompanionDataHandler for page ${pageNumber}:`, error);
    return c.json({ ok: false, message: 'An unexpected error occurred.' }, 500);
  }
};