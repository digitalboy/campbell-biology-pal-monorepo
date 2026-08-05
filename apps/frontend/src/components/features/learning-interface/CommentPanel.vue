<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useCommentStore } from '@/stores/commentStore';
import CommentForm from '@/components/shared/CommentForm.vue';
import CommentItem from '@/components/shared/CommentItem.vue';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import { Switch } from '@/components/ui/switch'; // Import Switch component
import { Label } from '@/components/ui/label'; // Import Label for accessibility
import type { Comment } from '@/types/api';
import { useI18n } from 'vue-i18n'; // Import useI18n

const { t } = useI18n(); // Initialize useI18n

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

const commentStore = useCommentStore();

const scrollContainer = ref<HTMLElement | null>(null);
const limit = 10; // Number of comments to load per batch
const showMyCommentsOnly = ref(false); // New state for the switch

// Watch for changes in anchorId, anchorType, or showMyCommentsOnly to reset and fetch comments
watch(() => [props.anchorId, props.anchorType, showMyCommentsOnly.value], () => {
  commentStore.comments = []; // Clear existing comments in store
  commentStore.nextCursor = null; // Reset cursor
  loadMoreComments(); // Initial load
}, { immediate: true });

// Function to load more comments
async function loadMoreComments() {
  // Use commentStore.nextCursor for pagination
  if (props.anchorId && props.anchorType && !commentStore.isLoading && (commentStore.nextCursor !== null || commentStore.comments.length === 0)) {
    await commentStore.fetchComments(props.anchorType, props.anchorId, limit, commentStore.nextCursor, showMyCommentsOnly.value);
  }
}

function switchMyCommentOnly() {
  // console.log('switchMyCommentOnly');
  showMyCommentsOnly.value = !showMyCommentsOnly.value;
}

// Scroll event handler for infinite scrolling
function handleScroll() {
  const container = scrollContainer.value;
  if (container) {
    const { scrollTop, scrollHeight, clientHeight } = container;
    // Check if scrolled near the bottom (e.g., within 100px)
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

// Watch for scrollContainer ref to be set (if it's rendered conditionally)
watch(scrollContainer, (newVal, oldVal) => {
  if (oldVal) {
    oldVal.removeEventListener('scroll', handleScroll);
  }
  if (newVal) {
    newVal.addEventListener('scroll', handleScroll);
  }
});

async function handleCommentPosted(newComment: Comment) {
  // If it's a top-level comment, prepend it directly to the list.
  if (newComment.parent_comment_id === null) {
    commentStore.comments.unshift(newComment);
    commentStore.totalComments++;
  } else {
    // It's a reply. Fetch the entire parent comment tree to get the new reply.
    // This is the "targeted update" strategy recommended by the backend team.
    try {
      const updatedParentTree = await commentStore.fetchCommentTree(newComment.parent_comment_id);
      if (updatedParentTree) {
        const index = commentStore.comments.findIndex(c => c.id === updatedParentTree.id);
        if (index !== -1) {
          // Replace the old comment tree with the updated one.
          // Vue's reactivity will detect the change and re-render the specific CommentItem.
          commentStore.comments[index] = updatedParentTree;
        } else {
          // Fallback: If the parent isn't in the current view (e.g., on another page),
          // refresh the whole list to ensure the new reply is visible.
          console.log('Parent comment not found in current list, refreshing all comments.');
          commentStore.comments = [];
          commentStore.nextCursor = null;
          await loadMoreComments();
        }
      }
    } catch (error) {
      console.error('Failed to fetch updated parent comment tree:', error);
      // Fallback: If the API call fails, refresh the whole list.
      commentStore.comments = [];
      commentStore.nextCursor = null;
      await loadMoreComments();
    }
  }
}


</script>

<template>
  <div class="flex flex-col h-full space-y-2 pr-1 mr-1">
    <!-- Comment Input Form -->
    <div class="flex-shrink-0 py-1 border-b pb-2">
      <div class="flex items-center space-x-2 mb-4">
        <Switch id="show-my-comments" :model-value="showMyCommentsOnly" @update:model-value="switchMyCommentOnly" />
        <Label for="show-my-comments">{{ t('comments.myCommentsOnly') }}</Label>
      </div>
      <CommentForm :anchor-type="anchorType" :anchor-id="anchorId" @comment-posted="handleCommentPosted" />
    </div>

    <!-- Comments List -->
    <div v-if="commentStore.isLoading && commentStore.comments.length === 0"
      class="flex-grow flex justify-center items-center">
      <LoadingIndicator />
    </div>
    <div v-else-if="commentStore.error" class="text-center text-red-500">{{ commentStore.error }}</div>
    <div v-else-if="commentStore.comments.length === 0 && !commentStore.isLoading" class="text-center  py-8">
      {{ $t('comments.noComments') }}
    </div>
    <div v-else class="flex-grow space-y-5 overflow-y-auto pt-2" ref="scrollContainer">
      <CommentItem v-for="comment in commentStore.comments" :key="comment.id" :comment="comment"
        @reply-posted="(newComment) => handleCommentPosted(newComment)" />
    </div>

    <!-- Loading Indicator at the bottom -->
    <div v-if="commentStore.isLoading && commentStore.comments.length > 0" class="py-4 text-center">
      <LoadingIndicator />
    </div>
    <div v-else-if="commentStore.nextCursor === null && commentStore.comments.length > 0" class="py-4 text-center ">
      {{ $t('comments.noMoreComments') }}
    </div>
  </div>
</template>
