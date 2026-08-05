import router from './router';

// 定义环境变量绑定
// 这个接口需要与 wrangler.toml 中定义的绑定相匹配
export interface Env {
  DB: D1Database;
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
  // 如果未来有 R2, KV, Secret 等其他绑定，在此处添加
}

export default {
  // Cloudflare Worker 的主入口点
  fetch: async (request: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
    // 将所有请求交给 Hono 路由器处理
    return router.fetch(request, env, ctx);
  },
};
