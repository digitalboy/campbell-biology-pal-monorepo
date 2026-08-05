import { Context } from 'hono';
import { Env } from '../index';
import { HonoContextVariables } from '../router';
import { SocialService } from '../services/social.service';
import { Comment, LeaderboardUser } from '../models/social.models'; // Import Comment interface

// Define the expected request body for creating a comment
interface CreateCommentPayload {
    parentType: 'page' | 'question';
    parentId: string;
    content: string;
    parentCommentId?: string | null;
}

// Define a generic PaginatedResponse structure for consistency
interface PaginatedResponse<T> {
    ok: boolean;
    data: {
        items: T[];
        total: number;
        nextCursor: string | null;
    };
}

/**
 * Handles the creation of a new comment.
 * POST /api/v1/comments
 */
export async function handleCreateComment(c: Context<{ Bindings: Env; Variables: HonoContextVariables }>) {
    try {
        const userId = c.get('userId'); // Get userId from authMiddleware
        if (!userId) {
            return c.json({ ok: false, message: 'Unauthorized: User ID not found in context.' }, 401);
        }

        const payload: CreateCommentPayload = await c.req.json();

        // Basic validation
        if (!payload.parentType || !payload.parentId || !payload.content) {
            return c.json({ ok: false, message: 'Missing required fields: parentType, parentId, and content are required.' }, 400);
        }

        const socialService = new SocialService(c.env.DB);
        const newComment: Comment = await socialService.createComment(
            userId,
            payload.parentType,
            payload.parentId,
            payload.content,
            payload.parentCommentId
        );

        return c.json({
            ok: true,
            message: 'Comment created successfully.',
            comment: newComment,
        }, 201); // 201 Created
    } catch (error: any) {
        console.error('Error creating comment:', error);
        return c.json({ ok: false, message: 'Failed to create comment.', error: error.message }, 500);
    }
}

/**
 * Handles fetching comments based on query parameters, with cursor-based pagination.
 * GET /api/v1/comments?myComments=true&parentType=...&parentId=...&limit=...&cursor=...
 */
export async function handleGetComments(c: Context<{ Bindings: Env; Variables: HonoContextVariables }>) {
    try {
        const socialService = new SocialService(c.env.DB);

        const myComments = c.req.query('myComments'); // New query parameter
        const parentType = c.req.query('parentType') as 'page' | 'question' | undefined;
        const parentId = c.req.query('parentId');
        const limitQuery = c.req.query('limit');
        const limit = limitQuery !== undefined ? parseInt(limitQuery, 10) : 10; // Default limit 10
        const cursor = c.req.query('cursor');

        // Basic validation for parentType if provided
        if (parentType && !['page', 'question'].includes(parentType)) {
            return c.json({ ok: false, message: 'Invalid parentType. Must be "page" or "question".' }, 400);
        }

        // Ensure parentId is provided if parentType is specified
        if (parentType && !parentId) {
            return c.json({ ok: false, message: 'parentId is required when parentType is specified.' }, 400);
        }

        // Validate limit
        if (isNaN(limit) || limit <= 0) {
            return c.json({ ok: false, message: 'Invalid limit. Must be a positive integer.' }, 400);
        }

        const filters: {
            userId?: string;
            parentType?: 'page' | 'question';
            parentId?: string;
        } = {};

        // If myComments is true, use the authenticated userId
        if (myComments === 'true') {
            const authenticatedUserId = c.get('userId');
            if (!authenticatedUserId) {
                return c.json({ ok: false, message: 'Unauthorized: User ID not found in context. Cannot filter by myComments.' }, 401);
            }
            filters.userId = authenticatedUserId;
        } else {
            // Otherwise, allow filtering by a specific userId if provided (though this might be removed later for security)
            const queryUserId = c.req.query('userId');
            if (queryUserId) {
                filters.userId = queryUserId;
            }
        }

        if (parentType) filters.parentType = parentType;
        if (parentId) filters.parentId = parentId;

        const { comments, total, nextCursor } = await socialService.getComments(filters, limit, cursor);

        const responseData: PaginatedResponse<Comment> = {
            ok: true,
            data: {
                items: comments,
                total: total,
                nextCursor: nextCursor,
            },
        };

        return c.json(responseData);
    } catch (error: any) {
        console.error('Error fetching comments:', error);
        return c.json({ ok: false, message: 'Failed to fetch comments.', error: error.message }, 500);
    }
}

