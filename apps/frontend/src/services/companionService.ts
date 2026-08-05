/**
 * @file companionService.ts
 * @description Service for interacting with the companion data API endpoints.
 */
import { api } from './apiClient';
import type { CompanionData } from '@/types/api';

/**
 * Service for fetching companion data related to PDF pages.
 */
export const companionService = {
  /**
   * Retrieves companion data for a specific PDF page number.
   * @param pageNumber The PDF page number for which to retrieve data.
   * @returns A promise that resolves to the CompanionData object.
   * @throws Error if the request fails.
   */
  async getCompanionData(pageNumber: number): Promise<CompanionData> {
    try {
      const response = await api.axiosInstance.get(`/pages/${pageNumber}/companion-data`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching companion data for page ${pageNumber}:`, error);
      throw error;
    }
  },
};
