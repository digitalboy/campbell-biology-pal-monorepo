import { ref } from 'vue';
import { defineStore } from 'pinia';
import { questionService } from '@/services/questionService';
import type { QuestionSubmissionPayload, QuestionSubmissionResult } from '@/types/api';
import { useCompanionStore } from './companionStore';

export const useQuestionStore = defineStore('question', () => {
  // --- State ---
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const submissionResult = ref<QuestionSubmissionResult | null>(null);
  const isAnswered = ref(false);

  // --- Actions ---

  /**
   * Submits an answer to a specific question and updates the store's state.
   * @param questionId The ID of the question to submit the answer for.
   * @param payload The payload containing the user's answer.
   * @returns The QuestionSubmissionResult object.
   */
  async function submitAnswer(questionId: string, payload: QuestionSubmissionPayload): Promise<QuestionSubmissionResult> {
    isLoading.value = true;
    error.value = null;
    try {
      const response: any = await questionService.submitQuestionAnswer(questionId, payload);
      const result: QuestionSubmissionResult = response.data;

      submissionResult.value = result;
      isAnswered.value = true;

      // Update companionStore with the new answer status
      const companionStore = useCompanionStore();
      companionStore.updateQuestionAnsweredByUsers(questionId, result.isCorrect);

      return result;
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to submit answer.';
      console.error('Error submitting answer:', e);
      isAnswered.value = false; // Reset if submission fails
      throw e; // Re-throw to allow component to handle specific errors (e.g., toast)
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Resets the submission-related state in the store.
   */
  function resetSubmissionState() {
    isLoading.value = false;
    error.value = null;
    submissionResult.value = null;
    isAnswered.value = false;
  }

  return {
    isLoading,
    error,
    submissionResult,
    isAnswered,
    submitAnswer,
    resetSubmissionState,
  };
});
