<!-- src/components/features/learning-interface/ConceptHighlighter.vue -->
<script setup lang="ts">
/**
 * @file ConceptHighlighter.vue
 * @description 题干与选项文本概念自动高亮与点击触发器组件 (极简无缝阅读体验版)。
 * 
 * 备注与经验教训 (重要):
 * 1. 响应用户需求：去除了重色彩背景框与闪电 Icon，采用优雅的内联虚线下划线 (Dashed Underline)，
 *    不割裂题目阅读节奏，同时保持极佳的学术严谨度与点击交互感知。
 * 2. 完美支持 6 种语言 (zh, en, es, fr, de, ja) 概念词高亮与回退触发。
 */

import { computed, onMounted, watch, type PropType } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConceptNode } from '@/types/api';
import { conceptDictionary } from '@/services/conceptDictionary';
import { useGraphStore } from '@/stores/graphStore';

const props = defineProps({
  text: {
    type: String,
    required: true,
    default: '',
  },
  nodes: {
    type: Array as PropType<ConceptNode[] | string[] | any[]>,
    default: () => [],
  },
});

const emit = defineEmits<{
  (e: 'concept-click', payload: { uuid: string; name: string }): void;
}>();

const { locale } = useI18n();
const graphStore = useGraphStore();

const updateDictionary = () => {
  if (props.nodes && props.nodes.length > 0) {
    conceptDictionary.registerNodes(props.nodes);
  }
};

onMounted(() => {
  updateDictionary();
});

watch(
  () => props.nodes,
  () => {
    updateDictionary();
  },
  { deep: true }
);

const segments = computed(() => {
  if (!props.text) return [];

  const matches = conceptDictionary.findConceptsInText(props.text, locale.value);
  if (matches.length === 0) {
    return [{ isConcept: false, text: props.text, uuid: '' }];
  }

  const result: Array<{ isConcept: boolean; text: string; uuid: string }> = [];
  let currentIdx = 0;

  for (const match of matches) {
    if (match.index > currentIdx) {
      result.push({
        isConcept: false,
        text: props.text.slice(currentIdx, match.index),
        uuid: '',
      });
    }

    result.push({
      isConcept: true,
      text: match.name,
      uuid: match.uuid,
    });

    currentIdx = match.index + match.name.length;
  }

  if (currentIdx < props.text.length) {
    result.push({
      isConcept: false,
      text: props.text.slice(currentIdx),
      uuid: '',
    });
  }

  return result;
});

const handleConceptClick = (uuid: string, name: string) => {
  emit('concept-click', { uuid, name });
  graphStore.openConceptModal(uuid);
};
</script>

<template>
  <span class="inline-concept-highlighter leading-relaxed">
    <template v-for="(seg, idx) in segments" :key="idx">
      <!-- 普通文本片段 -->
      <span v-if="!seg.isConcept">{{ seg.text }}</span>

      <!-- 极简高亮概念片段 (淡绿文本 + 优雅点划下划线，不割裂阅读) -->
      <button
        v-else
        type="button"
        @click.stop="handleConceptClick(seg.uuid, seg.text)"
        class="inline cursor-pointer text-emerald-600 dark:text-emerald-400 font-medium underline decoration-dashed underline-offset-4 decoration-emerald-500/70 hover:decoration-solid hover:bg-emerald-50/80 dark:hover:bg-emerald-950/50 rounded px-0.5 transition-all focus:outline-none"
        :title="`点击查看【${seg.text}】1-Hop 拓扑知识网络`"
      >
        {{ seg.text }}
      </button>
    </template>
  </span>
</template>

<style scoped>
.inline-concept-highlighter {
  display: inline;
}
</style>
