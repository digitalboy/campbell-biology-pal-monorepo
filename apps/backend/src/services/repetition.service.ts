import { Env } from '../index';

// Defines the intervals for spaced repetition, in days.
const REVIEW_STAGES_INTERVALS: { [key: number]: number } = {
  0: 1,
  1: 2,
  2: 4,
  3: 7,
  4: 15,
  5: 30,
  // Add more stages as needed
};

/**
 * Updates the spaced repetition schedule for a user and a question based on their answer.
 * @param env The Cloudflare environment bindings.
 * @param userId The ID of the user.
 * @param questionId The ID of the question.
 * @param isCorrect Whether the user answered the question correctly.
 */
export const updateRepetitionSchedule = async (env: Env, userId: string, questionId: string, isCorrect: boolean) => {
  const scheduleStmt = env.DB.prepare(
    'SELECT id, review_stage FROM SpacedRepetitionSchedule WHERE user_id = ? AND question_id = ?'
  );
  const schedule = await scheduleStmt.bind(userId, questionId).first<{ id: string; review_stage: number }>();

  if (isCorrect) {
    if (schedule) {
      // User answered a review question correctly, advance the stage.
      const nextStage = schedule.review_stage + 1;
      const nextReviewDays = REVIEW_STAGES_INTERVALS[nextStage];

      if (nextReviewDays) {
        // Advance to the next stage
        const updateStmt = env.DB.prepare(
          'UPDATE SpacedRepetitionSchedule SET review_stage = ?, next_review_at = datetime(\'now\', ?), last_reviewed_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        await updateStmt.bind(nextStage, `+${nextReviewDays} days`, schedule.id).run();
      } else {
        // Question is fully learned, retire it from the schedule.
        const retireStmt = env.DB.prepare(
          "UPDATE SpacedRepetitionSchedule SET status = 'retired', last_reviewed_at = CURRENT_TIMESTAMP WHERE id = ?"
        );
        await retireStmt.bind(schedule.id).run();
      }
    }
    // If the answer is correct and there's no schedule, do nothing. It was a new question answered correctly.
  } else {
    // Answer is wrong. If a schedule exists, reset it. Otherwise, create a new one.
    const reviewStage = 0; // Reset to the first stage
    const nextReviewDays = REVIEW_STAGES_INTERVALS[reviewStage];
    const nextReviewAtModifier = `+${nextReviewDays} days`;

    if (schedule) {
      // A schedule exists, so reset it to the initial stage.
      const updateStmt = env.DB.prepare(
        `UPDATE SpacedRepetitionSchedule
           SET review_stage = ?,
               next_review_at = datetime('now', ?),
               last_reviewed_at = CURRENT_TIMESTAMP,
               status = 'active'
         WHERE id = ?`
      );
      await updateStmt.bind(reviewStage, nextReviewAtModifier, schedule.id).run();
    } else {
      // No schedule exists, so create a new one.
      const insertStmt = env.DB.prepare(
        `INSERT INTO SpacedRepetitionSchedule (id, user_id, question_id, review_stage, next_review_at, last_reviewed_at, status)
         VALUES (?, ?, ?, ?, datetime('now', ?), CURRENT_TIMESTAMP, 'active')`
      );
      await insertStmt.bind(crypto.randomUUID(), userId, questionId, reviewStage, nextReviewAtModifier).run();
    }
  }
};
