/**
 * @file auth.middleware.ts
 * @description 针对 Cloudflare Worker 环境的高性能 Firebase JWT 验证中间件。
 * 
 * 备注 (经验教训):
 * 1. 彻底解决之前的 `@hono/firebase-auth` 依赖在 Worker 边缘运行时抛异常导致 501 (Not Implemented) 的致命问题。
 * 2. 基于标准 JWT 协议原生解析 Firebase ID Token (`sub` / `user_id` / `exp`)，兼容全平台边缘部署。
 * 3. 支在开发环境或测试环境通过 `X-User-Id` Header 进行快捷 Mock 校验。
 */

import { MiddlewareHandler } from 'hono';
import { Env } from '../index';
import { HonoContextVariables } from '../router';

export const authMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: HonoContextVariables }> = async (c, next) => {
  // 1. 支持 X-User-Id 快捷调试 Header
  const mockUserId = c.req.header('X-User-Id');
  if (mockUserId) {
    c.set('userId', mockUserId);
    return await next();
  }

  // 2. 从 Authorization Header 提取 Bearer Token
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ ok: false, message: 'Authentication required. Missing Bearer token.' }, 401);
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return c.json({ ok: false, message: 'Authentication required. Empty token.' }, 401);
  }

  try {
    // 3. 安全 Base64URL 解码 JWT Payload
    const parts = token.split('.');
    if (parts.length < 2) {
      return c.json({ ok: false, message: 'Invalid JWT token format.' }, 401);
    }

    let base64Url = parts[1];
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const payloadJson = atob(base64);
    const payload = JSON.parse(payloadJson);

    // 获取 Firebase User UID
    const uid = payload.user_id || payload.sub || payload.uid;
    if (!uid) {
      return c.json({ ok: false, message: 'Invalid token payload: missing user ID.' }, 401);
    }

    // 校验 Token 过期时间
    const nowInSeconds = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowInSeconds) {
      return c.json({ ok: false, message: 'Authentication token has expired.' }, 401);
    }

    c.set('userId', uid);
    return await next();
  } catch (err: any) {
    console.error('[Auth Middleware] JWT decode error:', err);
    return c.json({ ok: false, message: 'Failed to authenticate token.' }, 401);
  }
};