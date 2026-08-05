import { ref } from 'vue';
import { defineStore } from 'pinia';
import { leaderboardService } from '@/services/leaderboardService';
import type { LeaderboardUser, LeaderboardSortBy } from '@/types/api';

export const useLeaderboardStore = defineStore('leaderboard', () => {
  // --- State ---
  const leaderboardData = ref<LeaderboardUser[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // --- Actions ---

  /**
   * Fetches leaderboard data based on specified criteria.
   * @param params Optional filters for limit, sortBy, startDate, and endDate.
   */
  async function fetchLeaderboard(params?: { limit?: number; sortBy?: LeaderboardSortBy; startDate?: string; endDate?: string }) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await leaderboardService.getLeaderboard(params);
      leaderboardData.value = response;
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to fetch leaderboard data.';
      console.error(error.value);
    } finally {
      isLoading.value = false;
    }
  }

  return {
    leaderboardData,
    isLoading,
    error,
    fetchLeaderboard,
  };
});