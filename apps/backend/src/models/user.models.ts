/**
 * Represents the public profile of a user, mirroring the UserProfiles table in schema.sql.
 */
export interface UserProfile {
  id: string;          // Firebase User UID
  email: string;
  nickname: string;
  avatar_url?: string; // Optional
  created_at: string;  // ISO 8601 format
  updated_at: string;  // ISO 8601 format
}

/**
 * Defines the shape of the data required to synchronize a user.
 * This is typically received by the backend after a successful Firebase authentication.
 */
export interface SyncUserPayload {
  id: string;
  email: string;
  nickname?: string; // Nickname might be optional on first sync
  avatar_url?: string; // Optional, to match the UserProfile and handle cases where it's not provided.
}

/**
 * Defines the shape of the data for updating a user profile.
 * Corresponds to the request body of `PUT /users/me`.
 */
export interface UpdateUserPayload {
  nickname: string;
  avatar_url: string;
}
/**
 * Defines the structure for the user's learning dashboard statistics.
 */
export interface DashboardStats {
  dueReviewCount: number;
  totalAnswers: number;
  overallAccuracy: number; // A value between 0 and 1
  // NOTE: The following are placeholders for future, more complex calculations.
  weakestTopic: { name: string | null } | null;
  activityChart: any; // Placeholder for chart data structure
}
