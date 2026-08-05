import { ref } from 'vue';
import { defineStore } from 'pinia';
import { companionService } from '@/services/companionService';
import type { CompanionData, QuestionSocialStats } from '@/types/api';
import { useAuthStore } from './authStore'; // Import authStore to get current user info

export const useCompanionStore = defineStore('companion', () => {
  // --- State ---
  const companionData = ref<CompanionData | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // --- Actions ---

  /**
   * Fetches companion data for a specific PDF page number.
   * @param pageNumber The PDF page number for which to retrieve data.
   */
  async function fetchCompanionData(pageNumber: number) {
    // console.log('companionStore: fetchCompanionData called for page', pageNumber);
    isLoading.value = true;
    error.value = null;
    try {
      const data = await companionService.getCompanionData(pageNumber);
      companionData.value = data;
      // console.log('companionStore: companionData updated', companionData.value);
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to fetch companion data.';
      console.error(error.value);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Updates the 'answeredByUsers' list for a specific question after a submission.
   * This provides immediate visual feedback to the user.
   * @param questionId The ID of the question that was answered.
   * @param isCorrect Whether the answer was correct.
   */
  function updateQuestionAnsweredByUsers(questionId: string, isCorrect: boolean) {
    if (!companionData.value || !companionData.value.questions) {
      return;
    }

    const authStore = useAuthStore();
    const currentUser = authStore.user; // Get current user from authStore

    if (!currentUser) {
      console.warn('Cannot update answeredByUsers: Current user not available.');
      return;
    }

    const question = companionData.value.questions.find(q => q.id === questionId);

    if (question) {
      if (!question.answeredByUsers) {
        question.answeredByUsers = []; // Initialize if null/undefined
      }

      let userStats = question.answeredByUsers.find(u => u.userId === currentUser.id);

      if (userStats) {
        // User already exists, update stats
        userStats.totalAttempts += 1;
        if (isCorrect) {
          userStats.correctAttempts += 1;
        }
        // Recalculate accuracy if needed, though it's not directly used in QuestionViewer for this part
        
      } else {
        // User does not exist, add new entry
        const newStats: QuestionSocialStats = {
          userId: currentUser.id,
          nickname: currentUser.nickname || '匿名用户', // Fallback for nickname
          avatarUrl: currentUser.avatar_url || '', // Fallback for avatar
          totalAttempts: 1,
          correctAttempts: isCorrect ? 1 : 0,
          
        };
        question.answeredByUsers.push(newStats);
      }
    }
  }

  return {
    companionData,
    isLoading,
    error,
    fetchCompanionData,
    updateQuestionAnsweredByUsers,
  };
});

