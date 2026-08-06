/**
 * @file email.service.ts
 * @description Cloudflare Email Service (Workers API) 邮件发送服务模块。
 * 
 * 备注 (经验教训与规范):
 * 1. 严格依据 Cloudflare 官方文档 (https://developers.cloudflare.com/email-service/api/send-emails/workers-api/) 编写。
 * 2. 错误处理捕获带 `.code` 属性的标准 Error 对象 (如 E_SENDER_NOT_VERIFIED, E_RATE_LIMIT_EXCEEDED 等)。
 * 3. 邮件包含规范的 HTML 与纯文本 fallback。
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface Attachment {
  content: string | ArrayBuffer | ArrayBufferView;
  filename: string;
  type: string;
  disposition?: 'attachment' | 'inline';
  contentId?: string;
}

/**
 * 官方 EmailMessageBuilder 接口定义
 */
export interface EmailMessageBuilder {
  to: string | EmailAddress | (string | EmailAddress)[];
  from: string | EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  cc?: string | EmailAddress | (string | EmailAddress)[];
  bcc?: string | EmailAddress | (string | EmailAddress)[];
  replyTo?: string | EmailAddress;
  attachments?: Attachment[];
  headers?: { [key: string]: string };
}

export interface EmailSendResult {
  messageId: string;
}

export interface SendEmailBinding {
  send(message: EmailMessageBuilder): Promise<EmailSendResult>;
}

/**
 * 备注 (国际化 i18n 扩展设计与经验教训):
 * 当前由于英文用户占绝大多数，默认采用英文邮件模板 (en-US)。
 * 未来扩展架构：可根据用户在 UserProfiles 表中配置的首选语言 `preferred_language` (如 'zh-CN', 'en-US', 'es', 'ja' 等) 
 * 动态切换对应语言包字典 (Dictionaries) 或模板渲染函数，实现 100% 国际化多语言自动匹配发送。
 */

/**
 * 渲染精美的响应式 HTML 复习提醒邮件 (英文版)
 */
export const renderReviewReminderHtml = (nickname: string, dueCount: number, lang: string = 'en'): string => {
  // 未来拓展：根据 lang 参数支持多语言字典切分 (en, zh, es 等)
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Review Reminder - Campbell Biology PAL</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f4f7f6;
      color: #2d3748;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .container {
      max-width: 600px;
      margin: 30px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      padding: 32px 24px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .header p {
      margin: 8px 0 0 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .body-content {
      padding: 32px 24px;
      line-height: 1.6;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 16px;
    }
    .stat-card {
      background-color: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .stat-number {
      font-size: 36px;
      font-weight: 800;
      color: #059669;
      line-height: 1;
    }
    .stat-label {
      font-size: 14px;
      color: #047857;
      margin-top: 6px;
      font-weight: 500;
    }
    .cta-button {
      display: block;
      width: 240px;
      margin: 28px auto 0 auto;
      padding: 14px 0;
      background-color: #10b981;
      color: #ffffff !important;
      text-decoration: none;
      text-align: center;
      font-weight: 600;
      font-size: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3);
      transition: background-color 0.2s ease;
    }
    .footer {
      background-color: #f8fafc;
      padding: 20px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧬 Campbell Biology PAL</h1>
      <p>AI-Powered Biology Companion · Spaced Repetition</p>
    </div>
    <div class="body-content">
      <div class="greeting">Hi ${nickname},</div>
      <p>Repetition is the key to mastery! According to your spaced repetition schedule, you have questions ready for review today:</p>
      
      <div class="stat-card">
        <div class="stat-number">${dueCount}</div>
        <div class="stat-label">Question${dueCount > 1 ? 's' : ''} Due for Review</div>
      </div>

      <p>Reviewing on time reinforces your long-term memory retention. Ready for today's biology challenge?</p>

      <a href="https://biopal-campbell.beikee.org/review" class="cta-button">Start Review Now</a>
    </div>
    <div class="header-footer" style="padding: 0 24px 20px 24px; text-align: center; font-size: 12px; color: #64748b;">
      If the button above doesn't work, copy and paste this link into your browser:<br>
      <a href="https://biopal-campbell.beikee.org/review" style="color: #10b981;">https://biopal-campbell.beikee.org/review</a>
    </div>
    <div class="footer">
      &copy; 2026 Campbell Biology PAL. All rights reserved.<br>
      This email was sent automatically, please do not reply.
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * 发送复习提醒邮件服务函数
 * @param emailBinding Cloudflare SendEmail 绑定对象
 * @param recipient 收件人对象 { email, nickname }
 * @param dueCount 到期错题数量
 */
export const sendReviewReminderEmail = async (
  emailBinding: SendEmailBinding,
  recipient: { email: string; nickname: string },
  dueCount: number
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  if (!emailBinding) {
    console.error('[EmailService] Cloudflare send_email binding is undefined.');
    return { success: false, error: 'EMAIL binding missing' };
  }

  if (!recipient.email) {
    return { success: false, error: 'Recipient email is missing' };
  }

  // 默认采用英文模版，在代码注释中已记录未来基于用户 UserProfiles.language 拓展 i18n 动态匹配机制
  const subject = `📚 Review Reminder: ${recipient.nickname}, you have ${dueCount} question${dueCount > 1 ? 's' : ''} ready for review!`;
  const textContent = `Hi ${recipient.nickname},\n\nAccording to your spaced repetition schedule, you have ${dueCount} question(s) ready for review today. Please visit Campbell Biology PAL to start your review: https://biopal-campbell.beikee.org/review\n\nBest,\nCampbell Biology PAL Team`;
  const htmlContent = renderReviewReminderHtml(recipient.nickname, dueCount, 'en');

  try {
    const result = await emailBinding.send({
      to: [{ email: recipient.email, name: recipient.nickname }],
      from: { email: 'noreply@beikee.org', name: 'Campbell Biology PAL' },
      subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`[EmailService] Email successfully sent to ${recipient.email}, messageId: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    const errorCode = error.code || 'UNKNOWN_ERROR';
    const errorMessage = error.message || String(error);
    console.error(`[EmailService] Failed to send email to ${recipient.email}. Code: ${errorCode}, Error: ${errorMessage}`);

    // 依照官方文档进行针对性错误解析记录
    switch (errorCode) {
      case 'E_SENDER_NOT_VERIFIED':
        console.error('[EmailService] Fatal: Sender domain is not verified in Cloudflare Email Service.');
        break;
      case 'E_RATE_LIMIT_EXCEEDED':
      case 'E_DAILY_LIMIT_EXCEEDED':
        console.warn('[EmailService] Warning: Rate or daily limit reached.');
        break;
      case 'E_RECIPIENT_SUPPRESSED':
        console.warn(`[EmailService] Recipient ${recipient.email} is in suppression list.`);
        break;
      default:
        break;
    }

    return { success: false, error: `[${errorCode}] ${errorMessage}` };
  }
};
