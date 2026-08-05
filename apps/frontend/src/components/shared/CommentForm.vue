<script setup lang="ts">
import { ref } from 'vue';
import type { PropType } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import { useCommentStore } from '@/stores/commentStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { Comment } from '@/types/api'; // Import Comment type
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import { MessageCirclePlus } from 'lucide-vue-next';
import { MessageCircleX } from 'lucide-vue-next';

const props = defineProps({
  anchorType: {
    type: String as () => 'page' | 'question',
    required: true,
  },
  anchorId: {
    type: String,
    required: true,
  },
  parentCommentId: {
    type: String as PropType<string | null>,
    default: null,
  },
  replyingTo: { // New prop
    type: Object as PropType<Comment | null>,
    default: null,
  },
});

const authStore = useAuthStore();
const commentStore = useCommentStore();

const content = ref('');
const isSubmitting = ref(false);

async function handleSubmit() {
  if (!content.value.trim() || !authStore.user) return;

  isSubmitting.value = true;
  try {
    const newComment = await commentStore.postComment({
      parentType: props.anchorType,
      parentId: props.anchorId,
      parentCommentId: props.parentCommentId,
      content: content.value,
    });
    content.value = ''; // Clear textarea on success
    emit('comment-posted', newComment); // Emit an event to notify parent that comment was posted
  } catch (error) {
    // TODO: Show error to user
    console.error('Failed to submit comment from component', error);
  } finally {
    isSubmitting.value = false;
  }
}

const emit = defineEmits<{
  (e: 'comment-posted', comment: Comment): void;
  (e: 'cancel-reply'): void;
}>();

function handleCancelReply() {
  emit('cancel-reply');
}

function getReplyingToNickname() {
  return props.replyingTo?.user?.nickname ?? '';
}


</script>

<template>
  <div class="flex items-start space-x-3 relative">
    <!-- Loading Overlay -->
    <div v-if="isSubmitting" class="absolute inset-0 bg-none flex justify-center items-center rounded-lg z-10">
      <LoadingIndicator />
    </div>

    <Avatar class="h-8 w-8 boarder">
      <AvatarImage :src="authStore.user?.avatar_url || ''" alt="Your avatar" />
      <AvatarFallback>{{ authStore.user?.nickname?.[0] }}</AvatarFallback>
    </Avatar>
    <div class="flex-1">
      <!-- Replying to message -->
      <div v-if="props.replyingTo" class="mb-2 p-2 rounded-md text-sm">
        <span>{{ $t('comments.replyingTo') }} @{{ getReplyingToNickname() }}</span>
      </div>

      <Textarea v-model="content" :disabled="isSubmitting" :placeholder="$t('comments.placeholder')"
        class="w-full p-3 text-sm rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
        rows="3" />
      <div class="flex justify-end items-center mt-2 space-x-2 pr-2">
        <Button v-if="props.replyingTo" variant="ghost" size="icon" @click="handleCancelReply">
          <MessageCircleX class="h-2 w-2" />
        </Button>
        <Button @click="handleSubmit" variant="ghost" size="icon" :disabled="isSubmitting || !content.trim()">
          <MessageCirclePlus class="h-2 w-2" />
        </Button>
      </div>
    </div>
  </div>
</template>