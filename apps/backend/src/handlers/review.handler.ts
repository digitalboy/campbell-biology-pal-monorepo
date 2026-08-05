import { Context } from 'hono';
import { Env } from '../index';
import { getDueReviewQuestions, getWronglyAnsweredQuestions } from '../services/review.service';
import { DueReviewsResponse } from '../models/review.models';
import { HonoContextVariables } from '../router';

/**
 * Handles the request to get all due review questions for the authenticated user.
 */
export const getDueReviewsHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    // The user ID is extracted from the context, where it was placed by the authMiddleware.
    const userId = c.get('userId');

    if (!userId) {
      // This case should theoretically not be reached if authMiddleware is working correctly.
      return c.json({ ok: false, message: 'Authentication error: User ID not found in context.' }, 401);
    }

    const dueQuestions = await getDueReviewQuestions(c.env, userId);

    const response: DueReviewsResponse = {
      due_questions: dueQuestions,
    };

    return c.json({ ok: true, data: response });
  } catch (error: any) {
    console.error('Error fetching due reviews:', error);
    return c.json({ ok: false, message: 'Failed to fetch due reviews.' }, 500);
  }
};

/**
 * Handles the request to get all questions the user has answered incorrectly.
 */
export const getWrongAnswersHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ ok: false, message: 'Authentication error: User ID not found in context.' }, 401);
    }

    // Extract optional query parameters for time range
    const startDate = c.req.query('startDate'); // e.g., '2023-01-01T00:00:00Z'
    const endDate = c.req.query('endDate');   // e.g., '2023-01-31T23:59:59Z'

    const wrongQuestions = await getWronglyAnsweredQuestions(c.env, userId, startDate, endDate);
    return c.json({ ok: true, data: { wrong_answers: wrongQuestions } });
  } catch (error: any) {
    console.error('Error fetching wrong answers:', error);
    return c.json({ ok: false, message: 'Failed to fetch wrong answers.', error: error.message }, 500);
  }
};
