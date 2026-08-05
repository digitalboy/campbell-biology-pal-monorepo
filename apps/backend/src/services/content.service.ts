import { Env } from '../index';
import { Question, QuestionUserStats, QuestionSocialStats } from '../models/quiz.models';

// This interface reflects the raw data structure from the Questions table in the DB.
interface QuestionFromDB {
  id: string;
  page_number: number;
  difficulty: string;
  question_text: string; // JSON string
  options: string; // JSON string
  correct_answers: string; // JSON string
  explanation: string; // JSON string
  created_at: string;
  updated_at: string;
}

// For the currently logged-in user's stats
interface UserAnswerStat {
  question_id: string;
  totalAttempts: number;
  correctAttempts: number;
}

// For the social feature: stats for all users who answered the question
interface SocialAnswerStat {
  question_id: string;
  user_id: string;
  nickname: string;
  avatar_url: string;
  totalAttempts: number;
  correctAttempts: number;
}


/**
 * Fetches all questions for a page, enriched with the user's answer history
 * and social stats from other users.
 *
 * @param env - The environment variables containing the DB binding.
 * @param pageNumber - The page number to fetch questions for.
 * @param userId - The ID of the authenticated user to fetch stats for.
 * @returns A promise that resolves to an array of question objects with user stats.
 */
export async function getQuestionsForPage(env: Env, pageNumber: number, userId: string): Promise<Question[]> {
  try {
    // 1. Fetch all questions for the given page.
    const questionsStmt = env.DB.prepare('SELECT * FROM Questions WHERE page_number = ?');
    const { results: questionsFromDb } = await questionsStmt.bind(pageNumber).all<QuestionFromDB>();

    if (!questionsFromDb || questionsFromDb.length === 0) {
      return [];
    }

    const questionIds = questionsFromDb.map(q => q.id);
    const placeholders = questionIds.map(() => '?').join(',');

    // 2. Fetch current user's answer statistics for these questions.
    const statsStmt = env.DB.prepare(
      `SELECT
         question_id,
         COUNT(*) as totalAttempts,
         SUM(is_correct) as correctAttempts
       FROM UserAnswersLog
       WHERE user_id = ? AND question_id IN (${placeholders})
       GROUP BY question_id`
    );
    const { results: stats } = await statsStmt.bind(userId, ...questionIds).all<UserAnswerStat>();

    const statsMap = new Map<string, QuestionUserStats>();
    if (stats) {
      stats.forEach(stat => {
        statsMap.set(stat.question_id, {
          totalAttempts: stat.totalAttempts,
          correctAttempts: stat.correctAttempts,
        });
      });
    }

    // 3. Fetch social stats: get all users' stats for these questions.
    const socialStatsStmt = env.DB.prepare(
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

    // 4. Combine all data and parse JSON fields.
    return questionsFromDb.map(q => {
      const userStats = statsMap.get(q.id);
      const answeredByUsers = socialStatsMap.get(q.id) || [];
      const correctAnswers = JSON.parse(q.correct_answers);
      
      return {
        ...q,
        difficulty: q.difficulty,
        choice_type: correctAnswers.length > 1 ? 'multiple_choice' : 'single_choice',
        question_text: JSON.parse(q.question_text),
        options: JSON.parse(q.options),
        correct_answers: correctAnswers,
        explanation: JSON.parse(q.explanation),
        userStats: userStats, // Stats for the current user
        answeredByUsers: answeredByUsers, // Stats for all other users
      } as Question;
    });
  } catch (error) {
    console.error(`D1 Error fetching questions for page ${pageNumber}:`, error);
    throw new Error('Failed to fetch questions from database.');
  }
}