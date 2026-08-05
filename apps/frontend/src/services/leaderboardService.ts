import { api } from './apiClient';
import type { LeaderboardUser, LeaderboardSortBy } from '@/types/api';

/**
 * Interface for query parameters when fetching leaderboard data.
 */
export interface GetLeaderboardParams {
  limit?: number;
  sortBy?: LeaderboardSortBy;
  startDate?: string;
  endDate?: string;
}

/**
 * Service for interacting with the leaderboard API endpoints.
 */
export const leaderboardService = {
  /**
   * Retrieves leaderboard data based on specified criteria.
   * @param params Query parameters for filtering and sorting.
   * @returns A promise that resolves to an array of LeaderboardUser objects.
   * @throws Error if the request fails.
   */
  async getLeaderboard(params?: GetLeaderboardParams): Promise<LeaderboardUser[]> {
    try {
      const response = await api.getLeaderboard(params);
      return response.data; // Assuming API returns { ok: true, data: LeaderboardUser[] }
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      throw error;
    }
  },
};