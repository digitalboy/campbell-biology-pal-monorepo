<script setup lang="ts">
import { ref, watch } from 'vue';
import { NodeToolbar } from '@vue-flow/node-toolbar';
import { Position } from '@vue-flow/core';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/authStore';
import { Bot } from 'lucide-vue-next';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const props = defineProps({
  nodeId: {
    type: String,
    required: true,
  },
  isVisible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  (e: 'deleteNode', nodeId: string): void;
  (e: 'aiChat', nodeId: string): void;
  (e: 'mouseenter'): void;
  (e: 'mouseleave'): void;
  (e: 'dialogStateChange', isOpen: boolean): void;
}>();

const { t } = useI18n();
const authStore = useAuthStore();
const isDialogOpen = ref(false);

watch(isDialogOpen, (isOpen) => {
  emit('dialogStateChange', isOpen);
  // When dialog opens, we want to make sure the toolbar stays visible
  if (isOpen) {
    emit('mouseenter');
  }
});

function handleDeleteConfirm() {
  emit('deleteNode', props.nodeId);
}
</script>

<template>
  <NodeToolbar
    :is-visible="isVisible"
    style="display: flex; gap: 4px;"
    :position="Position.Bottom"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
  >
        <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button variant="outline" size="icon" @click="emit('aiChat', nodeId)">
            <Bot class="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ t('header.ai_chat') }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    
    <AlertDialog v-if="authStore.isAdmin" v-model:open="isDialogOpen">
      <AlertDialogTrigger as-child>
        <Button variant="destructive" size="sm">{{ t('graph.toolbar.delete') }}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('graph.toolbar.confirmDeleteTitle') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('graph.toolbar.confirmDeleteDescription', { nodeId: nodeId }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('graph.toolbar.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="handleDeleteConfirm">{{ t('graph.toolbar.delete') }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </NodeToolbar>
</template>