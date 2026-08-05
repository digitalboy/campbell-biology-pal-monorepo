<!-- src/components/features/learning-interface/SurroundingNode.vue -->
<script setup lang="ts">
/**
 * @file SurroundingNode.vue
 * @description 1-Hop 拓扑周边关联节点组件。
 * 
 * 备注与经验教训 (重要):
 * 1. 修复连线接入 Handle 位置：左侧周边节点连接右侧 Handle (:position="Position.Right")，
 *    右侧周边节点连接左侧 Handle (:position="Position.Left")。
 */
import { Handle, Position } from '@vue-flow/core';
import { computed, ref } from 'vue';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import NodeToolbar from '@/components/shared/NodeToolbar.vue';
import AiChatDialog from '@/components/shared/AiChatDialog.vue';
import { useGraphStore } from '@/stores/graphStore';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  id: string;
  data: {
    label: string;
    definition?: string;
    handlePosition: Position;
    conceptType?: string;
  };
}>();

const emit = defineEmits<{
  (e: 'nodeDeleted'): void;
}>();

const { t } = useI18n();
const graphStore = useGraphStore();

const isAiChatOpen = ref(false);
const isToolbarVisible = ref(false);
const isConfirmDialogOpen = ref(false);
const aiChatContext = ref({});
let leaveTimeout: number | undefined;

function handleMouseEnter() {
  clearTimeout(leaveTimeout);
  isToolbarVisible.value = true;
}

function handleMouseLeave() {
  if (isConfirmDialogOpen.value) return;
  leaveTimeout = window.setTimeout(() => {
    isToolbarVisible.value = false;
  }, 200);
}

function handleDialogStateChange(isOpen: boolean) {
  isConfirmDialogOpen.value = isOpen;
  if (!isOpen) {
    handleMouseLeave();
  }
}

async function handleDeleteNode() {
  await graphStore.deleteGraphNode(props.id);
  emit('nodeDeleted');
}

function handleAiChat() {
  aiChatContext.value = {
    type: 'node',
    nodeId: props.id,
    nodeName: props.data.label,
    nodeDefinition: props.data.definition,
  };
  isAiChatOpen.value = true;
}
</script>

<template>
  <div class="relative group">
    <NodeToolbar
      :is-visible="isToolbarVisible"
      :node-id="id"
      @delete-node="handleDeleteNode"
      @ai-chat="handleAiChat"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @dialog-state-change="handleDialogStateChange"
    />
    <div @mouseenter="handleMouseEnter" @mouseleave="handleMouseLeave">
      <TooltipProvider :delay-duration="200">
        <Tooltip>
          <TooltipTrigger as-child>
            <div
              class="px-4 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-950 dark:text-emerald-100 font-medium text-xs shadow-md hover:bg-emerald-200 dark:hover:bg-emerald-800 transition-colors cursor-pointer relative flex items-center justify-center"
            >
              {{ data.label }}

              <!-- 左右 Handles 明确归位 -->
              <Handle id="right" type="source" :position="Position.Right" class="!bg-emerald-600 !w-2.5 !h-2.5" />
              <Handle id="left" type="source" :position="Position.Left" class="!bg-emerald-600 !w-2.5 !h-2.5" />
              <Handle id="target-right" type="target" :position="Position.Right" class="!bg-emerald-600 !w-2.5 !h-2.5" />
              <Handle id="target-left" type="target" :position="Position.Left" class="!bg-emerald-600 !w-2.5 !h-2.5" />
            </div>
          </TooltipTrigger>
          <TooltipContent v-if="data.definition">
            <p class="max-w-sm text-xs leading-normal">{{ data.definition }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
    <AiChatDialog v-model:isOpen="isAiChatOpen" :context-data="aiChatContext" :initial-prompt="t('aiChat.inputPlaceholderForNode')" />
  </div>
</template>
