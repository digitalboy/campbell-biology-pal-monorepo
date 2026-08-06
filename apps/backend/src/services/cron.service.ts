/**
 * @file cron.service.ts
 * @description Cloudflare Scheduled Handler (Cron Triggers) 复习提醒定时任务服务。
 * 
 * 备注 (经验教训与规范):
 * 1. 严格遵守用户全局规范，时间戳写入与比对统一采用严格 ISO 8601 格式 (如: 2026-03-13T14:11:00.000Z)。
 * 2. 防骚扰打扰策略：针对每位用户，24 小时内最多发送 1 封汇总提醒邮件。
 */

import { Env } from '../index';
import { sendReviewReminderEmail } from './email.service';

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
  console.log(`[CronService] Starting scheduled review reminder process at ${new Date().toISOString()}`);
  
  let processed = 0;
  let sent = 0;
  let errors = 0;

  try {
    // 1. 查询所有拥有到期且未复习错题的用户列表及对应的到期题目总数
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
      WHERE srs.next_review_at <= CURRENT_TIMESTAMP
        AND srs.status = 'active'
      GROUP BY up.id, up.email, up.nickname, up.last_review_notified_at, up.email_notifications_enabled;
    `;

    const stmt = env.DB.prepare(query);
    const { results } = await stmt.all<DueUserRecord>();

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

      // 2. 发送复习提醒邮件
      const emailResult = await sendReviewReminderEmail(
        env.EMAIL,
        { email: record.email, nickname: record.nickname || 'Learner' },
        record.due_count
      );

      if (emailResult.success) {
        sent++;
        // 3. 成功后用严格 ISO 8601 时间戳更新用户的 last_review_notified_at
        const nowIso = new Date().toISOString();
        try {
          const updateStmt = env.DB.prepare(
            'UPDATE UserProfiles SET last_review_notified_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
          );
          await updateStmt.bind(nowIso, record.user_id).run();
          console.log(`[CronService] Updated last_review_notified_at for user ${record.user_id} to ${nowIso}`);
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
