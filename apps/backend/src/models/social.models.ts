export interface CommentUser {
    id: string;
    nickname: string | null;
    avatar_url: string | null;
}

export interface Comment {
    id: string;
    user_id: string; // Foreign key
    user: CommentUser; // Nested user information
    parent_type: 'page' | 'question';
    parent_id: string;
    parent_comment_id?: string | null;
    content: string;
    status: 'visible' | 'hidden_by_moderator' | 'reported';
    created_at: string; // ISO 8601 format

    // For building nested comment trees
    replies?: Comment[];
}

export interface LeaderboardUser {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number; // A value between 0 and 1
}
