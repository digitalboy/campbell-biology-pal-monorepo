import { ref } from 'vue';
import { defineStore } from 'pinia';
import { aiChatService } from '@/services/aiChatService';
import { useAiInteractionStore } from './aiInteractionHistoryStore';
import type { AiCompletionRequest, AiCompletionResponse, CreateAiInteractionPayload } from '@/types/api';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  interactionId?: string;
  isError?: boolean;
}

export const useAiChatStore = defineStore('aiChat', () => {
  // --- State ---
  const messages = ref<ChatMessage[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // --- Actions ---
  function addMessage(role: 'user' | 'assistant', content: string, interactionId?: string, isError: boolean = false) {
    messages.value.push({ role, content, interactionId, isError });
  }

  async function sendMessage(prompt: string, systemPrompt?: string, stream: boolean = true, contextData?: any) {
    isLoading.value = true;
    error.value = null;
    addMessage('user', prompt);

    const aiInteractionStore = useAiInteractionStore();

    try {
      const apiMessages = messages.value.map(({ role, content }) => ({
        role,
        content: content as any,
      }));

      // 使用 DeepSeek 官方最新的 deepseek-v4-flash (DeepSeek-V4-Flash-0731)
      const model = 'deepseek-v4-flash';

      const payload: AiCompletionRequest = {
        model,
        messages: apiMessages,
        ...(systemPrompt && { system_prompt: systemPrompt }),
        stream,
      };

      const response = await aiChatService.aiCompletion(payload);
      let assistantResponseContent = '';

      if (stream) {
        const reader = (response as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        addMessage('assistant', '');
        let buffer = '';
        let currentEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.substring(6).trim();
              continue;
            }

            if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.substring(5).trim();
              if (dataStr === '[DONE]') break;

              try {
                const parsed = JSON.parse(dataStr);
                
                // 处理后端传递的错误事件
                if (currentEvent === 'error' || parsed.error) {
                  const errMsg = parsed.error || 'AI 服务响应异常';
                  error.value = errMsg;
                  messages.value[messages.value.length - 1].content = `⚠️ ${errMsg}`;
                  messages.value[messages.value.length - 1].isError = true;
                  break;
                }

                if (parsed.content) {
                  assistantResponseContent += parsed.content;
                  messages.value[messages.value.length - 1].content = assistantResponseContent;
                }
              } catch {
                // 如果不是 JSON，直接拼接字符串 chunk
                assistantResponseContent += dataStr;
                messages.value[messages.value.length - 1].content = assistantResponseContent;
              }
            }
          }
        }

        // 防隐形死机容错：如果流结束但未收到任何有效内容，弹出可感知 UI 提示
        if (!assistantResponseContent && !error.value) {
          const fallbackErr = '未能获取到 AI 回答，请检查网络或配置。';
          error.value = fallbackErr;
          messages.value[messages.value.length - 1].content = `⚠️ ${fallbackErr}`;
          messages.value[messages.value.length - 1].isError = true;
        }
      } else {
        const aiResponse = response as AiCompletionResponse;
        if (aiResponse.ok) {
          assistantResponseContent = typeof aiResponse.response === 'object'
            ? JSON.stringify(aiResponse.response, null, 2)
            : aiResponse.response as string;
          addMessage('assistant', assistantResponseContent);
        } else {
          error.value = (aiResponse as any).message || 'AI response not OK.';
          addMessage('assistant', `⚠️ ${error.value}`, undefined, true);
        }
      }

      // 保存成功交互历史
      if (assistantResponseContent && !error.value) {
        const messagesForHistory = apiMessages.map(msg => ({
          role: msg.role,
          content: typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : msg.content,
        }));

        const interactionPayload: CreateAiInteractionPayload = {
          messages: messagesForHistory as any,
          response: assistantResponseContent,
          model_used: model,
        };

        if (contextData) {
          if (contextData.type === 'node' && contextData.nodeId) {
            interactionPayload.parent_type = 'node';
            interactionPayload.parent_id = contextData.nodeId;
          } else if (contextData.type === 'question' && contextData.questionId) {
            interactionPayload.parent_type = 'question';
            interactionPayload.parent_id = contextData.questionId;
          } else if (contextData.type === 'page' && contextData.pageNumber) {
            interactionPayload.parent_type = 'pdf';
            interactionPayload.parent_id = String(contextData.pageNumber);
          }
        }

        const newInteraction = await aiInteractionStore.saveInteraction(interactionPayload);
        const lastAssistantMessage = messages.value[messages.value.length - 1];
        if (lastAssistantMessage && lastAssistantMessage.role === 'assistant') {
          lastAssistantMessage.interactionId = newInteraction.id;
        }
      }

    } catch (e: any) {
      error.value = e?.message || '请求 AI 服务失败，请重试。';
      addMessage('assistant', `⚠️ ${error.value}`, undefined, true);
      console.error('Error sending message to AI:', e);
    } finally {
      isLoading.value = false;
    }
  }

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