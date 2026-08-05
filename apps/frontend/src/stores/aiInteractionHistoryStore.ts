import { ref } from 'vue';
import { defineStore } from 'pinia';
import { aiInteractionService } from '@/services/aiInteractionHistoryService';
import type { AiInteraction, CreateAiInteractionPayload } from '@/types/api';

export const useAiInteractionStore = defineStore('aiInteraction', () => {
  // --- State ---
  const interactions = ref<AiInteraction[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // --- Actions ---

  /**
   * Fetches recent AI interaction records.
   * @param params Optional query parameters for filtering.
   */
  async function fetchRecentInteractions(params?: { limit?: number; parentType?: 'node' | 'question' | 'pdf' | null; parentId?: string | null }): Promise<AiInteraction[]> { // Added return type
    isLoading.value = true;
    error.value = null;
    try {
      const response = await aiInteractionService.getRecentInteractions(params);
      interactions.value = response; // Update store state
      return response; // Return the fetched data
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to fetch AI interactions.';
      console.error(error.value);
      throw e; // Re-throw the error
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Saves a new AI interaction record.
   * @param payload The data for the AI interaction to save.
   * @returns The created AiInteraction object.
   */
  async function saveInteraction(payload: CreateAiInteractionPayload): Promise<AiInteraction> {
    isLoading.value = true;
    error.value = null;
    try {
      const newInteraction = await aiInteractionService.saveInteraction(payload);
      // Optionally add the new interaction to the list if it fits the current filter
      // For simplicity, we'll just return it for now.
      return newInteraction;
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to save AI interaction.';
      console.error(error.value);
      throw e; // Re-throw to allow component to handle specific errors
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * Deletes an AI interaction record.
   * @param id The ID of the interaction to delete.
   */
  async function deleteInteraction(id: string) {
    isLoading.value = true;
    error.value = null;
    try {
      await aiInteractionService.deleteInteraction(id);
      // Optimistically remove from state
      interactions.value = interactions.value.filter(interaction => interaction.id !== id);
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to delete AI interaction.';
      console.error(error.value);
      throw e; // Re-throw
    } finally {
      isLoading.value = false;
    }
  }

  return {
    interactions,
    isLoading,
    error,
    fetchRecentInteractions,
    saveInteraction,
    deleteInteraction,
  };
});