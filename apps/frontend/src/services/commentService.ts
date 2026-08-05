
import { api } from './apiClient';
import type { Comment, CreateCommentPayload, PaginatedCommentsResponse } from '@/types/api';

/**
 * Interface for query parameters when fetching comments.
 * Aligned with the `GET /comments` endpoint.
 */
export interface GetCommentsParams {
  userId?: string;
  parentType?: 'page' | 'question';
  parentId?: string;
  limit?: number;
  cursor?: string | null;
  myComments?: boolean; // Add this new parameter
}

/**
 * Service for interacting with the comments API endpoints.
 * This service acts as a layer between the UI components/stores and the apiClient,
 * allowing for business logic and response data transformation.
 */
export const commentService = {
  /**
   * Creates a new comment or reply.
   * @param payload The data for the new comment, conforming to CreateCommentPayload.
   * @returns A promise that resolves to the created Comment object.
   * @throws Error if the request fails.
   */
  async createComment(payload: CreateCommentPayload): Promise<Comment> {
    try {
      // apiClient's postComment now returns { ok, message, comment }
      // We extract and return the comment object for the application to use.
      const response = await api.postComment(payload);
      return response.comment;
    } catch (error) {
      console.error('Error creating comment:', error);
      throw error;
    }
  },

  /**
   * Retrieves a list of comments based on various filters with pagination.
   * @param params Query parameters for filtering and pagination.
   * @returns A promise that resolves to the paginated data containing Comment objects.
   * @throws Error if the request fails.
   */
  async getComments(params: GetCommentsParams): Promise<PaginatedCommentsResponse['data']> {
    try {
      // apiClient's getComments returns the full { ok, data } object.
      // We extract and return the `data` property which contains items, total, etc.
      const response = await api.getComments(params);
      return response.data;
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw error;
    }
  },

  /**
   * Retrieves a single comment tree by its ID.
   * @param commentId The ID of the comment to retrieve.
   * @returns A promise that resolves to the Comment object (which includes its replies).
   * @throws Error if the request fails.
   */
  async getCommentById(commentId: string): Promise<Comment> {
    try {
      const response = await api.getCommentById(commentId);
      return response.comment;
    } catch (error) {
      console.error(`Error fetching comment tree for ID ${commentId}:`, error);
      throw error;
    }
  },

  /**
   * Deletes a comment by its ID.
   * @param commentId The ID of the comment to delete.
   * @returns A promise that resolves when the comment is successfully deleted.
   * @throws Error if the request fails.
   */
  async deleteComment(commentId: string): Promise<void> {
    try {
      // apiClient's deleteComment returns { ok, message }.
      // We don't need to return anything here, but can handle the response if needed.
      await api.deleteComment(commentId);
    } catch (error) {
      console.error(`Error deleting comment ${commentId}:`, error);
      throw error;
    }
  },
};
