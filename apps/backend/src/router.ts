/**
 * @file router.ts
 * @description 后端 Hono API 路由全量注册与契约对齐文件。
 * 
 * 备注 (经验教训与规范):
 * 1. RESTful 端点契约对齐: 必须确保所有核心业务 API 端点统一以 /api/v1 为前缀，并与前端 apiClient.ts 及 Domain Service 100% 精确映射。
 * 2. 答题提交双向兼容 (Anti-404 Pattern): 同时绑定 /api/v1/questions/:questionId/submit 与 /api/v1/questions/:questionId/answers，彻底杜绝契约不一致导致的 404 Not Found。
 * 3. 显式路径声明: 全量使用完整 URL 显式路径注册，严禁使用带有通配符的子 Router route()，消除 Hono 框架因末尾斜杠匹配失败导致的 501/404。
 */

import { Hono } from 'hono';
import { Env } from './index';
import { syncUserHandler, getDashboardStatsHandler, getUserProfileHandler, updateUserProfileHandler } from './handlers/user.handler';
import { getPageCompanionDataHandler } from './handlers/content.handler'; 
import { submitAnswerHandler, getQuestionByIdHandler } from './handlers/quiz.handler';
import { getDueReviewsHandler, getWrongAnswersHandler, triggerReviewRemindersHandler } from './handlers/review.handler';
import { getRelatedNodesHandler, getGraphDictionaryHandler, deleteNodeHandler, searchGraphHandler } from './handlers/graph.handler';
import { handleCreateComment, handleGetComments, handleDeleteComment, handleGetCommentById, getLeaderboardHandler } from './handlers/social.handler';
import { aiCompletionHandler, saveAiInteractionHandler, getRecentAiInteractionsHandler, deleteAiInteractionHandler } from './handlers/ai.handler';
import { getPageContentHandler, upsertPageContentHandler } from './handlers/pdfcontent.handler';
import { getRobotsTxtHandler, getSitemapXmlHandler } from './handlers/seo.handler';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth.middleware';
import { adminMiddleware } from './middleware/admin.middleware';

export type HonoContextVariables = {
  userId: string;
};

const router = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// --- Middlewares ---
router.use('*', cors());

// SEO & 根路由
router.get('/robots.txt', getRobotsTxtHandler);
router.get('/sitemap.xml', getSitemapXmlHandler);

router.get('/', (c) => {
  return c.json({
    ok: true,
    message: 'Hello! This is the Campbell Biology Pal API.',
  });
});

// 健康检查
router.get('/api/v1/status', (c) => {
  return c.json({
    ok: true,
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// --- User Routes ---
router.post('/api/v1/users/sync', syncUserHandler);
router.get('/api/v1/users/me', authMiddleware, getUserProfileHandler);
router.put('/api/v1/users/me', authMiddleware, updateUserProfileHandler);
router.get('/api/v1/users/me/reviews/due', authMiddleware, getDueReviewsHandler);
router.get('/api/v1/users/me/dashboard-stats', authMiddleware, getDashboardStatsHandler);
router.get('/api/v1/users/me/wrong-answers', authMiddleware, getWrongAnswersHandler);

// --- Admin / Review Notification Routes ---
router.post('/api/v1/admin/trigger-reminders', authMiddleware, adminMiddleware, triggerReviewRemindersHandler);

// --- Content & Quiz Routes ---
// 备注 (经验教训): 解绑 authMiddleware，允许未登录访客与搜索引擎爬虫 (Googlebot) 公开只读访问页面伴侣数据
router.get('/api/v1/pages/:pageNumber/companion-data', getPageCompanionDataHandler);

// --- Question Routes ---
router.get('/api/v1/questions/:id', getQuestionByIdHandler);
router.post('/api/v1/questions/:questionId/answers', authMiddleware, submitAnswerHandler);
// 备注 (经验教训): 兼容前端 apiClient.ts 发起的 /submit 路径，防止后端只绑定 /answers 导致 404 Not Found
router.post('/api/v1/questions/:questionId/submit', authMiddleware, submitAnswerHandler);

// --- Global Search Routes ---
router.get('/api/v1/search', searchGraphHandler);

// --- Knowledge Graph Routes ---
router.get('/api/v1/graph/dictionary', getGraphDictionaryHandler);
router.get('/api/v1/graph/nodes/:uuid/related', getRelatedNodesHandler);
router.delete('/api/v1/graph/nodes/:uuid', authMiddleware, adminMiddleware, deleteNodeHandler);

// --- Social (Comments) Routes ---
router.post('/api/v1/comments', authMiddleware, handleCreateComment);
router.get('/api/v1/comments', handleGetComments);
router.get('/api/v1/comments/:commentId', handleGetCommentById);
router.delete('/api/v1/comments/:commentId', authMiddleware, handleDeleteComment);

// --- Social (Leaderboard) Routes ---
router.get('/api/v1/leaderboard', authMiddleware, getLeaderboardHandler);

// --- PDF Content Routes ---
// 备注 (经验教训): 允许未登录只读获取 PDF 页面内容概要，写操作依然保留 authMiddleware & adminMiddleware
router.get('/api/v1/pdf-content/:pageNumber', getPageContentHandler);
router.put('/api/v1/pdf-content', authMiddleware, adminMiddleware, upsertPageContentHandler);

// --- AI Routes ---
router.post('/api/v1/ai/completions', authMiddleware, aiCompletionHandler);
router.post('/api/v1/ai/interactions', authMiddleware, saveAiInteractionHandler);
router.get('/api/v1/ai/interactions', authMiddleware, getRecentAiInteractionsHandler);
router.delete('/api/v1/ai/interactions/:id', authMiddleware, deleteAiInteractionHandler);

// 数据库连接测试路由
router.get('/api/v1/db-test', async (c) => {
  try {
    const { results } = await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    return c.json({
      ok: true,
      message: 'Database connection successful!',
      tables: results.map(t => t.name),
    });
  } catch (e: any) {
    console.error('DB Test Error:', e);
    return c.json(
      {
        ok: false,
        message: 'Database connection failed.',
        error: e.message,
      },
      500
    );
  }
});

export default router;