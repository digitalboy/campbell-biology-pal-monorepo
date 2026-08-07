import { Env } from '../index';
import { Question, DueQuestion, QuestionSocialStats, QuestionUserStats } from '../models/quiz.models';

// For the social feature: stats for all users who answered the question
interface SocialAnswerStat {
  question_id: string;
  user_id: string;
  nickname: string;
  avatar_url: string;
  totalAttempts: number;
  correctAttempts: number;
}

interface UserAnswerStat {
  question_id: string;
  totalAttempts: number;
  correctAttempts: number;
}

/**
 * Parses a raw database row into a structured Question object.
 * D1 returns all columns as-is, so JSON strings need to be parsed manually.
 * @param q The raw question object from the database.
 * @returns A structured Question object.
 */
const parseQuestionFromDb = <T extends Question>(q: any): T => {
  const correctAnswers = JSON.parse(q.correct_answers);
  return {
    ...q,
    choice_type: correctAnswers.length > 1 ? 'multiple_choice' : 'single_choice',
    question_text: JSON.parse(q.question_text),
    options: JSON.parse(q.options),
    correct_answers: correctAnswers,
    explanation: JSON.parse(q.explanation),
  } as T;
};


// --- Service Functions ---

/**
 * Retrieves all questions that are due for review for a specific user.
 */
export const getDueReviewQuestions = async (env: Env, userId: string): Promise<DueQuestion[]> => {
  const { DB } = env;
  const nowIso = new Date().toISOString();
  const stmt = DB.prepare(`
    SELECT q.*, srs.last_reviewed_at, srs.review_stage
    FROM Questions q
    JOIN SpacedRepetitionSchedule srs ON q.id = srs.question_id
    WHERE srs.user_id = ? AND srs.next_review_at <= ? AND srs.status = 'active'
  `).bind(userId, nowIso);
  const { results } = await stmt.all<any>();
  return results ? results.map(q => parseQuestionFromDb<DueQuestion>(q)) : [];
};

/**
 * Retrieves all unique questions that a user has answered incorrectly,
 * enriched with social stats from other users.
 */
export const getWronglyAnsweredQuestions = async (env: Env, userId: string, startDate?: string, endDate?: string): Promise<Question[]> => {
  const { DB } = env;
  let query = `
    SELECT DISTINCT q.*
    FROM Questions q
    JOIN UserAnswersLog ual ON q.id = ual.question_id
    WHERE ual.user_id = ? AND ual.is_correct = 0
  `;
  const params: (string | number)[] = [userId];

  if (startDate) {
    query += ` AND ual.answered_at >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND ual.answered_at <= ?`;
    params.push(endDate);
  }

  console.log('DEBUG: WronglyAnsweredQuestions Query:', query);
  console.log('DEBUG: WronglyAnsweredQuestions Params:', params);

  let wrongQuestionsDb: any[] = [];
  try {
    const wrongQuestionsStmt = DB.prepare(query).bind(...params);
    const { results } = await wrongQuestionsStmt.all<any>();
    wrongQuestionsDb = results || [];
  } catch (dbError: any) {
    console.error('ERROR: Database query failed in getWronglyAnsweredQuestions:', dbError);
    throw new Error('Failed to fetch wrong questions from database.');
  }

  if (wrongQuestionsDb.length === 0) {
    return [];
  }

  const questionIds = wrongQuestionsDb.map(q => q.id);
  const placeholders = questionIds.map(() => '?').join(',');

  // --- NEW: Fetch current user's stats for these questions ---
  const currentUserStatsStmt = DB.prepare(
    `SELECT
       question_id,
       COUNT(*) as totalAttempts,
       SUM(is_correct) as correctAttempts
     FROM UserAnswersLog
     WHERE user_id = ? AND question_id IN (${placeholders})
     GROUP BY question_id`
  );
  const { results: currentUserStats } = await currentUserStatsStmt.bind(userId, ...questionIds).all<UserAnswerStat>();

  const currentUserStatsMap = new Map<string, QuestionUserStats>();
  if (currentUserStats) {
    currentUserStats.forEach(stat => {
      currentUserStatsMap.set(stat.question_id, {
        totalAttempts: stat.totalAttempts,
        correctAttempts: stat.correctAttempts,
      });
    });
  }
  // --- END NEW ---

  // 3. Fetch social stats for these specific questions (existing logic)
  const socialStatsStmt = DB.prepare(
    `SELECT
        ual.question_id,
        ual.user_id,
        up.nickname,
        up.avatar_url,
        COUNT(ual.id) as totalAttempts,
        SUM(ual.is_correct) as correctAttempts
      FROM UserAnswersLog ual
      JOIN UserProfiles up ON ual.user_id = up.id
      WHERE ual.question_id IN (${placeholders})
      GROUP BY ual.question_id, ual.user_id, up.nickname, up.avatar_url`
  );
  const { results: socialStats } = await socialStatsStmt.bind(...questionIds).all<SocialAnswerStat>();

  const socialStatsMap = new Map<string, QuestionSocialStats[]>();
  if (socialStats) {
    socialStats.forEach(stat => {
      const questionSocialStats = socialStatsMap.get(stat.question_id) || [];
      questionSocialStats.push({
        userId: stat.user_id,
        nickname: stat.nickname,
        avatarUrl: stat.avatar_url,
        totalAttempts: stat.totalAttempts,
        correctAttempts: stat.correctAttempts,
      });
      socialStatsMap.set(stat.question_id, questionSocialStats);
    });
  }

  // 4. Combine question data with user stats and social stats
  const questionsWithStats = wrongQuestionsDb.map(q => {
    const parsedQuestion = parseQuestionFromDb<Question>(q);
    const userStats = currentUserStatsMap.get(q.id); // Populate userStats
    const answeredByUsers = socialStatsMap.get(q.id) || [];
    return {
      ...parsedQuestion,
      userStats: userStats, // Assign current user's stats
      answeredByUsers: answeredByUsers,
    };
  });

  // --- NEW: Sort by error rate ---
  questionsWithStats.sort((a, b) => {
    // Handle cases where userStats might be missing or totalAttempts is 0
    const aErrorRate = (a.userStats && a.userStats.totalAttempts > 0)
      ? (a.userStats.totalAttempts - a.userStats.correctAttempts) / a.userStats.totalAttempts
      : -1; // -1 means unknown/no attempts, put at the end

    const bErrorRate = (b.userStats && b.userStats.totalAttempts > 0)
      ? (b.userStats.totalAttempts - b.userStats.correctAttempts) / b.userStats.totalAttempts
      : -1; // -1 means unknown/no attempts, put at the end

    // Sort in descending order of error rate
    return bErrorRate - aErrorRate;
  });
  // --- END NEW ---

  return questionsWithStats;
};