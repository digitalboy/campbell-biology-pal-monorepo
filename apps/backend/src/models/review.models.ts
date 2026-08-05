import { Question } from './quiz.models';

/**
 * Represents a question that is due for review.
 * It combines the full question data with its current review schedule metadata.
 */
export interface DueReviewQuestion extends Question {
  last_reviewed_at: string | null;
  review_stage: number;
}

/**
 * Represents the API response for the `GET /api/v1/users/me/reviews/due` endpoint.
 */
export interface DueReviewsResponse {
  due_questions: DueReviewQuestion[];
}
