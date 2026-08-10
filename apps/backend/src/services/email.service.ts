/**
 * @file email.service.ts
 * @description Cloudflare Email Service (Workers API) 邮件发送服务模块。
 * 
 * 备注 (经验教训与 UI 品牌规范):
 * 1. 严格统一全站 UI 品牌视觉规范 (Emerald Green #43664E / #10b981 品牌主色 + https://biopal-campbell.beikee.org/logo.svg 品牌 Logo)。
 * 2. 所有邮件模版 (复习提醒、评论回复) 共享统一的 Header, Typography 与 Color System，建立极其清晰一贯的品牌认知。
 * 3. 错误处理捕获带 .code 属性的标准 Error 对象 (如 E_SENDER_NOT_VERIFIED, E_RATE_LIMIT_EXCEEDED 等)。
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

export interface DueQuestionPreview {
  id: string;
  text: string;
}

// 统一品牌常量
const BRAND_LOGO_URL = 'https://biopal-campbell.beikee.org/logo.svg';
const BRAND_SITE_URL = 'https://biopal-campbell.beikee.org';

/**
 * 转义 HTML 敏感字符，防止题干特殊字符破坏邮件 DOM
 */
const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * 从题干原始 JSON 字符串中提取纯文本摘要。
 * 
 * 备注 (经验教训与规范):
 * 1. 用户习惯语言目前尚未接入 UserProfiles，因此依据要求，默认统一采用英文 (en) 作为主要/兜底语言。
 *    提取顺序为 en -> zh -> 第一个非空字符串，并在注释中保留该设计说明。
 * 2. 剥离任何潜在的 HTML 标签，且截断限制在 maxLength (默认 80 字) 以内，保证邮件卡片精简整洁。
 */
export const parseQuestionSnippet = (rawQuestionText: string, maxLength: number = 80): string => {
  let text = '';
  try {
    const parsed = typeof rawQuestionText === 'string' ? JSON.parse(rawQuestionText) : rawQuestionText;
    if (typeof parsed === 'string') {
      text = parsed;
    } else if (parsed && typeof parsed === 'object') {
      // 按照用户约定：优先采用英文 (en) 做兜底，英文缺失时回退中文 (zh) 或其他可用文本
      text = parsed.en || parsed.zh || Object.values(parsed).find((val) => typeof val === 'string') || 'Question details';
    }
  } catch (e) {
    text = String(rawQuestionText || '');
  }

  // 剥离 HTML 标签并清理空白
  text = text.replace(/<[^>]*>/g, '').trim();

  if (!text) {
    text = 'Biology Question';
  }

  if (text.length > maxLength) {
    text = text.substring(0, maxLength).trim() + '...';
  }

  return text;
};

/**
 * 渲染精美的响应式 HTML 复习提醒邮件 (支持题干预览与卡片式跳转)
 * 
 * 备注 (经验教训与规范):
 * 1. 采用项目统一的主色调 Emerald Green (#43664E / #10b981) 与 Logo。
 * 2. 题干单题直达链接统一使用 RESTful 规范路由: ${BRAND_SITE_URL}/questions/${q.id}。
 */
