// file: src/services/ai.service.ts
import { Env } from '../index';
import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { AiInteraction, CreateAiInteractionPayload } from '../models/ai.models'; // Import new models

// Define the type for the response_format parameter for clarity.
export type ResponseFormat = {
  type: "text" | "json_object";
};

// This function initializes the OpenAI client with the Dashscope-compatible configuration.
// It's designed to be reusable across different AI-powered features.
function getAiClient(env: Env): OpenAI {
  return new OpenAI({
    apiKey: env.DASHSCOPE_API_KEY,
    baseURL: env.DASHSCOPE_BASE_URL,
  });
}

// Define a more generic payload structure for AI completions.
export type AiCompletionPayload = {
  model: string; // e.g., 'qwen-turbo', 'qwen-vl-plus-latest'
  messages: any[]; // Use any[] to support different message structures (text vs. vision)
  system_prompt?: string;
  response_format?: ResponseFormat;
  stream?: boolean;
};


/**
 * Performs a chat completion using a specified model and message structure.
 * This function is generic and supports both text and multi-modal models.
 * @param env The environment object containing secrets and variables.
 * @param payload The completion payload containing model, messages, and other options.
 * @returns The content of the AI's response message.
 */
export async function createCompletion(
  env: Env,
  payload: AiCompletionPayload
): Promise<string | null> {
  try {
    const openai = getAiClient(env);

    let finalSystemPrompt = payload.system_prompt || 'You are a helpful biology assistant.';
    if (payload.response_format?.type === 'json_object') {
      finalSystemPrompt += ' You MUST respond in JSON format.';
    }

    const completion = await openai.chat.completions.create({
      model: payload.model,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        ...payload.messages, // Spread the provided messages
      ],
      temperature: 0.7,
      response_format: payload.response_format,
    });

    const responseMessage = completion.choices[0]?.message?.content;
    return responseMessage || null;

  } catch (error) {
    console.error(`[AI Service] Error creating completion for model ${payload.model}:`, error);
    throw new Error('Failed to get completion from AI service.');
  }
}

/**
 * Performs a streaming chat completion.
 * This function is generic and supports both text and multi-modal models.
 * @param env The environment object.
 * @param payload The completion payload.
 * @returns A stream of chat completion chunks from the AI.
 */
export async function createCompletionStream(
  env: Env,
  payload: AiCompletionPayload
): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const openai = getAiClient(env);

  let finalSystemPrompt = payload.system_prompt || 'You are a helpful biology assistant.';
  if (payload.response_format?.type === 'json_object') {
    finalSystemPrompt += ' You MUST respond in JSON format.';
  }

  const stream = await openai.chat.completions.create({
    model: payload.model,
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
 * Saves an AI interaction record to the database.
 * @param env The environment object.
 * @param userId The ID of the user.
 * @param payload The data for the AI interaction, containing the messages array.
 * @returns The created AiInteraction object.
 */
export async function saveAiInteraction(
  env: Env,
  userId: string,
  payload: CreateAiInteractionPayload
): Promise<AiInteraction> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const { parent_type, parent_id, messages, response, model_used, metadata } = payload;

  // Serialize the messages array into a JSON string for storage.
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
    messagesJson, // Store the stringified JSON
    response,
    model_used || null,
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
    model_used: model_used || null,
    metadata: metadata || null,
    created_at: createdAt,
  };
}

/**
 * Retrieves recent AI interaction records for a user.
 * @param env The environment object.
 * @param userId The ID of the user.
 * @param limit The maximum number of records to retrieve.
 * @param parentType Optional: Filter by parent type.
 * @param parentId Optional: Filter by parent ID.
 * @returns An array of AiInteraction objects.
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

  if (parentType !== undefined) {
    query += ` AND parent_type = ?`;
    params.push(parentType);
  }
  if (parentId !== undefined) {
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
 * Deletes a specific AI interaction record for a user.
 * @param env The environment object.
 * @param id The ID of the interaction to delete.
 * @param userId The ID of the user who owns the interaction.
 * @returns True if the record was deleted, false otherwise.
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
