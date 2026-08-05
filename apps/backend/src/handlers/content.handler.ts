import { Context } from 'hono';
import { Env } from '../index';
import { getGraphDataForPage } from '../services/neo4j.service';
import { getQuestionsForPage } from '../services/content.service';
import { HonoContextVariables } from '../router';

/**
 * Handler for GET /api/v1/pages/:pageNumber/companion-data
 *
 * Fetches all companion data for a given page, including knowledge graph data
 * from Neo4j and related questions from D1. It's designed to be robust:
 * if one data source fails or returns no data, it doesn't fail the entire request.
 */
export const getPageCompanionDataHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const pageParam = c.req.param('pageNumber');
  const pageNumber = parseInt(pageParam || '', 10);
  const userId = c.get('userId');

  if (isNaN(pageNumber)) {
    return c.json({ ok: false, message: 'Invalid page number provided.' }, 400);
  }

  // This check is for robustness, though authMiddleware should prevent this.
  if (!userId) {
    return c.json({ ok: false, message: 'Authentication error: User ID not found.' }, 401);
  }

  try {
    // Use Promise.allSettled to fetch from different sources concurrently.
    // This is robust because if one promise rejects, the others can still succeed.
    const [graphResult, questionsResult] = await Promise.allSettled([
      getGraphDataForPage(c.env, pageNumber),
      getQuestionsForPage(c.env, pageNumber, userId),
    ]);

    // Gracefully handle the graph data
    const graph = graphResult.status === 'fulfilled' ? graphResult.value : null;
    if (graphResult.status === 'rejected') {
      console.error('Companion data: Neo4j fetch failed:', graphResult.reason);
    }

    // Gracefully handle the questions data
    const questions = questionsResult.status === 'fulfilled' ? questionsResult.value : [];
    if (questionsResult.status === 'rejected') {
      console.error('Companion data: D1 fetch for questions failed:', questionsResult.reason);
    }

    // Construct the final response object, which will always succeed
    const responsePayload = {
      pageNumber: pageNumber,
      // This URL should ideally come from a configuration or be constructed based on your R2 bucket setup.
      pageImageUrl: `https://campbell-12e-pdf-by-pages.beikee.org/pdf-by-pages/page-${pageNumber}.pdf`,
      graph, // Will be the graph object, or null
      questions,       // Will be the questions array, or []
    };

    return c.json(responsePayload, 200);
  } catch (error: any) {
    // This is a safety net for truly unexpected errors.
    console.error(`Unexpected error in getPageCompanionDataHandler for page ${pageNumber}:`, error);
    return c.json({ ok: false, message: 'An unexpected error occurred.' }, 500);
  }
};