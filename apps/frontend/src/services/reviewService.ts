import { api } from './apiClient';
import type { DueReviewsResponse, Question } from '@/types/api';

/**
 * Service for interacting with the review API endpoints.
 * This service acts as a layer between the UI components/stores and the apiClient,
 * allowing for business logic and response data transformation.
 */
export const reviewService = {
  /**
   * Retrieves a list of questions that are due for review for the authenticated user.
   * @returns A promise that resolves to the DueReviewsResponse object.
   * @throws Error if the request fails.
   */
  async getDueReviews(): Promise<DueReviewsResponse> {
    try {
      const response: any = await api.getDueReviews();
      return response.data || response; // Assuming API returns { ok: true, data: DueReviewsResponse }
    } catch (error) {
      console.error('Error fetching due reviews:', error);
      throw error;
    }
  },

  /**
   * Retrieves a list of questions that the authenticated user has answered incorrectly.
   * @param params Query parameters for filtering (startDate, endDate).
   * @returns A promise that resolves to a paginated list of Question objects.
   * @throws Error if the request fails.
   */
  async getWrongAnswers(params?: { startDate?: string; endDate?: string }): Promise<Question[]> {
    try {
      const response: any = await api.getWrongAnswers(params);
      if (response && response.data && Array.isArray(response.data.wrong_answers)) {
        return response.data.wrong_answers;
      }
      if (response && Array.isArray(response.wrong_answers)) {
        return response.wrong_answers;
      }
      if (Array.isArray(response)) {
        return response;
      }
      return [];
    } catch (error) {
      console.error('Error fetching wrong answers:', error);
      throw error;
    }
  },
};