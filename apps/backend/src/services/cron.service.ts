/**
 * @file cron.service.ts
 * @description Cloudflare Scheduled Handler (Cron Triggers) 复习提醒定时任务服务。
 * 
 * 备注 (经验教训与规范):
 * 1. 【核心教训与时间归一化】严格遵守用户全局规范，时间戳写入与比对统一采用严格 ISO 8601 格式 (如: 2026-03-13T14:11:00.000Z)。
 *    避免在 SQLite 中直接使用 CURRENT_TIMESTAMP 与 ISO 8601 字符串比较，消除 ASCII 字符序导致的查询倒置隐患。
 * 2. 【防骚扰与冷却策略】针对每位用户，24 小时内最多发送 1 封汇总提醒邮件。
 */

import { Env } from '../index';
import { sendReviewReminderEmail, parseQuestionSnippet, DueQuestionPreview } from './email.service';

interface DueUserRecord {
  user_id: string;
  email: string;
  nickname: string;
  last_review_notified_at: string | null;
  email_notifications_enabled: number | boolean;
  due_count: number;
}

/**
 * 校验上次通知时间距今是否满足冷却时间（默认 24 小时）
 */
const isCooldownSatisfied = (lastNotifiedAt: string | null, cooldownHours: number = 24): boolean => {
  if (!lastNotifiedAt) {
    return true; // 从未通知过
  }
  const lastTime = new Date(lastNotifiedAt).getTime();
  if (isNaN(lastTime)) {
    return true; // 时间解析非法时默认满足
  }
  const now = Date.now();
  const diffHours = (now - lastTime) / (1000 * 60 * 60);
  return diffHours >= cooldownHours;
};

/**
 * 定时巡检任务：处理所有到达复习时间错题的邮件提醒发送
 * @param env Cloudflare 环境变量绑定
 */
export const processScheduledReviewReminders = async (env: Env): Promise<{ processed: number; sent: number; errors: number }> => {
  const nowIso = new Date().toISOString();
  console.log(`[CronService] Starting scheduled review reminder process at ${nowIso}`);
  
  let processed = 0;
  let sent = 0;
  let errors = 0;

  try {
    // 1. 查询所有拥有到期且未复习错题的用户列表及对应的到期题目总数 (绑定严格 ISO 8601 时间戳)
    const query = `
      SELECT 
        up.id AS user_id, 
        up.email, 
        up.nickname, 
        up.last_review_notified_at,
        up.email_notifications_enabled,
        COUNT(srs.id) AS due_count
      FROM SpacedRepetitionSchedule srs
      JOIN UserProfiles up ON srs.user_id = up.id
      WHERE srs.next_review_at <= ?
        AND srs.status = 'active'
      GROUP BY up.id, up.email, up.nickname, up.last_review_notified_at, up.email_notifications_enabled;
    `;

    const stmt = env.DB.prepare(query);
    const { results } = await stmt.bind(nowIso).all<DueUserRecord>();

    if (!results || results.length === 0) {
      console.log('[CronService] No users with due review questions found at this time.');
      return { processed: 0, sent: 0, errors: 0 };
    }

    console.log(`[CronService] Found ${results.length} candidate user(s) with due review questions.`);

    for (const record of results) {
      processed++;

      // 检查开关
      const isEnabled = Number(record.email_notifications_enabled) !== 0;
      if (!isEnabled) {
        console.log(`[CronService] User ${record.user_id} (${record.email}) disabled email notifications. Skipping.`);
        continue;
      }

      // 检查邮箱有效性
      if (!record.email || !record.email.includes('@')) {
        console.warn(`[CronService] User ${record.user_id} has invalid email: ${record.email}. Skipping.`);
        continue;
      }

      // 检查冷却时间 (24h)
      if (!isCooldownSatisfied(record.last_review_notified_at, 24)) {
        console.log(`[CronService] User ${record.email} was notified recently (${record.last_review_notified_at}). Cooldown active. Skipping.`);
        continue;
      }

      // 1.5 提取该用户最优先到期的前 3 道题目及题干摘要
      // 备注 (经验教训与规范): 用户惯用语言偏好暂未设计接入，提取题干时统一采用英文 (en) 作为默认/兜底语言。
      let previews: DueQuestionPreview[] = [];
      try {
        const previewsQuery = `
          SELECT q.id, q.question_text
          FROM SpacedRepetitionSchedule srs
          JOIN Questions q ON srs.question_id = q.id
          WHERE srs.user_id = ? AND srs.next_review_at <= ? AND srs.status = 'active'
          ORDER BY srs.next_review_at ASC
          LIMIT 3;
        `;
        const previewsStmt = env.DB.prepare(previewsQuery);
        const { results: dueQResults } = await previewsStmt.bind(record.user_id, nowIso).all<{ id: string; question_text: string }>();

        if (dueQResults && dueQResults.length > 0) {
          previews = dueQResults.map(q => ({
            id: q.id,
            text: parseQuestionSnippet(q.question_text, 80),
          }));
        }
      } catch (previewErr) {
        console.error(`[CronService] Failed to fetch due question previews for user ${record.user_id}:`, previewErr);
        // 抓取题干错误时不抛出异常中断流程，降级发送无预览的统计邮件
      }

      // 2. 发送复习提醒邮件
      const emailResult = await sendReviewReminderEmail(
        env.EMAIL,
        { email: record.email, nickname: record.nickname || 'Learner' },
        record.due_count,
        previews
      );

      if (emailResult.success) {
        sent++;
        // 3. 成功后用严格 ISO 8601 时间戳更新用户的 last_review_notified_at
        const updateTimeIso = new Date().toISOString();
        try {
          const updateStmt = env.DB.prepare(
            'UPDATE UserProfiles SET last_review_notified_at = ?, updated_at = ? WHERE id = ?'
          );
          await updateStmt.bind(updateTimeIso, updateTimeIso, record.user_id).run();
          console.log(`[CronService] Updated last_review_notified_at for user ${record.user_id} to ${updateTimeIso}`);
        } catch (dbErr) {
          console.error(`[CronService] Failed to update last_review_notified_at for user ${record.user_id}:`, dbErr);
        }
      } else {
        errors++;
        console.error(`[CronService] Failed to send reminder email to user ${record.email}: ${emailResult.error}`);
      }
    }

    console.log(`[CronService] Completed scheduled process. Processed: ${processed}, Sent: ${sent}, Errors: ${errors}`);
    return { processed, sent, errors };

  } catch (error: any) {
    console.error('[CronService] Error running processScheduledReviewReminders:', error);
    return { processed, sent, errors: errors + 1 };
  }
};
