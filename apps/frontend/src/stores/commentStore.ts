import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { Comment, CreateCommentPayload } from '@/types/api';
import { commentService } from '@/services/commentService';


export const useCommentStore = defineStore('comment', () => {
  // --- State ---
  const comments = ref<Comment[]>([]);
  const totalComments = ref(0);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const nextCursor = ref<string | null>(null); // New: for cursor pagination
  const loadingCommentId = ref<string | null>(null);

  // --- Actions ---

  async function fetchComments(parentType: 'page' | 'question', parentId: string, limit: number = 10, cursor: string | null = null, myComments: boolean = false) {
    isLoading.value = true;
    error.value = null;
    try {
      const responseData = await commentService.getComments({
        parentType,
        parentId,
        limit,
        cursor,
        myComments, // Pass the new parameter
      });

      if (cursor === null) {
        // First load, replace comments
        comments.value = responseData.items;
      } else {
        // Subsequent load, append comments
        comments.value = [...comments.value, ...responseData.items];
      }
      totalComments.value = responseData.total;
      nextCursor.value = responseData.nextCursor;

    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to fetch comments.';
      console.error(error.value);
    }
    finally {
      isLoading.value = false;
    }
  }

  async function postComment(payload: CreateCommentPayload): Promise<Comment> {
    if (payload.parentCommentId) {
      loadingCommentId.value = payload.parentCommentId;
    }
    try {
      const newComment = await commentService.createComment(payload);
      // The loading state will be cleared by fetchCommentTree, which is called
      // by the component after a successful post.
      return newComment;
    } catch (e) {
      if (payload.parentCommentId) {
        loadingCommentId.value = null; // Clear loading state on error
      }
      const apiError = e as any;
      const postError = apiError.message || 'Failed to post comment.';
      console.error(postError);
      throw new Error(postError);
    }
  }

  async function fetchCommentTree(commentId: string): Promise<Comment | null> {
    loadingCommentId.value = commentId;
    try {
      const response = await commentService.getCommentById(commentId);
      return response;
    } catch (e) {
      const apiError = e as any;
      const fetchError = apiError.message || 'Failed to fetch comment tree.';
      console.error(fetchError);
      throw new Error(fetchError);
    } finally {
      loadingCommentId.value = null;
    }
  }

  async function deleteComment(commentId: string) {
    loadingCommentId.value = commentId;
    try {
      await commentService.deleteComment(commentId);

      // Remove comment from tree structure
      function removeCommentFromTree(commentsArray: Comment[], targetId: string): boolean {
        for (let i = 0; i < commentsArray.length; i++) {
          if (commentsArray[i].id === targetId) {
            commentsArray.splice(i, 1);
            return true;
          }
          if (commentsArray[i].replies && commentsArray[i].replies!.length > 0) {
            if (removeCommentFromTree(commentsArray[i].replies!, targetId)) {
              return true;
            }
          }
        }
        return false;
      }

      removeCommentFromTree(comments.value, commentId);
      totalComments.value -= 1;
    } catch (e) {
      const apiError = e as any;
      const deleteError = apiError.message || 'Failed to delete comment.';
      console.error(deleteError);
      throw new Error(deleteError);
    } finally {
      loadingCommentId.value = null;
    }
  }

  return {
    comments,
    totalComments,
    isLoading,
    error,
    nextCursor,
    loadingCommentId,
    fetchComments,
    postComment,
    deleteComment,
    fetchCommentTree,
  };
});
