import { ref } from 'vue';
import { defineStore } from 'pinia';
import { aiChatService } from '@/services/aiChatService';
import { useAiInteractionStore } from './aiInteractionHistoryStore'; // Import the new store
import type { AiCompletionRequest, AiCompletionResponse, CreateAiInteractionPayload } from '@/types/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  interactionId?: string; // Add this optional property
}

export const useAiChatStore = defineStore('aiChat', () => {
  // --- State ---
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // --- Actions ---

  /**
   * Adds a message to the chat history.
   * @param role The role of the message sender ('user' or 'assistant').
   * @param content The content of the message.
   */
  function addMessage(role: 'user' | 'assistant', content: string, interactionId?: string) {
    messages.value.push({ role, content, interactionId });
  }

  /**
   * Sends a message to the AI model and handles the response.
   * @param prompt The user's prompt.
   * @param systemPrompt An optional system prompt.
   * @param stream Whether to stream the response.
   */
  async function sendMessage(prompt: string, systemPrompt?: string, stream: boolean = false, contextData?: any) {
    isLoading.value = true;
    error.value = null;
    // The user message is the 'prompt', and it's added to our local history.
    addMessage('user', prompt);

    const aiInteractionStore = useAiInteractionStore();

    try {
      // The new API expects the full conversation history.
      // We map our local message history to the format required by the API.
      const apiMessages = messages.value.map(({ role, content }) => ({
        role,
        content: content as any, // Content is just string for now
      }));

      const model = 'qwen-turbo'; // Text-only model

      const payload: AiCompletionRequest = {
        model,
        messages: apiMessages,
        ...(systemPrompt && { system_prompt: systemPrompt }),
        stream,
      };

      // Call the updated service method
      const response = await aiChatService.aiCompletion(payload);

      let assistantResponseContent = ''; // To store the full assistant response for saving

      if (stream) {
        // Handle Server-Sent Events (SSE)
        const reader = (response as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        addMessage('assistant', '');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep the last, possibly incomplete, line in the buffer

          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.substring(5).trim();
              if (data === '[DONE]') {
                // End of stream signal from the server, exit the loop
                break;
              }
              // Per OpenAPI spec, the data is a string chunk
              assistantResponseContent += data;
              messages.value[messages.value.length - 1].content = assistantResponseContent;
            }
          }
        }
      } else {
        // Handle non-streaming response
        const aiResponse = response as AiCompletionResponse;
        if (aiResponse.ok) {
          assistantResponseContent = typeof aiResponse.response === 'object'
            ? JSON.stringify(aiResponse.response, null, 2)
            : aiResponse.response as string;
          addMessage('assistant', assistantResponseContent);
        } else {
          error.value = (aiResponse as any).message || 'AI response not OK.';
          addMessage('assistant', `Error: ${error.value}`);
        }
      }

      // Save AI interaction after successful response
      if (assistantResponseContent) {
        // FIX: The /ai/interactions endpoint expects message.content to be an object/array,
        // not a plain string, due to an inconsistency in the OpenAPI specs.
        // We transform the messages array here to match the required format for saving.
        const messagesForHistory = apiMessages.map(msg => {
          if (typeof msg.content === 'string') {
            return {
              role: msg.role,
              content: [{ type: 'text', text: msg.content }],
            };
          }
          return msg; // Should not happen in text-only chat, but good practice
        });

        const interactionPayload: CreateAiInteractionPayload = {
          messages: messagesForHistory as any, // Pass the transformed messages
          response: assistantResponseContent,
          model_used: model,
        };

        if (contextData) {
          if (contextData.type === 'node' && contextData.nodeId) {
            interactionPayload.parent_type = 'node';
            interactionPayload.parent_id = contextData.nodeId;
          } else if (contextData.type === 'question' && contextData.questionId) { // Assuming questionId exists
            interactionPayload.parent_type = 'question';
            interactionPayload.parent_id = contextData.questionId;
          } else if (contextData.type === 'page' && contextData.pageNumber) { // Assuming pageNumber exists
            interactionPayload.parent_type = 'pdf'; // OpenAPI uses 'pdf' for page
            interactionPayload.parent_id = String(contextData.pageNumber);
          }
        }
        const newInteraction = await aiInteractionStore.saveInteraction(interactionPayload);
        // Find the assistant's message that was just added and update its interactionId
        const lastAssistantMessage = messages.value[messages.value.length - 1];
        if (lastAssistantMessage && lastAssistantMessage.role === 'assistant') {
          lastAssistantMessage.interactionId = newInteraction.id;
        }
      }

    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || 'Failed to get AI response.';
      addMessage('assistant', `Error: ${error.value}`);
      console.error('Error sending message to AI:', e);
    }
    finally {
      isLoading.value = false;
    }
  }

  /**
   * Clears the chat history.
   */
  function clearChat() {
    messages.value = [];
    error.value = null;
  }

  return {
    messages,
    isLoading,
    error,
    addMessage,
    sendMessage,
    clearChat,
  };
});