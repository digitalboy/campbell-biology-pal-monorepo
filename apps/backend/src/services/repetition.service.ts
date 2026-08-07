/**
 * @file repetition.service.ts
 * @description 基于间隔重复 (Spaced Repetition Schedule / Anki) 算法的题目复习进度管理服务。
 * 
 * 备注 (经验教训与规范):
 * 1. 【核心教训】绝对不能在 SQLite 中将 datetime('now') 生成的 'YYYY-MM-DD HH:MM:SS' 与 TypeScript 生成带 'T'/'Z' 的 ISO 8601 字符串直接比对！
 *    因为 ASCII 码中字母 'T' (84) 大于空格 ' ' (32)，这会导致字典序比对在边缘时间产生严重的逻辑倒置。
 * 2. 依据用户全局规范：后端的数据库和逻辑的时间处理归一化，统一采用 ISO 8601 格式 (如: 2026-03-13T14:11:00.000Z)。
 */

import { Env } from '../index';

// Spaced Repetition 阶段间隔 (天数)
const REVIEW_STAGES_INTERVALS: { [key: number]: number } = {
  0: 1,  // 阶段 0: 1 天后复习
  1: 2,  // 阶段 1: 2 天后复习
  2: 4,  // 阶段 2: 4 天后复习
  3: 7,  // 阶段 3: 7 天后复习
  4: 15, // 阶段 4: 15 天后复习
  5: 30, // 阶段 5: 30 天后复习
};

/**
 * 根据用户答题正确与否，更新题目在间隔重复 (SRS) 计划中的复习阶段与下次复习 ISO 时间
 * @param env Cloudflare 环境变量绑定
 * @param userId 用户 ID
 * @param questionId 题目 ID
 * @param isCorrect 答题是否正确
 */
export const updateRepetitionSchedule = async (env: Env, userId: string, questionId: string, isCorrect: boolean) => {
  const now = new Date();
  const nowIso = now.toISOString();

  const scheduleStmt = env.DB.prepare(
    'SELECT id, review_stage FROM SpacedRepetitionSchedule WHERE user_id = ? AND question_id = ?'
  );
  const schedule = await scheduleStmt.bind(userId, questionId).first<{ id: string; review_stage: number }>();

  if (isCorrect) {
    if (schedule) {
      // 答对了复习题：晋级下一个阶段
      const nextStage = schedule.review_stage + 1;
      const nextReviewDays = REVIEW_STAGES_INTERVALS[nextStage];

      if (nextReviewDays) {
        // 计算严格的 ISO 8601 下次复习时间
        const nextReviewDate = new Date(now.getTime() + nextReviewDays * 24 * 60 * 60 * 1000).toISOString();
        const updateStmt = env.DB.prepare(
          'UPDATE SpacedRepetitionSchedule SET review_stage = ?, next_review_at = ?, last_reviewed_at = ? WHERE id = ?'
        );
        await updateStmt.bind(nextStage, nextReviewDate, nowIso, schedule.id).run();
      } else {
        // 已完成全阶段复习，标记为 retired 毕业状态
        const retireStmt = env.DB.prepare(
          "UPDATE SpacedRepetitionSchedule SET status = 'retired', last_reviewed_at = ? WHERE id = ?"
        );
        await retireStmt.bind(nowIso, schedule.id).run();
      }
    }
  } else {
    // 答错了题目：重置为初始阶段 0
    const reviewStage = 0;
    const nextReviewDays = REVIEW_STAGES_INTERVALS[reviewStage]; // 1 天
    const nextReviewDate = new Date(now.getTime() + nextReviewDays * 24 * 60 * 60 * 1000).toISOString();

    if (schedule) {
      // 已存在复习记录：原位重置为 Stage 0 并归一化 ISO 时间
      const updateStmt = env.DB.prepare(
        `UPDATE SpacedRepetitionSchedule
           SET review_stage = ?,
               next_review_at = ?,
               last_reviewed_at = ?,
               status = 'active'
         WHERE id = ?`
      );
      await updateStmt.bind(reviewStage, nextReviewDate, nowIso, schedule.id).run();
    } else {
      // 首次做错题目：新建 SRS 复习记录，写入归一化 ISO 8601 时间戳
      const newId = crypto.randomUUID();
      const insertStmt = env.DB.prepare(
        `INSERT INTO SpacedRepetitionSchedule (id, user_id, question_id, review_stage, next_review_at, last_reviewed_at, status)
         VALUES (?, ?, ?, ?, ?, ?, 'active')`
      );
      await insertStmt.bind(newId, userId, questionId, reviewStage, nextReviewDate, nowIso).run();
    }
  }
};
