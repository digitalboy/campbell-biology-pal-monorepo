/**
 * Represents a single message in a completion request.
 * This structure is flexible enough for both text and multi-modal inputs.
 */
export type AiMessage = {
  role: 'user' | 'assistant' | 'system';
  content: any; // Can be a string (for text) or an array of content blocks (for vision)
};

/**
 * Represents the structure of a logged AI interaction in the database.
 */
export interface AiInteraction {
  id: string;
  user_id: string;
  parent_type: 'node' | 'question' | 'pdf' | null;
  parent_id: string | null;
  messages: string; // The request messages, stored as a JSON string.
  response: string;
  model_used: string | null;
  metadata: string | null; // JSON string
  created_at: string;
}

/**
 * Defines the payload for saving a completed AI interaction.
 */
export interface CreateAiInteractionPayload {
  parent_type?: 'node' | 'question' | 'pdf' | null;
  parent_id?: string | null;
  messages: AiMessage[]; // The actual messages array from the request.
  response: string;
  model_used?: string | null;
  metadata?: string | null;
}