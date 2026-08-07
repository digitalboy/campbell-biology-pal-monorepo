/**
 * @file ai.service.ts
 * @description 基于 DeepSeek 官方 API (DeepSeek-V4-Flash / deepseek-v4-flash) 交互服务。
 * 
 * 备注 (经验教训与规范):
 * 1. 【DeepSeek API 最新模型规范】使用 DeepSeek 官方最新的 'deepseek-v4-flash' (及 DeepSeek-V4-Flash-0731 版本)。
 *    使用 sanitizeModelName 函数动态映射，防止非标准 Model ID 导致 OpenAI SDK 抛出 404/400 APIError。
 * 2. 【时间规范归一化】所有交互落盘时间统一采用 2026-03-13T14:11:00.000Z 严格 ISO 8601 格式 (new Date().toISOString())。
 */

import { Env } from '../index';
import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { AiInteraction, CreateAiInteractionPayload } from '../models/ai.models';

export type ResponseFormat = {
  type: "text" | "json_object";
};

export type AiCompletionPayload = {
  model?: string;
  messages: any[];
  system_prompt?: string;
  response_format?: ResponseFormat;
  stream?: boolean;
};

/**
 * 备注 (经验教训与规范):
 * 严格按照用户指令与性价比规范：全局强制统一收敛使用性价比最高的极速模型 'deepseek-v4-flash'。
 * 彻底屏蔽 pro 及其他过时模型，从根源锁死为 'deepseek-v4-flash'，防止产生高额开销。
 */
export const sanitizeModelName = (inputModel?: string): string => {
  return 'deepseek-v4-flash';
};

/**
 * 初始化 OpenAI 客户端
 */
function getAiClient(env: Env): OpenAI {
  const apiKey = env.DEEPSEEK_API_KEY;
  const baseURL = env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

  if (!apiKey) {
    console.error('[AI Service] DEEPSEEK_API_KEY is undefined in Workers binding!');
  }

  return new OpenAI({
    apiKey: apiKey || 'dummy-key-missing',
    baseURL,
  });
}

/**
 * 非流式 AI 完成调用
 */
export async function createCompletion(
  env: Env,
  payload: AiCompletionPayload
): Promise<string | null> {
  try {
    const openai = getAiClient(env);
    const rawModel = payload.model || env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
    const targetModel = sanitizeModelName(rawModel);

    let finalSystemPrompt = payload.system_prompt || 'You are a helpful biology assistant specializing in Campbell Biology.';
    if (payload.response_format?.type === 'json_object') {
      finalSystemPrompt += ' You MUST respond in JSON format.';
    }

    const completion = await openai.chat.completions.create({
      model: targetModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...payload.messages,
      ],
      temperature: 0.7,
      response_format: payload.response_format,
    });

    const responseMessage = completion.choices[0]?.message?.content;
    return responseMessage || null;

  } catch (error: any) {
    console.error(`[AI Service] Error creating completion for model ${payload.model}:`, error);
    throw new Error(error.message || 'Failed to get completion from AI service.');
  }
}

/**
 * 流式 AI 完成调用 (SSE Server-Sent Events)
 */
export async function createCompletionStream(
  env: Env,
  payload: AiCompletionPayload
): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const openai = getAiClient(env);
  const rawModel = payload.model || env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
  const targetModel = sanitizeModelName(rawModel);

  let finalSystemPrompt = payload.system_prompt || 'You are a helpful biology assistant specializing in Campbell Biology.';
  if (payload.response_format?.type === 'json_object') {
    finalSystemPrompt += ' You MUST respond in JSON format.';
  }

  const stream = await openai.chat.completions.create({
    model: targetModel,
    messages: [
      { role: 'system', content: finalSystemPrompt },
      ...payload.messages,
    ],
    temperature: 0.7,
    response_format: payload.response_format,
    stream: true,
  });

  return stream;
}

/**
 * 保存 AI 交互对话历史至 Cloudflare D1
 */
export async function saveAiInteraction(
  env: Env,
  userId: string,
  payload: CreateAiInteractionPayload
): Promise<AiInteraction> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const { parent_type, parent_id, messages, response, model_used, metadata } = payload;
  const targetModel = sanitizeModelName(model_used || env.DEEPSEEK_MODEL || 'deepseek-v4-flash');

  const messagesJson = JSON.stringify(messages);

  const stmt = env.DB.prepare(
    `INSERT INTO AiInteractions (id, user_id, parent_type, parent_id, messages, response, model_used, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  await stmt.bind(
    id,
    userId,
    parent_type || null,
    parent_id || null,
    messagesJson,
    response,
    targetModel,
    metadata || null,
    createdAt
  ).run();

  return {
    id,
    user_id: userId,
    parent_type: parent_type || null,
    parent_id: parent_id || null,
    messages: messagesJson,
    response,
    model_used: targetModel,
    metadata: metadata || null,
    created_at: createdAt,
  };
}

/**
 * 获取用户的历史 AI 交互记录
 */
export async function getRecentAiInteractions(
  env: Env,
  userId: string,
  limit: number = 10,
  parentType?: 'node' | 'question' | 'pdf' | null,
  parentId?: string | null
): Promise<AiInteraction[]> {
  let query = `SELECT * FROM AiInteractions WHERE user_id = ?`;
  const params: (string | number | null)[] = [userId];

  if (parentType !== undefined && parentType !== null) {
    query += ` AND parent_type = ?`;
    params.push(parentType);
  }
  if (parentId !== undefined && parentId !== null) {
    query += ` AND parent_id = ?`;
    params.push(parentId);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const stmt = env.DB.prepare(query);
  const { results } = await stmt.bind(...params).all<AiInteraction>();

  return results || [];
}

/**
 * 删除特定 AI 交互记录
 */
export async function deleteAiInteraction(
  env: Env,
  id: string,
  userId: string
): Promise<boolean> {
  const stmt = env.DB.prepare(
    `DELETE FROM AiInteractions WHERE id = ? AND user_id = ?`
  );
  const result = await stmt.bind(id, userId).run();

  return result.meta.changes > 0;
}