export const renderReviewReminderHtml = (
  nickname: string,
  dueCount: number,
  previews: DueQuestionPreview[] = [],
  lang: string = 'en'
): string => {
  let previewsHtml = '';
  if (previews && previews.length > 0) {
    const cardItems = previews.map((p, idx) => `
      <div class="preview-card">
        <div class="preview-title">Question Preview #${idx + 1}</div>
        <a href="${BRAND_SITE_URL}/questions/${p.id}" class="preview-text-link" target="_blank">
          ${escapeHtml(p.text)} &rarr;
        </a>
      </div>
    `).join('');

    const remainingCount = dueCount - previews.length;
    const moreNoteHtml = remainingCount > 0
      ? `<div class="more-count-note">...and ${remainingCount} more question${remainingCount > 1 ? 's' : ''} ready for review.</div>`
      : '';

    previewsHtml = `
      <div class="preview-card-list">
        ${cardItems}
        ${moreNoteHtml}
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Review Reminder - Campbell Biology PAL</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 0;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #2D4836 0%, #43664E 60%, #10b981 100%);
      color: #ffffff;
      padding: 36px 32px 28px 32px;
      text-align: center;
    }
    .brand-logo {
      width: 54px;
      height: 54px;
      margin-bottom: 12px;
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.15));
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: #ffffff;
    }
    .header p {
      margin: 6px 0 0 0;
      opacity: 0.9;
      font-size: 13px;
      color: #e2e8f0;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-weight: 500;
    }
    .body-content {
      padding: 36px 32px;
      line-height: 1.6;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 16px;
    }
    .stat-card {
      background-color: #f0fdf4;
      border: 1.5px solid #bbf7d0;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .stat-number {
      font-size: 42px;
      font-weight: 800;
      color: #15803d;
      line-height: 1;
    }
    .stat-label {
      font-size: 14px;
      color: #166534;
      margin-top: 8px;
      font-weight: 600;
    }
    .preview-card-list {
      margin: 20px 0;
    }
    .preview-card {
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #10b981;
      border-radius: 8px;
      padding: 14px 16px;
      margin-bottom: 10px;
      text-align: left;
    }
    .preview-title {
      font-size: 11px;
      font-weight: 700;
      color: #059669;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .preview-text-link {
      font-size: 14px;
      color: #0f172a;
      text-decoration: none;
      font-weight: 500;
      line-height: 1.4;
      display: block;
    }
    .preview-text-link:hover {
      color: #10b981;
      text-decoration: underline;
    }
    .more-count-note {
      font-size: 13px;
      color: #64748b;
      font-style: italic;
      text-align: center;
      margin-top: 10px;
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
      font-weight: 700;
      font-size: 16px;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img src="${BRAND_LOGO_URL}" alt="Campbell Biology PAL Logo" class="brand-logo" />
        <h1>Campbell Biology PAL</h1>
        <p>Spaced Repetition & Spaced Learning</p>
      </div>
      <div class="body-content">
        <div class="greeting">Hi ${nickname},</div>
        <p>Repetition is the key to biology mastery! According to your personalized spaced repetition schedule, you have questions ready for review today:</p>
        
        <div class="stat-card">
          <div class="stat-number">${dueCount}</div>
          <div class="stat-label">Question${dueCount > 1 ? 's' : ''} Due for Review</div>
        </div>

        ${previewsHtml}

        <p>Reviewing on time reinforces your long-term memory retention. Ready for today's biology challenge?</p>

        <a href="${BRAND_SITE_URL}/review" class="cta-button">Start Review Now</a>
      </div>
      <div class="footer">
        &copy; 2026 Campbell Biology PAL. All rights reserved.<br>
        This email was sent automatically, please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * 渲染精美的响应式 HTML 评论回复通知邮件 (品牌统一版)
 */
export const renderCommentReplyHtml = (
  recipientNickname: string,
  replierNickname: string,
  parentContent: string,
  replyContent: string,
  targetLink: string
): string => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Comment Reply - Campbell Biology PAL</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #1e293b;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f8fafc;
      padding: 40px 0;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #2D4836 0%, #43664E 60%, #10b981 100%);
      color: #ffffff;
      padding: 32px 32px 24px 32px;
      text-align: center;
    }
    .brand-logo {
      width: 48px;
      height: 48px;
      margin-bottom: 10px;
      filter: drop-shadow(0 4px 6px rgba(0,0,0,0.15));
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.3px;
    }
    .header p {
      margin: 4px 0 0 0;
      opacity: 0.9;
      font-size: 12px;
      color: #e2e8f0;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      font-weight: 500;
    }
    .body-content {
      padding: 36px 32px;
      line-height: 1.6;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 16px;
    }
    .subtext {
      color: #475569;
      font-size: 15px;
      margin-bottom: 20px;
    }
    .quote-card {
      background-color: #f1f5f9;
      border-left: 4px solid #94a3b8;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
      font-size: 14px;
      color: #334155;
    }
    .quote-title {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .reply-card {
      background-color: #f0fdf4;
      border-left: 4px solid #10b981;
      border-radius: 8px;
      padding: 18px;
      margin: 20px 0;
      font-size: 15px;
      color: #14532d;
      font-weight: 500;
    }
    .reply-title {
      font-size: 11px;
      font-weight: 700;
      color: #059669;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .cta-button {
      display: block;
      width: 220px;
      margin: 32px auto 0 auto;
      padding: 13px 0;
      background-color: #10b981;
      color: #ffffff !important;
      text-decoration: none;
      text-align: center;
      font-weight: 700;
      font-size: 15px;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      border-top: 1px solid #f1f5f9;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <img src="${BRAND_LOGO_URL}" alt="Campbell Biology PAL Logo" class="brand-logo" />
        <h1>Campbell Biology PAL</h1>
        <p>Discussion Notification</p>
      </div>
      <div class="body-content">
        <div class="greeting">Hi ${recipientNickname},</div>
        <p class="subtext"><strong>${replierNickname}</strong> replied to a comment on Campbell Biology PAL:</p>
        
        <div class="quote-card">
          <div class="quote-title">ORIGINAL COMMENT</div>
          "${parentContent}"
        </div>

        <div class="reply-card">
          <div class="reply-title">NEW REPLY FROM ${replierNickname.toUpperCase()}</div>
          "${replyContent}"
        </div>

        <a href="${targetLink}" class="cta-button">View Discussion</a>
      </div>
      <div class="footer">
        &copy; 2026 Campbell Biology PAL. All rights reserved.<br>
        This email was sent automatically by Cloudflare Email Service.
      </div>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * 发送复习提醒邮件服务函数
 */
export const sendReviewReminderEmail = async (
  emailBinding: SendEmailBinding,
  recipient: { email: string; nickname: string },
  dueCount: number,
  previews: DueQuestionPreview[] = []
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  if (!emailBinding) {
    console.error('[EmailService] Cloudflare send_email binding is undefined.');
    return { success: false, error: 'EMAIL binding missing' };
  }

  if (!recipient.email) {
    return { success: false, error: 'Recipient email is missing' };
  }

  const subject = `📚 Review Reminder: ${recipient.nickname}, you have ${dueCount} question${dueCount > 1 ? 's' : ''} ready for review!`;
  
  let textContent = `Hi ${recipient.nickname},\n\nAccording to your spaced repetition schedule, you have ${dueCount} question(s) ready for review today.\n`;
  if (previews && previews.length > 0) {
    textContent += `\nHere are previews of your due questions:\n`;
    previews.forEach((p, idx) => {
      textContent += `${idx + 1}. ${p.text}\n   Link: ${BRAND_SITE_URL}/questions/${p.id}\n`;
    });
    if (dueCount > previews.length) {
      textContent += `...and ${dueCount - previews.length} more question(s).\n`;
    }
  }
  textContent += `\nPlease visit Campbell Biology PAL to start your review: ${BRAND_SITE_URL}/review\n\nBest,\nCampbell Biology PAL Team`;

  const htmlContent = renderReviewReminderHtml(recipient.nickname, dueCount, previews, 'en');

  try {
    const result = await emailBinding.send({
      to: [{ email: recipient.email, name: recipient.nickname }],
      from: { email: 'biopal-campbell-noreply@beikee.org', name: 'Campbell Biology PAL' },
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
    return { success: false, error: `[${errorCode}] ${errorMessage}` };
  }
};

/**
 * 发送评论回复通知邮件函数
 */
export const sendCommentReplyEmail = async (
  emailBinding: SendEmailBinding,
  recipient: { email: string; nickname: string },
  replierNickname: string,
  parentContent: string,
  replyContent: string,
  targetLink: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  if (!emailBinding) {
    console.error('[EmailService] Cloudflare send_email binding is undefined.');
    return { success: false, error: 'EMAIL binding missing' };
  }

  if (!recipient.email) {
    return { success: false, error: 'Recipient email is missing' };
  }

  const subject = `💬 New reply from ${replierNickname} on Campbell Biology PAL`;
  const textContent = `Hi ${recipient.nickname},\n\n${replierNickname} replied to a comment:\n\nOriginal: "${parentContent}"\nReply: "${replyContent}"\n\nView here: ${targetLink}\n\nBest,\nCampbell Biology PAL`;
  const htmlContent = renderCommentReplyHtml(recipient.nickname, replierNickname, parentContent, replyContent, targetLink);

  try {
    const result = await emailBinding.send({
      to: [{ email: recipient.email, name: recipient.nickname }],
      from: { email: 'biopal-campbell-noreply@beikee.org', name: 'Campbell Biology PAL' },
      subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`[EmailService] Comment reply email sent to ${recipient.email}, messageId: ${result.messageId}`);
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    const errorCode = error.code || 'UNKNOWN_ERROR';
    const errorMessage = error.message || String(error);
    console.error(`[EmailService] Failed to send comment reply email to ${recipient.email}. Code: ${errorCode}, Error: ${errorMessage}`);
    return { success: false, error: `[${errorCode}] ${errorMessage}` };
  }
};
