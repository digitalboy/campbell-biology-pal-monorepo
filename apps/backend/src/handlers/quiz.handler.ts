import { Context } from 'hono';
import { Env } from '../index';
import { QuizSubmissionPayload } from '../models/quiz.models';
import { processAnswerSubmission } from '../services/quiz.service';
import { HonoContextVariables } from '../router';

/**
 * Handles the submission of a quiz answer.
 */
export const submitAnswerHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const questionId = c.req.param('questionId');
  const userId = c.get('userId');

  if (!questionId) {
    return c.json({ ok: false, message: 'Invalid or missing question ID.' }, 400);
  }

  if (!userId) {
    // This case should not be reached if authMiddleware is working correctly.
    return c.json({ ok: false, message: 'Authentication error: User ID not found in context.' }, 401);
  }

  try {
    const payload = await c.req.json<QuizSubmissionPayload>();
    const { selectedAnswers } = payload;

    // The openapi.json schema for SubmitAnswerRequest makes `selectedAnswers` required.
    if (!Array.isArray(selectedAnswers)) {
      return c.json({ ok: false, message: 'selectedAnswers is required and must be an array.' }, 400);
    }

    const result = await processAnswerSubmission(c.env, userId, questionId, selectedAnswers);

    if (!result) {
      return c.json({ ok: false, message: 'Question not found.' }, 404);
    }

    // BUG FIX: Explicitly return a success response.
    // This was missing, causing the function to implicitly return `undefined` on success,
    // which leads to a RangeError when Hono tries to construct the response.
    return c.json({ ok: true, data: result }, 200);

  } catch (error: any) {
    console.error(`Error submitting answer for question ${questionId}:`, error);
    return c.json({ ok: false, message: 'Failed to process answer submission.', error: error.message }, 500);
  }
};

/**
 * Handles fetching a single question details by its ID.
 * GET /api/v1/questions/:id
 */
export const getQuestionByIdHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const questionId = c.req.param('id');
  if (!questionId) {
    return c.json({ ok: false, message: 'Question ID is required.' }, 400);
  }

  try {
    const { getQuestionById } = await import('../services/quiz.service');
    const question = await getQuestionById(c.env, questionId);

    if (!question) {
      return c.json({ ok: false, message: 'Question not found.' }, 404);
    }

    return c.json({ ok: true, data: question });
  } catch (error: any) {
    console.error(`Error fetching question ${questionId}:`, error);
    return c.json({ ok: false, message: 'Failed to fetch question.', error: error.message }, 500);
  }
};
