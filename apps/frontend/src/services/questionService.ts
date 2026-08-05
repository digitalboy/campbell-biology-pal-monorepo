import { api } from './apiClient';
import type { QuestionSubmissionPayload, QuestionSubmissionResult } from '@/types/api';

/**
 * Service for interacting with question-related API endpoints, such as submitting answers.
 */
export const questionService = {
  /**
   * Submits an answer to a specific question.
   * @param questionId The ID of the question to submit the answer for.
   * @param payload The payload containing the user's answer and other submission details.
   * @returns A promise that resolves to the QuestionSubmissionResult object.
   * @throws Error if the request fails.
   */
  async submitQuestionAnswer(questionId: string, payload: QuestionSubmissionPayload): Promise<QuestionSubmissionResult> {
    try {
      const response = await api.axiosInstance.post<QuestionSubmissionResult>(`/questions/${questionId}/submit`, payload);
      return response.data;
    } catch (error) {
      console.error(`Error submitting answer for question ${questionId}:`, error);
      throw error;
    }
  },
};
