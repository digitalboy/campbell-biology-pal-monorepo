<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import markedKatex from 'marked-katex-extension';
import 'katex/dist/katex.min.css';

import { Copy, Check, ArrowUp, Trash2 } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useAiChatStore } from '@/stores/aiChatStore';
import { useAiInteractionStore } from '@/stores/aiInteractionHistoryStore';
import { usePrompts } from '@/composables/usePrompts';
import { useI18n } from 'vue-i18n';

// Configure marked to use the KaTeX extension
marked.use(markedKatex({
  throwOnError: false,
}));


const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  initialPrompt: {
    type: String,
    default: '',
  },
  contextData: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits<{ (e: 'update:isOpen', value: boolean): void }>();

const { t } = useI18n();
const { getSystemPrompt } = usePrompts();

const dialogTitle = computed(() => {
  if (props.contextData?.type === 'node' && props.contextData?.nodeName) {
    return `${t('aiChat.title')}: ${props.contextData.nodeName}`;
  }
  return t('aiChat.title');
});

const aiChatStore = useAiChatStore();
const aiInteractionStore = useAiInteractionStore(); // Initialize aiInteractionStore

const inputPlaceholder = computed(() => {
  return t('aiChat.inputPlaceholder');
});
const userInput = ref('');
const copiedMessageIndex = ref<number | null>(null);
const scrollAreaRef = ref<InstanceType<typeof ScrollArea> | null>(null);

const isSendButtonDisabled = computed(() => {
  return aiChatStore.isLoading || !userInput.value.trim();
});

const isDeleteDialogOpen = ref(false);
const interactionIdToDelete = ref<string | null>(null);

// Watch for dialog opening
watch(() => props.isOpen, async (newVal) => { // Make it async
  if (newVal) {
    // Always clear chat when opening to ensure a fresh state for history loading
    aiChatStore.clearChat();

    let parentType: 'node' | 'question' | 'pdf' | null = null;
    let parentId: string | null = null;

    if (props.contextData.type === 'node' && props.contextData.nodeId) {
      parentType = 'node';
      parentId = props.contextData.nodeId;
    } else if (props.contextData.type === 'question' && props.contextData.questionId) {
      parentType = 'question';
      parentId = props.contextData.questionId;
    } else if (props.contextData.type === 'page' && props.contextData.pageNumber) {
      parentType = 'pdf';
      parentId = String(props.contextData.pageNumber);
    }

    if (parentType && parentId) {
      try {
        // Fetch historical interactions for the specific context
        const history = await aiInteractionStore.fetchRecentInteractions({
          limit: 20, // Fetch a reasonable number of recent interactions
          parentType: parentType,
          parentId: parentId,
        });

        // Add historical messages to aiChatStore.messages
        // Interactions are usually returned newest first, so reverse to display oldest first
        history.reverse().forEach(interaction => {
          let userMessageContent = '';
          try {
            // Parse the 'messages' JSON string from the interaction history
            const parsedMessages = JSON.parse(interaction.messages);
            // Assuming the first message in the parsed array is the user's prompt
            if (parsedMessages.length > 0 && parsedMessages[0].role === 'user') {
              // The content itself might be a string or an array of ContentPart
              // For text-only chat, it should be a string.
              // If it's an array (for future multi-modal), we take the text part.
              if (typeof parsedMessages[0].content === 'string') {
                userMessageContent = parsedMessages[0].content;
              } else if (Array.isArray(parsedMessages[0].content) && parsedMessages[0].content.length > 0) {
                // Assuming the first part of a multi-part message is the text content
                userMessageContent = parsedMessages[0].content[0].text || '';
              }
            }
          } catch (e) {
            console.error('Failed to parse interaction.messages from history:', e, interaction.messages);
            userMessageContent = 'Error loading message content.'; // Fallback for parsing errors
          }

          // Add the extracted user message content to the chat store
          aiChatStore.addMessage('user', userMessageContent);
          // Add the assistant's response (which is still a string)
          aiChatStore.addMessage('assistant', interaction.response, interaction.id);
        });
      } catch (e) {
        console.error('Failed to load AI chat history:', e);
        // Optionally display an error message to the user, e.g., using toast
      }
    }

    // Handle initial prompt after history is loaded
    if (props.initialPrompt) {
      userInput.value = props.initialPrompt;
      // If the initial prompt should be sent immediately as a new message
      // and not just pre-filled, uncomment the next line:
      // await handleSendMessage();
    }
  } else {
    // When dialog closes
    userInput.value = '';
    // Optionally clear chat when dialog closes to free up memory
    aiChatStore.clearChat();
  }
}, { immediate: true });

