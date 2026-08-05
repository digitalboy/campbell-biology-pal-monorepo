<script setup lang="ts">
import type { PropType } from 'vue';
import type { Comment as ApiComment } from '@/types/api';
import { computed, ref, onMounted, nextTick, watch } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import CommentForm from '@/components/shared/CommentForm.vue';
import { Button } from '@/components/ui/button';
import { MessageCirclePlus } from 'lucide-vue-next';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// The component expects a comment object that might have replies attached.
// Our base API type doesn't have this, so we define a local type for the prop.
interface DisplayComment extends ApiComment {
  replies?: DisplayComment[];
}

const props = defineProps({
  comment: {
    type: Object as PropType<DisplayComment>,
    required: true,
  },
  depth: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits<{
  (e: 'reply-posted', comment: ApiComment): void;
  (e: 'geometry-changed'): void; // Emitted when the component's layout size might have changed
}>();

const isReplying = ref(false);

// Watch for isReplying changes to notify parent about potential layout shifts
watch(isReplying, async () => {
  await nextTick(); // Wait for the DOM to update (e.g., for the form to appear/disappear)
  emit('geometry-changed');
});

function onReplySubmitted(newComment: ApiComment) {
  isReplying.value = false;
  // Let parent know a new reply has been posted so it can refresh data
  emit('reply-posted', newComment);
}

function handleGeometryChange() {
  updateDimensions();
  emit('geometry-changed');
}


// Template refs
const commentRef = ref<HTMLElement>();
const avatarRef = ref<HTMLElement>();
const repliesRef = ref<HTMLElement>();

// Reactive dimensions
const avatarPosition = ref({ x: 0, y: 0, centerX: 0, centerY: 0 });
const lastReplyAvatarPosition = ref({ centerY: 0 });

// Constants
const INDENT_PER_LEVEL = 40; // 每层级的缩进距离
const AVATAR_SIZE = 32; // 头像大小 (8 * 4 = 32px in Tailwind)

// Safely compute author nickname with a fallback.
const authorNickname = computed(() => props.comment.user?.nickname ?? 'Anonymous');

// Safely compute the first letter of the nickname for the avatar fallback.
const avatarFallbackLetter = computed(() => (authorNickname.value?.[0] ?? 'A').toUpperCase());

// Calculate horizontal connection line (parent avatar center to current avatar center)
const horizontalLine = computed(() => {
  if (props.depth === 0) return null; // No lines for top-level comments

  const currentAvatarCenterX = avatarPosition.value.centerX;
  const currentAvatarCenterY = avatarPosition.value.centerY;

  // Parent avatar center is one indent level back
  const parentAvatarCenterX = currentAvatarCenterX - INDENT_PER_LEVEL;

  return {
    // Start from parent avatar center X
    left: `${parentAvatarCenterX}px`,
    // Position at current avatar center Y
    top: `${currentAvatarCenterY}px`,
    // Extend to current avatar center X
    width: `${INDENT_PER_LEVEL}px`,
    height: '1px',
  };
});

// Calculate vertical line (from current avatar center down to last reply's avatar center)
const verticalLine = computed(() => {
  // A comment should draw a vertical line if it has replies.
  if (!props.comment.replies?.length) {
    return null;
  }

  const currentAvatarCenterX = avatarPosition.value.centerX;
  const currentAvatarCenterY = avatarPosition.value.centerY;

  // Vertical line down to the last reply's avatar center Y
  const lastReplyCenterY = lastReplyAvatarPosition.value.centerY;
  if (lastReplyCenterY <= currentAvatarCenterY) return null; // Safety check

  const lineHeight = lastReplyCenterY - currentAvatarCenterY;

  return {
    left: `${currentAvatarCenterX}px`,
    top: `${currentAvatarCenterY}px`,
    width: '1px',
    height: `${lineHeight}px`,
  };
});

// Calculate corner dot for replies
const cornerDot = computed(() => {
  if (props.depth === 0) return null; // No dot for top-level comments

  const currentAvatarCenterY = avatarPosition.value.centerY;

  // The vertical line of the parent is exactly one indent level to the left
  // of the current avatar's center.
  const verticalLineX = avatarPosition.value.centerX - INDENT_PER_LEVEL;

  const dotSize = 5; // Using a smaller, odd number for sharper centering
  const dotOffset = dotSize / 2;

  return {
    left: `${verticalLineX - dotOffset + 0.5}px`,
    top: `${currentAvatarCenterY - dotOffset}px`,
    width: `${dotSize}px`,
    height: `${dotSize}px`,
    borderRadius: '50%',
    // Ensure the dot is visually sharp
    transform: 'translateZ(0)',
  };
});

// Measure dimensions after component mounts and when content changes
function updateDimensions() {
  if (avatarRef.value && commentRef.value) {
    const avatarRect = avatarRef.value.getBoundingClientRect();
    const containerRect = commentRef.value.getBoundingClientRect();

    // Calculate avatar position relative to the comment container
    const relativeX = avatarRect.left - containerRect.left;
    const relativeY = avatarRect.top - containerRect.top;

    avatarPosition.value = {
      x: relativeX,
      y: relativeY,
      centerX: relativeX + AVATAR_SIZE / 2,
      centerY: relativeY + AVATAR_SIZE / 2,
    };
  }

  // Measure last reply's avatar position if replies exist
  if (repliesRef.value && (props.comment.replies?.length ?? 0) > 0) {
    // Find all direct child comment item containers and get the last one
    const replyContainers = repliesRef.value.querySelectorAll(':scope > .comment-item-container') as NodeListOf<HTMLElement>;
    const lastReplyContainer = replyContainers[replyContainers.length - 1];

    if (lastReplyContainer && commentRef.value) {
      // Find the avatar within the last direct reply container
      const lastReplyAvatar = lastReplyContainer.querySelector(':scope > .comment-layout > .avatar-container') as HTMLElement;

      if (lastReplyAvatar) {
        const lastReplyAvatarRect = lastReplyAvatar.getBoundingClientRect();
        const containerRect = commentRef.value.getBoundingClientRect();

        const relativeY = lastReplyAvatarRect.top - containerRect.top;
        lastReplyAvatarPosition.value = {
          centerY: relativeY + AVATAR_SIZE / 2,
        };
      }
    }
  }
}

// Update dimensions on mount and when replies change
onMounted(async () => {
  await nextTick();
  updateDimensions();
});

// Watch for changes in replies that might affect dimensions
watch(() => props.comment.replies, async () => {
  await nextTick();
  updateDimensions();
  emit('geometry-changed'); // Also emit when replies are added/removed
}, { deep: true });
</script>

<template>
  <div ref="commentRef" class="comment-item-container" :class="{ 'is-reply': depth > 0 }">
    <!-- Connection Lines (rendered behind content) -->
    <div v-if="horizontalLine || verticalLine" class="connection-lines">
      <!-- Horizontal line: parent avatar center → current avatar center -->
      <div v-if="horizontalLine" class="line horizontal-line" :style="horizontalLine"></div>

      <!-- Vertical line: current avatar center → last reply avatar center -->
      <div v-if="verticalLine" class="line vertical-line" :style="verticalLine"></div>

      <!-- Corner dot for replies -->
      <div v-if="cornerDot" class="line" :style="cornerDot"></div>
    </div>

    <div class="comment-layout">
      <!-- Avatar -->
      <div ref="avatarRef" class="avatar-container">
        <Avatar class="h-8 w-8 border">
          <AvatarImage :src="comment.user?.avatar_url || ''" :alt="authorNickname" />
          <AvatarFallback>{{ avatarFallbackLetter }}</AvatarFallback>
        </Avatar>
      </div>

      <!-- Content Card -->
      <Card class="ml-4 flex-1 shadow-sm gap-0 p-0 min-w-0">
        <CardHeader class="flex flex-row items-center justify-between p-3">
          <CardTitle class="text-sm font-semibold">{{ authorNickname }}</CardTitle>
          <span class="text-xs text-muted-foreground">{{
            new Date(comment.created_at).toLocaleString()
            }}</span>
        </CardHeader>
        <CardContent class="p-3 pt-0 pb-0">
          <p class="text-sm whitespace-pre-wrap break-words">{{ comment.content }}</p>
        </CardContent>
        <CardFooter class="flex justify-end pr-3 pb-2">
          <Button  variant="ghost" size="icon" @click="isReplying = !isReplying">
            <MessageCirclePlus class="h-2 w-2" />
            <span class="sr-only">{{ $t('comments.reply') }}</span>
          </Button>
        </CardFooter>
      </Card>
    </div>

    <!-- Reply Form -->
    <div v-if="isReplying" ref="replyFormContainer" class="mt-4 ml-12">
      <CommentForm :anchor-type="comment.parent_type" :anchor-id="comment.parent_id" :parent-comment-id="comment.id"
        :replying-to="comment" @comment-posted="onReplySubmitted" @cancel-reply="isReplying = false" />
    </div>

    <!-- Nested Replies -->
    <div v-if="comment.replies && comment.replies.length > 0" ref="repliesRef" class="replies-container">
      <CommentItem v-for="reply in comment.replies" :key="reply.id" :comment="reply" :depth="props.depth + 1"
        @reply-posted="(newComment) => $emit('reply-posted', newComment)" @geometry-changed="handleGeometryChange" />
    </div>
  </div>
</template>

<style scoped>
.comment-item-container {
  position: relative;
}

/* Add margin and padding for replies - calculated indent per level */
.is-reply {
  margin-top: 16px;
  padding-left: 40px;
  /* INDENT_PER_LEVEL */
}

.comment-layout {
  display: flex;
  align-items: flex-start;
  position: relative;
  z-index: 2;
  /* Above connection lines */
}

.avatar-container {
  position: relative;
  z-index: 3;
  /* Highest layer */
  /* The background color should cover the connection lines underneath */
  background-color: hsl(var(--background));
  /* Remove padding and let the Avatar component handle its own size */
  border-radius: 9999px;
  /* Ensure the container itself doesn't add extra space */
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.connection-lines {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
  /* Behind content */
}

.line {
  position: absolute;
  background-color: hsl(var(--border));
}

.horizontal-line {
  /* Height set dynamically via style binding */
}

.vertical-line {
  /* Width set dynamically via style binding */
}

.replies-container {
  position: relative;
  margin-top: 16px;
}
</style>