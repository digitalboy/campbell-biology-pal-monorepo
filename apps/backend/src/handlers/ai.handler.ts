// file: src/handlers/ai.handler.ts
import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { HonoContextVariables } from '../router';
import { Env } from '../index';
import { createCompletion, createCompletionStream, saveAiInteraction, getRecentAiInteractions, deleteAiInteraction, AiCompletionPayload, sanitizeModelName } from '../services/ai.service';
import { CreateAiInteractionPayload } from '../models/ai.models';

interface AiCompletionRequestBody extends AiCompletionPayload {}

export const aiCompletionHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const body = await c.req.json<AiCompletionRequestBody>();
    if (!body.model) {
      body.model = c.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
    }
    // 自动清洗模型标示符
    body.model = sanitizeModelName(body.model);

    const { model, messages, stream: useStream } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return c.json({ ok: false, message: 'Invalid payload. A non-empty `messages` array is required.' }, 400);
    }

    // --- 流式响应逻辑 (带有容错防假死机制) ---
    if (useStream) {
      return streamSSE(c, async (stream) => {
        try {
          const aiStream = await createCompletionStream(c.env, body);

          for await (const chunk of aiStream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              const jsonPayload = JSON.stringify({ content });
              await stream.writeSSE({ data: jsonPayload });
            }
          }

          await stream.writeSSE({
            event: 'end',
            data: JSON.stringify('[DONE]'),
          });
        } catch (streamErr: any) {
          console.error('[AI Handler] Streaming Exception:', streamErr);
          const errorMsg = streamErr?.message || String(streamErr);
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({ error: `[AI Error] ${errorMsg}` }),
          });
        }
      });
    }

    // --- 非流式响应逻辑 ---
    const aiResponse = await createCompletion(c.env, body);

    if (aiResponse) {
      if (body.response_format?.type === 'json_object') {
        try {
          const parsedJson = JSON.parse(aiResponse);
          return c.json({ ok: true, response: parsedJson });
        } catch {
          console.error('[AI Handler] AI returned invalid JSON:', aiResponse);
          return c.json({ ok: false, message: 'AI response was not valid JSON.' }, 500);
        }
      }
      return c.json({ ok: true, response: aiResponse });
    } else {
      return c.json({ ok: false, message: 'AI did not return a response.' }, 500);
    }

  } catch (error: any) {
    console.error('[AI Handler] Exception:', error);
    return c.json(
      {
        ok: false,
        message: 'An internal error occurred while processing the AI request.',
        error: error.message,
      },
      500
    );
  }
};

/**
 * Handles saving an AI interaction record.
 * POST /api/v1/ai/interactions
 */
export const saveAiInteractionHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ ok: false, message: 'Authentication error: User ID not found.' }, 401);
    }

    const payload: CreateAiInteractionPayload = await c.req.json();

    if (!payload.messages || !Array.isArray(payload.messages) || payload.messages.length === 0 || !payload.response) {
      return c.json({ ok: false, message: 'A non-empty messages array and a response are required.' }, 400);
    }

    const newInteraction = await saveAiInteraction(c.env, userId, payload);

    return c.json({ ok: true, data: newInteraction }, 201);
  } catch (error: any) {
    console.error('[AI Handler] Error saving AI interaction:', error);
    return c.json(
      { ok: false, message: 'Failed to save AI interaction.', error: error.message },
      500
    );
  }
};

/**
 * Handles fetching recent AI interaction records.
 * GET /api/v1/ai/interactions
 */
export const getRecentAiInteractionsHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ ok: false, message: 'Authentication error: User ID not found.' }, 401);
    }

    const limit = parseInt(c.req.query('limit') || '10', 10);
    const parentType = c.req.query('parentType') as 'node' | 'question' | 'pdf' | null;
    const parentId = c.req.query('parentId') || null;

    if (isNaN(limit) || limit <= 0) {
      return c.json({ ok: false, message: 'Invalid limit provided.' }, 400);
    }

    const interactions = await getRecentAiInteractions(c.env, userId, limit, parentType, parentId);

    return c.json({ ok: true, data: interactions });
  } catch (error: any) {
    console.error('[AI Handler] Error fetching recent AI interactions:', error);
    return c.json(
      { ok: false, message: 'Failed to fetch recent AI interactions.', error: error.message },
      500
    );
  }
};

/**
 * Handles deleting an AI interaction record.
 * DELETE /api/v1/ai/interactions/:id
 */
export const deleteAiInteractionHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const userId = c.get('userId');
    if (!userId) {
      return c.json({ ok: false, message: 'Authentication error: User ID not found.' }, 401);
    }

    const interactionId = c.req.param('id');
    if (!interactionId) {
      return c.json({ ok: false, message: 'Interaction ID is required.' }, 400);
    }

    const deleted = await deleteAiInteraction(c.env, interactionId, userId);

    if (deleted) {
      return c.json({ ok: true, message: 'AI interaction deleted successfully.' });
    } else {
      return c.json({ ok: false, message: 'AI interaction not found or unauthorized.' }, 404);
    }
  } catch (error: any) {
    console.error('[AI Handler] Error deleting AI interaction:', error);
    return c.json(
      { ok: false, message: 'Failed to delete AI interaction.', error: error.message },
      500
    );
  }
};
