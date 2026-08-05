import { Env } from '../index';
import { DashboardStats, UserProfile } from '../models/user.models';
import { getDueReviewQuestions } from './review.service';

/**
 * The data required to create or update a user profile in the database.
 */
interface UserSyncData {
  id: string;
  email: string;
  nickname: string;
  avatar_url?: string;
}

/**
 * Synchronizes user profile information with the D1 database.
 * It creates a new user record if one doesn't exist, or updates the existing one.
 * This is an idempotent operation.
 * @param env The Cloudflare environment bindings, containing the DB.
 * @param user The user data to sync.
 */
export const syncUserService = async (env: Env, user: UserSyncData): Promise<void> => {
  const { id, email, nickname, avatar_url } = user;

  // Use INSERT ... ON CONFLICT to perform an "upsert" operation.
  // This ensures that if the user already exists, their profile is updated.
  const stmt = env.DB.prepare(
    `INSERT INTO UserProfiles (id, email, nickname, avatar_url) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       email = excluded.email,
       nickname = excluded.nickname,
       avatar_url = excluded.avatar_url,
       updated_at = CURRENT_TIMESTAMP`
  );

  // Bind values. If avatar_url is undefined, it will be bound as NULL in the database,
  // which is the desired behavior.
  await stmt.bind(id, email, nickname, avatar_url || null).run();
};

/**
 * Fetches a user's profile from the database.
 * @param env The Cloudflare environment bindings.
 * @param userId The ID of the user to fetch.
 * @returns A promise that resolves to the user's profile or null if not found.
 */
export const getUserProfile = async (env: Env, userId: string): Promise<UserProfile | null> => {
  const stmt = env.DB.prepare(
    'SELECT id, email, nickname, avatar_url, created_at, updated_at FROM UserProfiles WHERE id = ?'
  );
  const user = await stmt.bind(userId).first<UserProfile>();
  return user;
};

/**
 * The data required to update a user profile.
 */
interface UserUpdateData {
  nickname: string;
  avatar_url: string;
}

/**
 * Updates a user's profile information.
 * @param env The Cloudflare environment bindings.
 * @param userId The ID of the user to update.
 * @param data The new data for the user.
 * @returns A promise that resolves to the updated user profile.
 */
export const updateUserProfile = async (
  env: Env,
  userId: string,
  data: UserUpdateData
): Promise<UserProfile | null> => {
  const { nickname, avatar_url } = data;

  const stmt = env.DB.prepare(
    `UPDATE UserProfiles
     SET nickname = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  );

  const info = await stmt.bind(nickname, avatar_url, userId).run();

  // The 'changes' property is nested inside the 'meta' object for .run() results.
  // We use optional chaining because 'meta' can be undefined.
  if (info.meta?.changes > 0) {
    // Fetch and return the newly updated profile to confirm the change.
    return getUserProfile(env, userId);
  }
  return null; // Return null if user was not found or no changes were made.
};

/**
 * Gathers and computes statistics for the user's learning dashboard.
 * @param env The Cloudflare environment bindings.
 * @param userId The ID of the user.
 * @returns A promise that resolves to the user's dashboard statistics.
 */
export const getUserDashboardStats = async (env: Env, userId: string): Promise<DashboardStats> => {
  // 1. Get count of due reviews by reusing the review service.
  const dueReviews = await getDueReviewQuestions(env, userId);
  const dueReviewCount = dueReviews.length;

  // 2. Get total answers and overall accuracy in a single query.
  const logStmt = env.DB.prepare(
    `SELECT COUNT(*) as totalAnswers, AVG(is_correct) as overallAccuracy 
     FROM UserAnswersLog 
     WHERE user_id = ?`
  );
  const answerStats = await logStmt.bind(userId).first<{ totalAnswers: number; overallAccuracy: number | null }>();

  return {
    dueReviewCount: dueReviewCount,
    totalAnswers: answerStats?.totalAnswers || 0,
    // AVG returns null if there are no rows, so default to 0.
    // D1 returns AVG(is_correct) as a value between 0 and 1.
    overallAccuracy: answerStats?.overallAccuracy || 0,
    // Placeholders for future implementation
    weakestTopic: null,
    activityChart: {},
  };
};
