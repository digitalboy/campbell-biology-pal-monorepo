import router from './router';
import { SendEmailBinding } from './services/email.service';
import { processScheduledReviewReminders } from './services/cron.service';

// 定义环境变量绑定
// 这个接口需要与 wrangler.toml 中定义的绑定相匹配
export interface Env {
  DB: D1Database;
  // Cloudflare 原生 Email Sending 绑定
  EMAIL: SendEmailBinding;
  // Neo4j AuraDB Credentials
  NEO4J_URI: string;
  NEO4J_USERNAME: string;
  NEO4J_PASSWORD: string;
  // Vars from wrangler.toml
  ENVIRONMENT: string;
  FIREBASE_PROJECT_ID: string;
  // Dashscope (OpenAI-compatible) Credentials
  DASHSCOPE_BASE_URL: string;
  DASHSCOPE_API_KEY: string;
}

export default {
  // Cloudflare Worker 的主 HTTP 入口点
  fetch: async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    // 将所有请求交给 Hono 路由器处理
    return router.fetch(request, env, ctx);
  },
  
  // Cloudflare Worker 的 Scheduled Handler (Cron 定时器)
  scheduled: async (event: any, env: Env, ctx: ExecutionContext): Promise<void> => {
    console.log(`[ScheduledEvent] Scheduled event triggered at ${new Date().toISOString()}, cron: ${event.cron}`);
    ctx.waitUntil(processScheduledReviewReminders(env));
  },
};
