<script setup lang="ts">
/**
 * @file CompanionPanel.vue
 * @description 伴侣面板组件，去除了冗余的“知识图谱/题目”切换 Tab，专一高效展示题目列表与自动注册图谱词库。
 * 
 * 备注与经验教训 (重要):
 * 1. 【UI极简优化】响应用户反馈，彻底移除顶部 [知识图谱] [题目] 标签栏，减少视觉干扰，直奔主题。
 * 2. 在后台继续保留 data.graph.nodes 的自动词库注册，确保内联高亮无缝生效。
 */

import { watch } from 'vue';
import type { PropType } from 'vue';
import type { CompanionData } from '@/types/api';
import QuestionList from './QuestionList.vue';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import { conceptDictionary } from '@/services/conceptDictionary';

const props = defineProps({
  data: {
    type: Object as PropType<CompanionData | null>,
    default: null,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  (e: 'pageSelected', pageNumber: number): void;
  (e: 'nodeClicked', nodeId: string): void;
}>();

// 监听页面 CompanionData 加载，自动将本页图谱节点注册进概念高亮词典
watch(
  () => props.data,
  (newData) => {
    if (newData?.graph?.nodes) {
      conceptDictionary.registerNodes(newData.graph.nodes);
    }
  },
  { immediate: true, deep: true }
);
</script>

<template>
  <section class="bg-card text-card-foreground rounded-2xl shadow-lg flex flex-col h-full overflow-hidden">
    <div class="flex-grow overflow-y-auto px-6 py-4 min-h-0 relative">
      <div v-if="isLoading" class="absolute inset-0 flex justify-center items-center bg-background/80 z-20 rounded-xl">
        <LoadingIndicator />
      </div>
      <div :class="{ 'opacity-50 pointer-events-none': isLoading }" class="h-full">
        <div v-if="!data" class="text-center p-8 text-muted-foreground">
          {{ $t('companionPanel.loadingError') }}
        </div>
        <template v-else>
          <QuestionList :questions="data.questions" :is-loading="isLoading" />
        </template>
      </div>
    </div>
  </section>
</template>
