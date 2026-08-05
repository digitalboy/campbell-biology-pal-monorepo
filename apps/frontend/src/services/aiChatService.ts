import { api } from './apiClient';
import { authService } from './authService';
import type { AiCompletionRequest, AiCompletionResponse, ErrorResponse } from '@/types/api';

/**
 * Service for interacting with the AI chat API.
 */
export const aiChatService = {
  /**
   * Sends a completion request to the AI model.
   * @param payload The request payload for the AI completion.
   * @returns A Promise resolving to AiCompletionResponse for non-streaming, or a ReadableStream for streaming.
   */
  async aiCompletion(payload: AiCompletionRequest): Promise<AiCompletionResponse | ReadableStream<Uint8Array>> {
    try {
      if (payload.stream) {
        // For streaming, we need to use fetch directly to get the ReadableStream
        const token = await authService.getToken();
        const user = authService.currentUser;

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        if (user) {
          headers['X-User-Id'] = user.uid;
        }

        const response = await fetch(`${api.axiosInstance.defaults.baseURL}/ai/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData: ErrorResponse = await response.json();
          throw new Error(errorData.message || 'Failed to get AI stream response');
        }

        return response.body!; // Return the ReadableStream
      } else {
        // For non-streaming, use the axios instance which has an interceptor for auth
        const response = await api.axiosInstance.post<AiCompletionResponse>('/ai/completions', payload);
        return response.data;
      }
    } catch (error) {
      console.error('Error in aiService.aiCompletion:', error);
      throw error;
    }
  },
};
