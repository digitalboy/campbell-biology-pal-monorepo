/**
 * @file router.ts
 * @description 后端 Hono API 路由定义文件。
 * 
 * 备注 (经验教训):
 * 修正了原先 `router.route('/api/v1/users/me', meRouter)` 在 Hono 框架中因未匹配末尾斜杠导致 `GET /api/v1/users/me` 报 501/404 错误的重大 BUG。
 * 现全量改用显式路径声明，确保 RESTful 规范与 100% 路由兼容。
 */

import { Hono } from 'hono';
import { Env } from './index';
import { syncUserHandler, getDashboardStatsHandler, getUserProfileHandler, updateUserProfileHandler } from './handlers/user.handler';
import { getPageCompanionDataHandler } from './handlers/content.handler'; 
import { submitAnswerHandler } from './handlers/quiz.handler';
import { getDueReviewsHandler, getWrongAnswersHandler } from './handlers/review.handler';
import { getRelatedNodesHandler, getGraphDictionaryHandler, deleteNodeHandler } from './handlers/graph.handler';
import { handleCreateComment, handleGetComments, handleDeleteComment, handleGetCommentById, getLeaderboardHandler } from './handlers/social.handler';
import { aiCompletionHandler, saveAiInteractionHandler, getRecentAiInteractionsHandler, deleteAiInteractionHandler } from './handlers/ai.handler';
import { getPageContentHandler, upsertPageContentHandler } from './handlers/pdfcontent.handler';
import { cors } from 'hono/cors';
import { authMiddleware } from './middleware/auth.middleware';
import { adminMiddleware } from './middleware/admin.middleware';

export type HonoContextVariables = {
  userId: string;
};

const router = new Hono<{ Bindings: Env; Variables: HonoContextVariables }>();

// --- Middlewares ---
router.use('*', cors());

// 根路由
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

// --- Content & Quiz Routes ---
router.get('/api/v1/pages/:pageNumber/companion-data', authMiddleware, getPageCompanionDataHandler);
router.post('/api/v1/questions/:questionId/submit', authMiddleware, submitAnswerHandler);

// --- Knowledge Graph Routes ---
router.get('/api/v1/graph/dictionary', getGraphDictionaryHandler);
router.get('/api/v1/graph/nodes/:uuid/related', getRelatedNodesHandler);
router.delete('/api/v1/graph/nodes/:uuid', authMiddleware, adminMiddleware, deleteNodeHandler);

// --- Social (Comments) Routes ---
router.post('/api/v1/comments', authMiddleware, handleCreateComment);
router.get('/api/v1/comments', authMiddleware, handleGetComments);
router.get('/api/v1/comments/:commentId', authMiddleware, handleGetCommentById);
router.delete('/api/v1/comments/:commentId', authMiddleware, handleDeleteComment);

// --- Social (Leaderboard) Routes ---
router.get('/api/v1/leaderboard', authMiddleware, getLeaderboardHandler);

// --- PDF Content Routes ---
router.get('/api/v1/pdf-content/:pageNumber', authMiddleware, getPageContentHandler);
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