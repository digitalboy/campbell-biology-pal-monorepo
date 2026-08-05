import { api } from './apiClient';
import type { AiInteraction, CreateAiInteractionPayload } from '@/types/api';

/**
 * Service for interacting with the AI Interaction history API endpoints.
 */
export const aiInteractionService = {
  /**
   * Saves an AI interaction record.
   * @param payload The data for the AI interaction to save.
   * @returns A promise that resolves to the created AiInteraction object.
   * @throws Error if the request fails.
   */
  async saveInteraction(payload: CreateAiInteractionPayload): Promise<AiInteraction> {
    try {
      const response = await api.axiosInstance.post<{ ok: boolean, data: AiInteraction }>('/ai/interactions', payload);
      return response.data.data;
    } catch (error) {
      console.error('Error saving AI interaction:', error);
      throw error;
    }
  },

  /**
   * Retrieves a list of recent AI interaction records for the authenticated user.
   * @param params Query parameters for filtering and pagination.
   * @returns A promise that resolves to an array of AiInteraction objects.
   * @throws Error if the request fails.
   */
  async getRecentInteractions(params?: { limit?: number; parentType?: 'node' | 'question' | 'pdf' | null; parentId?: string | null }): Promise<AiInteraction[]> {
    try {
      const response = await api.axiosInstance.get<{ ok: boolean, data: AiInteraction[] }>('/ai/interactions', { params });
      return response.data.data;
    } catch (error) {
      console.error('Error fetching recent AI interactions:', error);
      throw error;
    }
  },

  /**
   * Deletes an AI interaction record by its ID.
   * @param id The unique ID of the AI interaction record to delete.
   * @returns A promise that resolves when the record is successfully deleted.
   * @throws Error if the request fails.
   */
  async deleteInteraction(id: string): Promise<void> {
    try {
      await api.axiosInstance.delete(`/ai/interactions/${id}`);
    } catch (error) {
      console.error(`Error deleting AI interaction ${id}:`, error);
      throw error;
    }
  },
};