// Create a computed property that tracks the content of the very last message
const lastMessageContent = computed(() => {
  if (aiChatStore.messages.length === 0) {
    return '';
  }
  return aiChatStore.messages[aiChatStore.messages.length - 1].content;
});

/**
 * Scrolls the reka-ui scroll area to the bottom.
 */
function scrollToBottom() {
  nextTick(() => {
    const scrollAreaElement = scrollAreaRef.value?.$el;
    if (scrollAreaElement) {
      const viewport = scrollAreaElement.querySelector('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  });
}

// Watch for new messages or content changes to scroll to bottom
watch(
  [() => aiChatStore.messages.length, lastMessageContent],
  () => {
    scrollToBottom();
  },
  { flush: 'post' } // 'post' ensures the watcher runs after DOM updates
);


async function handleSendMessage() {
  const message = userInput.value.trim();
  if (!message) return;

  userInput.value = '';

  const systemPrompt = getSystemPrompt(props.contextData);

  await aiChatStore.sendMessage(message, systemPrompt, true, props.contextData);
}

function handleDialogClose() {
  emit('update:isOpen', false);
}



function handleDeleteClick(interactionId: string) {
  interactionIdToDelete.value = interactionId;
  isDeleteDialogOpen.value = true;
}

async function handleConfirmDelete() {
  if (!interactionIdToDelete.value) return;

  try {
    await aiInteractionStore.deleteInteraction(interactionIdToDelete.value);
    // Remove the corresponding user and assistant messages from the local state
    // Find the assistant's message by interactionId
    const indexToDelete = aiChatStore.messages.findIndex(msg => msg.interactionId === interactionIdToDelete.value);
    if (indexToDelete !== -1) {
      const startIndex = (indexToDelete > 0 && aiChatStore.messages[indexToDelete - 1].role === 'user')
        ? indexToDelete - 1
        : indexToDelete;
      const deleteCount = (startIndex === indexToDelete) ? 1 : 2;
      aiChatStore.messages.splice(startIndex, deleteCount);
      toast.success(t('aiChat.messageDeleted'));
    } else {
      console.warn('Could not find message with interactionId to delete from local state:', interactionIdToDelete.value);
    }
  } catch (e) {
    console.error('Failed to delete AI interaction:', e);
    toast.error(t('aiChat.deleteError'));
  } finally {
    isDeleteDialogOpen.value = false;
    interactionIdToDelete.value = null;
  }
}

function extractMarkdownFromStream(content: string): string {
  let extractedContent = '';
  try {
    const jsonChunks = content.match(/{"content":".*?"}/g);
    if (jsonChunks) {
      extractedContent = jsonChunks.map(chunk => {
        try {
          return JSON.parse(chunk).content;
        } catch {
          return '';
        }
      }).join('');
    } else {
      extractedContent = content;
    }
  } catch (e) {
    extractedContent = content;
  }
  return extractedContent;
}

async function handleCopy(content: string, index: number) {
  const markdownContent = extractMarkdownFromStream(content);
  try {
    await navigator.clipboard.writeText(markdownContent);
    copiedMessageIndex.value = index;
    setTimeout(() => {
      if (copiedMessageIndex.value === index) {
        copiedMessageIndex.value = null;
      }
    }, 2000);
  } catch (err) {
    console.error('Failed to copy markdown: ', err);
  }
}

function renderMarkdown(content: string) {
  const extractedContent = extractMarkdownFromStream(content);

  // The previous "hacky fix" for inline math has been removed as it was causing rendering issues.
  // The marked-katex-extension should handle both inline ($...$) and block ($$...$$) math correctly.

  // Fix for KaTeX rendering issue with backslashes.
  // We need to double-escape backslashes within KaTeX blocks ($...$ or $$...$$)
  // so that the marked parser doesn't consume them before the katex extension can process them.
  const katexFixedContent = extractedContent.replace(/\$(.*?)\$/g, (match) => {
    return match.replace(/\\/g, '\\\\');
  });

  const correctedContent = katexFixedContent
    .replace(/\n(#+)([^\s#])/g, '\n$1 $2')
    .replace(/([^\n\s])(#+)\s/g, '$1\n\n$2 ')
    .replace(/(\n#+)(\S)/g, '$1 $2');

  const rawHtml = marked.parse(correctedContent, { async: false });

  // Sanitize the HTML, allowing KaTeX-specific tags and attributes
  return DOMPurify.sanitize(rawHtml as string, {
    ADD_TAGS: ['math', 'maction', 'merror', 'mfrac', 'mi', 'mn', 'mo', 'mover', 'mspace', 'mstyle', 'mrow', 'msqrt', 'mtable', 'mtd', 'mtext', 'mtr', 'semantics', 'annotation'],
    ADD_ATTR: ['accent', 'accentunder', 'align', 'columnalign', 'columnlines', 'columnspacing', 'columnspan', 'depth', 'display', 'displaystyle', 'encoding', 'fence', 'fontstyle', 'fontweight', 'frame', 'height', 'href', 'lspace', 'mathbackground', 'mathcolor', 'mathsize', 'mathvariant', 'maxwidth', 'minlabelspacing', 'rowalign', 'rowlines', 'rowspacing', 'rowspan', 'rspace', 'selection', 'separator', 'stretchy', 'width', 'xmlns', 'aria-hidden', 'encoding'],
  });
}

</script>

<template>
  <Dialog :open="isOpen" @update:open="handleDialogClose">
    <DialogContent class="sm:max-w-[800px] lg:max-w-[1000px] h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>{{ t('aiChat.description') }}</DialogDescription>
      </DialogHeader>

      <div class="flex-grow overflow-hidden">
        <ScrollArea ref="scrollAreaRef" class="h-full p-4 border rounded-md bg-muted/20 relative">
          <div>
            <div v-if="aiChatStore.messages.length === 0 && !aiChatStore.isLoading"
              class="text-center text-muted-foreground py-8">
              {{ t('aiChat.noMessages') }}
            </div>

            <div v-for="(message, index) in aiChatStore.messages" :key="index" :class="[
              'group',
              'mb-4 p-3 rounded-lg max-w-[85%] ',
              message.role === 'user'
                ? 'bg-primary text-primary-foreground ml-auto'
                : 'bg-card text-card-foreground mr-auto border relative',
            ]">
              <!-- User Message -->
              <p v-if="message.role === 'user'" class="whitespace-pre-wrap">{{ message.content }}</p>

              <!-- Assistant Message -->
              <template v-else>
                <div class="absolute top-1 right-1 flex gap-1 z-10">
                  <Button variant="ghost" size="icon" class="h-7 w-7" @click="handleCopy(message.content, index)">
                    <Check v-if="copiedMessageIndex === index" class="h-4 w-4 text-green-500" />
                    <Copy v-else class="h-4 w-4" />
                  </Button>
                  <Button v-if="message.interactionId" variant="ghost" size="icon" class="h-7 w-7"
                    @click="handleDeleteClick(message.interactionId)">
                    <Trash2 class="h-4 w-4 text-red-500" />
                  </Button>
                </div>

                <!-- Skeleton Loader -->
                <div v-if="aiChatStore.isLoading && index === aiChatStore.messages.length - 1 && !message.content"
                  class="space-y-2 p-2">
                  <div class="h-4 bg-muted rounded w-5/6 animate-pulse"></div>
                  <div class="h-4 bg-muted rounded w-full animate-pulse"></div>
                  <div class="h-4 bg-muted rounded w-4/6 animate-pulse"></div>
                </div>

                <!-- Message Content -->
                <div v-else class="prose prose-sm max-w-none dark:prose-invert chat-content-wrapper"
                  v-html="renderMarkdown(message.content)">
                </div>
              </template>
            </div>

            <div v-if="aiChatStore.error" class="text-red-500 text-center mt-4">
              {{ aiChatStore.error }}
            </div>
          </div>
        </ScrollArea>
      </div>

      <div class="flex gap-2 mt-4">
        <Input id="ai-chat-input" v-model="userInput" @keyup.enter="handleSendMessage" :placeholder="inputPlaceholder"
          :disabled="aiChatStore.isLoading" class="flex-grow" />
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button @click="handleSendMessage" :disabled="isSendButtonDisabled" size="icon" variant="default">
                <ArrowUp class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ t('aiChat.sendButton') }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <AlertDialog v-model:open="isDeleteDialogOpen">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{{ t('aiChat.confirmDeleteMessage') }}</AlertDialogTitle>
            <AlertDialogDescription>
              {{ t('aiChat.confirmDeleteDescription') }}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
            <AlertDialogAction @click="handleConfirmDelete">{{ t('common.delete') }}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.prose :where(code):not(:where([class~="not-prose"] *))::before {
  content: "";
}

.prose :where(code):not(:where([class~="not-prose"] *))::after {
  content: "";
}

.chat-content-wrapper :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1.25em;
  margin-bottom: 1.25em;
  border: 1px solid hsl(var(--border));
}

.chat-content-wrapper :deep(th),
.chat-content-wrapper :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 0.5rem 0.75rem;
}

.chat-content-wrapper :deep(thead th) {
  font-weight: 600;
  background-color: hsl(var(--muted) / 0.5);
  border-bottom-width: 2px;
}

.chat-content-wrapper :deep(tbody tr:nth-child(even)) {
  background-color: hsl(var(--muted) / 0.25);
}

.chat-content-wrapper :deep(.katex-display) {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.25rem 0;
}
</style>
