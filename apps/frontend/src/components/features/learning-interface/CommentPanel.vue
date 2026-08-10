<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useCommentStore } from '@/stores/commentStore';
import { useAuthStore } from '@/stores/authStore';
import CommentForm from '@/components/shared/CommentForm.vue';
import CommentItem from '@/components/shared/CommentItem.vue';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import AuthPromptModal from '@/components/shared/AuthPromptModal.vue';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus } from 'lucide-vue-next';
import type { Comment } from '@/types/api';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const authStore = useAuthStore();
const commentStore = useCommentStore();

const scrollContainer = ref<HTMLElement | null>(null);
const limit = 10; // Number of comments to load per batch
const showMyCommentsOnly = ref(false);
const isAuthPromptOpen = ref(false);

// Watch for changes in anchorId, anchorType, or showMyCommentsOnly to reset and fetch comments
watch(() => [props.anchorId, props.anchorType, showMyCommentsOnly.value], () => {
  commentStore.comments = []; // Clear existing comments in store
  commentStore.nextCursor = null; // Reset cursor
  loadMoreComments(); // Initial load
}, { immediate: true });

// Function to load more comments
async function loadMoreComments() {
  if (props.anchorId && props.anchorType && !commentStore.isLoading && (commentStore.nextCursor !== null || commentStore.comments.length === 0)) {
    await commentStore.fetchComments(props.anchorType, props.anchorId, limit, commentStore.nextCursor, showMyCommentsOnly.value);
  }
}

function switchMyCommentOnly() {
  if (!authStore.user) {
    isAuthPromptOpen.value = true;
    return;
  }
  showMyCommentsOnly.value = !showMyCommentsOnly.value;
}

// Scroll event handler for infinite scrolling
function handleScroll() {
  const container = scrollContainer.value;
  if (container) {
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollTop + clientHeight >= scrollHeight - 100 && !commentStore.isLoading && commentStore.nextCursor !== null) {
      loadMoreComments();
    }
  }
}

// Attach/detach scroll listener
onMounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.addEventListener('scroll', handleScroll);
  }
});

onUnmounted(() => {
  if (scrollContainer.value) {
    scrollContainer.value.removeEventListener('scroll', handleScroll);
  }
});

watch(scrollContainer, (newVal, oldVal) => {
  if (oldVal) {
    oldVal.removeEventListener('scroll', handleScroll);
  }
  if (newVal) {
    newVal.addEventListener('scroll', handleScroll);
  }
});

async function handleCommentPosted(newComment: Comment) {
  if (newComment.parent_comment_id === null) {
    commentStore.comments.unshift(newComment);
    commentStore.totalComments++;
  } else {
    try {
      const updatedParentTree = await commentStore.fetchCommentTree(newComment.parent_comment_id);
      if (updatedParentTree) {
        const index = commentStore.comments.findIndex(c => c.id === updatedParentTree.id);
        if (index !== -1) {
          commentStore.comments[index] = updatedParentTree;
        } else {
          commentStore.comments = [];
          commentStore.nextCursor = null;
          await loadMoreComments();
        }
      }
    } catch (error) {
      console.error('Failed to fetch updated parent comment tree:', error);
      commentStore.comments = [];
      commentStore.nextCursor = null;
      await loadMoreComments();
    }
  }
}

const props = defineProps({
  anchorType: {
    type: String as () => 'page' | 'question',
    required: true,
  },
  anchorId: {
    type: String,
    required: true,
  },
});
</script>

<template>
  <div class="flex flex-col h-full space-y-2 pr-1 mr-1">
    <!-- Comment Input Form / Guest Prompt Banner -->
    <div class="shrink-0 py-1 border-b pb-2">
      <div class="flex items-center space-x-2 mb-3">
        <Switch id="show-my-comments" :model-value="showMyCommentsOnly" @update:model-value="switchMyCommentOnly" />
        <Label for="show-my-comments">{{ t('comments.myCommentsOnly') }}</Label>
      </div>

      <!-- 游客未登录参与讨论引导卡片 -->
      <div v-if="!authStore.user" class="p-3 rounded-xl bg-linear-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border border-emerald-500/20 flex items-center justify-between gap-2 mb-2">
        <div class="flex items-center gap-2 text-xs font-medium text-foreground truncate">
          <MessageSquarePlus class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span class="truncate">{{ t('guest.commentHint') }}</span>
        </div>
        <Button size="sm" class="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium shrink-0 shadow-sm" @click="isAuthPromptOpen = true">
          {{ t('guest.loginRegister') }}
        </Button>
      </div>

      <CommentForm v-else :anchor-type="anchorType" :anchor-id="anchorId" @comment-posted="handleCommentPosted" />
    </div>

    <!-- Comments List -->
    <div v-if="commentStore.isLoading && commentStore.comments.length === 0"
      class="grow flex justify-center items-center">
      <LoadingIndicator />
    </div>
    <div v-else-if="commentStore.error" class="text-center text-red-500 py-4">{{ commentStore.error }}</div>
    <div v-else-if="commentStore.comments.length === 0 && !commentStore.isLoading" class="text-center py-8 text-muted-foreground text-sm">
      {{ $t('comments.noComments') }}
    </div>
    <div v-else class="grow space-y-5 overflow-y-auto pt-2" ref="scrollContainer">
      <CommentItem v-for="comment in commentStore.comments" :key="comment.id" :comment="comment"
        @reply-posted="(newComment) => handleCommentPosted(newComment)" />
    </div>

    <!-- Loading Indicator at the bottom -->
    <div v-if="commentStore.isLoading && commentStore.comments.length > 0" class="py-4 text-center">
      <LoadingIndicator />
    </div>
    <div v-else-if="commentStore.nextCursor === null && commentStore.comments.length > 0" class="py-4 text-center text-xs text-muted-foreground">
      {{ $t('comments.noMoreComments') }}
    </div>

    <!-- 登录引导弹窗 -->
    <AuthPromptModal v-model="isAuthPromptOpen" />
  </div>
</template>