/**
 * Handles fetching a single comment tree by its ID.
 * GET /api/v1/comments/:commentId
 */
export async function handleGetCommentById(c: Context<{ Bindings: Env; Variables: HonoContextVariables }>) {
    try {
        const commentId = c.req.param('commentId');
        if (!commentId) {
            return c.json({ ok: false, message: 'Comment ID is required.' }, 400);
        }

        const socialService = new SocialService(c.env.DB);
        const commentTree = await socialService.getCommentTreeById(commentId);

        if (!commentTree) {
            return c.json({ ok: false, message: 'Comment not found.' }, 404);
        }

        return c.json({
            ok: true,
            comment: commentTree,
        });
    } catch (error: any) {
        console.error(`Error fetching comment ${c.req.param('commentId')}:`, error);
        return c.json({ ok: false, message: 'Failed to fetch comment.', error: error.message }, 500);
    }
}

/**
 * Handles the deletion of a comment.
 * DELETE /api/v1/comments/:commentId
 */
export async function handleDeleteComment(c: Context<{ Bindings: Env; Variables: HonoContextVariables }>) {
    try {
        const userId = c.get('userId'); // Get userId from authMiddleware
        if (!userId) {
            return c.json({ ok: false, message: 'Unauthorized: User ID not found in context.' }, 401);
        }

        const commentId = c.req.param('commentId');
        if (!commentId) {
            return c.json({ ok: false, message: 'Comment ID is required.' }, 400);
        }

        const socialService = new SocialService(c.env.DB);
        const deleted = await socialService.deleteComment(commentId, userId);

        if (deleted) {
            return c.json({ ok: true, message: 'Comment deleted successfully.' }, 200);
        } else {
            // This could mean comment not found or user is not the owner
            // For security, it's better not to distinguish between these two cases to prevent enumeration attacks.
            return c.json({ ok: false, message: 'Failed to delete comment or comment not found/unauthorized.' }, 403); // 403 Forbidden
        }
    } catch (error: any) {
        console.error('Error deleting comment:', error);
        return c.json({ ok: false, message: 'Failed to delete comment.', error: error.message }, 500);
    }
}

/**
 * Handles fetching leaderboard data.
 * GET /api/v1/leaderboard
 */
export async function getLeaderboardHandler(c: Context<{ Bindings: Env; Variables: HonoContextVariables }>) {
    try {
        const socialService = new SocialService(c.env.DB);

        // Extract and validate limit
        const limitQuery = c.req.query('limit');
        let limit = 10; // Default limit
        if (limitQuery !== undefined) {
            const parsedLimit = parseInt(limitQuery, 10);
            if (isNaN(parsedLimit) || parsedLimit <= 0) {
                return c.json({ ok: false, message: 'Invalid limit. Must be a positive integer.' }, 400);
            }
            limit = Math.min(parsedLimit, 100); // Max limit 100
        }

        // Extract and validate sortBy
        const sortByQuery = c.req.query('sortBy');
        const allowedSortBy = ['totalAttempts', 'correctAttempts', 'accuracy'];
        let sortBy: 'totalAttempts' | 'correctAttempts' | 'accuracy' = 'totalAttempts'; // Default sort
        if (sortByQuery && allowedSortBy.includes(sortByQuery)) {
            sortBy = sortByQuery as 'totalAttempts' | 'correctAttempts' | 'accuracy';
        } else if (sortByQuery) {
            return c.json({ ok: false, message: `Invalid sortBy parameter. Must be one of ${allowedSortBy.join(', ')}.` }, 400);
        }

        const startDate = c.req.query('startDate');
        const endDate = c.req.query('endDate');

        const leaderboardUsers: LeaderboardUser[] = await socialService.fetchLeaderboard(
            limit,
            sortBy,
            startDate,
            endDate
        );

        return c.json({ ok: true, data: leaderboardUsers });
    } catch (error: any) {
        console.error('Error fetching leaderboard:', error);
        return c.json({ ok: false, message: 'Failed to fetch leaderboard.', error: error.message }, 500);
    }
}
