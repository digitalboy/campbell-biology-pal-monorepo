import { ref } from 'vue';
import { defineStore } from 'pinia';
import { reviewService } from '@/services/reviewService';
import type { DueReviewQuestion, Question } from '@/types/api';

export const useReviewStore = defineStore('review', () => {
  // --- State ---
  const dueReviews = ref<DueReviewQuestion[]>([]);
  const wrongAnswers = ref<Question[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // --- Actions ---

  /**
   * Fetches questions that are due for review.
   */
  async function fetchDueReviews() {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await reviewService.getDueReviews();
      dueReviews.value = response.due_questions;
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to fetch due reviews.';
      console.error(error.value);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Fetches questions that the user has answered incorrectly.
   * @param params Optional filters for startDate and endDate.
   */
  async function fetchWrongAnswers(params?: { startDate?: string; endDate?: string }) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await reviewService.getWrongAnswers(params);
      wrongAnswers.value = response;
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to fetch wrong answers.';
      console.error(error.value);
    } finally {
      isLoading.value = false;
    }
  }

  return {
    dueReviews,
    wrongAnswers,
    isLoading,
    error,
    fetchDueReviews,
    fetchWrongAnswers,
  };
});