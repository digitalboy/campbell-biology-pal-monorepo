import { D1Database } from '@cloudflare/workers-types';
import { Comment, LeaderboardUser } from '../models/social.models';


export class SocialService {
    private db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
    }

    async createComment(
        userId: string,
        parentType: 'page' | 'question',
        parentId: string,
        content: string,
        parentCommentId: string | null = null
    ): Promise<Comment> {
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();

        // Fetch user profile info
        const userProfile = await this.db.prepare(
            'SELECT nickname, avatar_url FROM UserProfiles WHERE id = ?'
        ).bind(userId).first<{ nickname: string | null; avatar_url: string | null }>();

        const newComment: Comment = {
            id,
            user_id: userId,
            parent_type: parentType,
            parent_id: parentId,
            parent_comment_id: parentCommentId,
            content,
            status: 'visible', // Use literal type to match the interface
            created_at: createdAt,
            user: {
                id: userId,
                nickname: userProfile?.nickname || null,
                avatar_url: userProfile?.avatar_url || null,
            },
            replies: [],
        };

        await this.db.prepare(
            `INSERT INTO Comments (id, user_id, parent_type, parent_id, parent_comment_id, content, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            newComment.id,
            newComment.user_id,
            newComment.parent_type,
            newComment.parent_id,
            newComment.parent_comment_id,
            newComment.content,
            newComment.status,
            newComment.created_at
        ).run();

        return newComment;
    }

    async getComments(filters: {
        userId?: string;
        parentType?: 'page' | 'question';
        parentId?: string;
    }, limit: number = 10, cursor?: string): Promise<{ comments: Comment[]; total: number; nextCursor: string | null }> {

        let baseQuery = 'FROM Comments WHERE parent_comment_id IS NULL';
        const filterParams: (string | number)[] = [];

        if (filters.userId) { baseQuery += ' AND user_id = ?'; filterParams.push(filters.userId); }
        if (filters.parentType) { baseQuery += ' AND parent_type = ?'; filterParams.push(filters.parentType); }
        if (filters.parentId) { baseQuery += ' AND parent_id = ?'; filterParams.push(filters.parentId); }

        const totalResult = await this.db.prepare(`SELECT COUNT(*) as count ${baseQuery}`)
            .bind(...filterParams).first<{ count: number }>();
        const total = totalResult?.count || 0;

        if (total === 0) return { comments: [], total: 0, nextCursor: null };

        let paginationQuery = '';
        const paginationParams: (string | number)[] = [];
        if (cursor) {
            try {
                const [createdAt, id] = atob(cursor).split(':');
                if (createdAt && id) {
                    paginationQuery = ' AND (created_at, id) < (?, ?)';
                    paginationParams.push(createdAt, id);
                }
            } catch (e) { console.error("Invalid cursor provided:", e); }
        }

        const topLevelIdsQuery = `SELECT id, created_at ${baseQuery} ${paginationQuery} ORDER BY created_at DESC, id DESC LIMIT ?`;
        const topLevelIdsParams = [...filterParams, ...paginationParams, limit];
        const topLevelIdsResult = await this.db.prepare(topLevelIdsQuery).bind(...topLevelIdsParams).all<{ id: string, created_at: string }>();
        
        if (!topLevelIdsResult.results || topLevelIdsResult.results.length === 0) {
            return { comments: [], total, nextCursor: null };
        }
        const topLevelIds = topLevelIdsResult.results.map(r => r.id);

        const placeholders = topLevelIds.map(() => '?').join(',');
        const recursiveQuery = `
            WITH RECURSIVE comment_tree AS (
                SELECT c.*, u.nickname, u.avatar_url 
                FROM Comments c JOIN UserProfiles u ON c.user_id = u.id 
                WHERE c.id IN (${placeholders})
                UNION ALL
                SELECT c.*, u.nickname, u.avatar_url 
                FROM Comments c JOIN UserProfiles u ON c.user_id = u.id
                JOIN comment_tree ct ON c.parent_comment_id = ct.id
            )
            SELECT * FROM comment_tree;
        `;

        const allCommentsFlat = await this.db.prepare(recursiveQuery).bind(...topLevelIds).all<any>();
        const comments = this.mapDbResultsToComments(allCommentsFlat.results || []);
        const commentsTree = this.buildCommentTree(comments);

        let nextCursor: string | null = null;
        if (topLevelIdsResult.results.length === limit) {
            const lastComment = topLevelIdsResult.results[topLevelIdsResult.results.length - 1];
            nextCursor = btoa(`${lastComment.created_at}:${lastComment.id}`);
        }

        return { comments: commentsTree, total, nextCursor };
    }

    async getCommentTreeById(commentId: string): Promise<Comment | null> {
        const findRootQuery = `
            WITH RECURSIVE ancestor_path AS (
                SELECT id, parent_comment_id FROM Comments WHERE id = ?
                UNION ALL
                SELECT c.id, c.parent_comment_id FROM Comments c JOIN ancestor_path ap ON c.id = ap.parent_comment_id
            )
            SELECT id FROM ancestor_path WHERE parent_comment_id IS NULL;
        `;
        const rootResult = await this.db.prepare(findRootQuery).bind(commentId).first<{ id: string }>();

        if (!rootResult) return null;
        const rootId = rootResult.id;

        const getTreeQuery = `
            WITH RECURSIVE comment_tree AS (
                SELECT c.*, u.nickname, u.avatar_url 
                FROM Comments c JOIN UserProfiles u ON c.user_id = u.id 
                WHERE c.id = ?
                UNION ALL
                SELECT c.*, u.nickname, u.avatar_url 
                FROM Comments c JOIN UserProfiles u ON c.user_id = u.id
                JOIN comment_tree ct ON c.parent_comment_id = ct.id
            )
            SELECT * FROM comment_tree;
        `;
        const allCommentsFlat = await this.db.prepare(getTreeQuery).bind(rootId).all<any>();

        if (!allCommentsFlat.results || allCommentsFlat.results.length === 0) return null;

        const comments = this.mapDbResultsToComments(allCommentsFlat.results);
        const commentsTree = this.buildCommentTree(comments);

        return commentsTree.length > 0 ? commentsTree[0] : null;
    }

    private mapDbResultsToComments(results: any[]): Comment[] {
        return results.map(r => ({
            id: r.id,
            user_id: r.user_id,
            parent_type: r.parent_type,
            parent_id: r.parent_id,
            parent_comment_id: r.parent_comment_id,
            content: r.content,
            status: r.status,
            created_at: r.created_at,
            user: {
                id: r.user_id,
                nickname: r.nickname,
                avatar_url: r.avatar_url,
            },
            replies: [],
        }));
    }

    private buildCommentTree(comments: Comment[]): Comment[] {
        const commentMap = new Map<string, Comment>();
        const rootComments: Comment[] = [];

        comments.forEach(comment => {
            comment.replies = [];
            commentMap.set(comment.id, comment);
        });

        comments.forEach(comment => {
            if (comment.parent_comment_id && commentMap.has(comment.parent_comment_id)) {
                const parent = commentMap.get(comment.parent_comment_id)!;
                parent.replies?.push(comment);
                parent.replies?.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            } else {
                rootComments.push(comment);
            }
        });
        
        rootComments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        return rootComments;
    }

    async deleteComment(commentId: string, userId: string): Promise<boolean> {
        const comment = await this.db.prepare(
            'SELECT user_id FROM Comments WHERE id = ?'
        ).bind(commentId).first<{ user_id: string }>();

        if (!comment) return false;
        if (comment.user_id !== userId) return false;

        const result = await this.db.prepare(
            'DELETE FROM Comments WHERE id = ? AND user_id = ?'
        ).bind(commentId, userId).run();

        return result.meta.changes > 0;
    }

    async fetchLeaderboard(
        limit: number,
        sortBy: 'totalAttempts' | 'correctAttempts' | 'accuracy',
        startDate?: string,
        endDate?: string
    ): Promise<LeaderboardUser[]> {
        let query = `
            SELECT
                ual.user_id as userId,
                up.nickname,
                up.avatar_url as avatarUrl,
                COUNT(ual.id) as totalAttempts,
                SUM(ual.is_correct) as correctAttempts,
                CASE WHEN COUNT(ual.id) = 0 THEN 0.0 ELSE CAST(SUM(ual.is_correct) AS REAL) * 1.0 / COUNT(ual.id) END as accuracy
            FROM UserAnswersLog ual
            JOIN UserProfiles up ON ual.user_id = up.id
        `;
        const params: (string | number)[] = [];
        const whereClauses: string[] = [];

        if (startDate) {
            whereClauses.push('ual.answered_at >= ?');
            params.push(startDate);
        }
        if (endDate) {
            whereClauses.push('ual.answered_at <= ?');
            params.push(endDate);
        }

        if (whereClauses.length > 0) {
            query += ' WHERE ' + whereClauses.join(' AND ');
        }

        query += `
            GROUP BY ual.user_id, up.nickname, up.avatar_url
        `;

        switch (sortBy) {
            case 'totalAttempts':
                query += ' ORDER BY totalAttempts DESC';
                break;
            case 'correctAttempts':
                query += ' ORDER BY correctAttempts DESC';
                break;
            case 'accuracy':
                query += ' ORDER BY accuracy DESC';
                break;
            default:
                query += ' ORDER BY totalAttempts DESC'; // Default sort
        }

        query += ' LIMIT ?';
        params.push(limit);

        const { results } = await this.db.prepare(query).bind(...params).all<LeaderboardUser>();

        return results || [];
    }
}
