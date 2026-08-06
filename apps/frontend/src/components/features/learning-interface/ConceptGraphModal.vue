<!-- src/components/features/learning-interface/ConceptGraphModal.vue -->
<script setup lang="ts">
/**
 * @file ConceptGraphModal.vue
 * @description 1-Hop 动态图谱与权威定义弹窗组件 (响应式宽高扩充，100% 对齐系统亮/暗主题变量)。
 * 
 * 备注与经验教训 (重要):
 * 1. 【全量主题对齐】使用系统 CSS 变量 (bg-card / text-card-foreground / border-border / bg-background)，
 *    使得弹窗在亮色 (Light Mode) 与暗色 (Dark Mode) 模式下均与整体应用配色 100% 融合。
 * 2. 【更大画面视野】最大宽度扩充至 max-w-7xl (1280px)，拓扑画布高度调大至 520px，提供大气通透的视觉体验。
 */

import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGraphStore } from '@/stores/graphStore';
import type { ConceptNode } from '@/types/api';
import PdfGraphViewer from './PdfGraphViewer.vue';

const graphStore = useGraphStore();
const { t, locale } = useI18n();

const isOpen = computed(() => graphStore.isModalOpen);
const isLoading = computed(() => graphStore.isLoading);
const graphData = computed(() => graphStore.graphData);

// 当前 1-Hop 中心节点数据
const centerNode = computed<ConceptNode | null>(() => {
  if (!graphData.value || !graphData.value.nodes || graphData.value.nodes.length === 0) return null;
  const activeUuid = graphStore.activeNodeUuid;

  let found = graphData.value.nodes.find(
    n => n.id === activeUuid || (n as ConceptNode).raw_id === activeUuid
  ) as ConceptNode;

  if (!found) {
    found = (graphData.value.nodes.find(n => n.type === 'Page') || graphData.value.nodes[0]) as ConceptNode;
  }
  return found || null;
});

// 计算当前语言下的概念名称
const conceptNameInfo = computed(() => {
  if (!centerNode.value) return { name: t('graphModal.defaultNodeTitle'), isFallback: false, sourceLang: 'zh' };

  const node = centerNode.value;
  const currentLang = locale.value;
  const key = `name_${currentLang}` as keyof ConceptNode;

  if (node[key] && typeof node[key] === 'string' && (node[key] as string).trim() !== '') {
    return { name: node[key] as string, isFallback: false, sourceLang: currentLang };
  }

  if (node.name_en && node.name_en.trim() !== '') {
    return { name: node.name_en, isFallback: currentLang !== 'en', sourceLang: 'en' };
  }

  return { name: node.name_zh || t('graphModal.defaultNodeTitle'), isFallback: true, sourceLang: 'zh' };
});

// 计算当前语言下的概念定义
const conceptDefinitionInfo = computed(() => {
  if (!centerNode.value) return { definition: t('graphModal.noDefinition'), isFallback: false };

  const node = centerNode.value;
  const currentLang = locale.value;
  const key = `definition_${currentLang}` as keyof ConceptNode;

  if (node[key] && typeof node[key] === 'string' && (node[key] as string).trim() !== '') {
    return { definition: node[key] as string, isFallback: false };
  }

  if (node.definition_en && node.definition_en.trim() !== '') {
    return { definition: node.definition_en, isFallback: currentLang !== 'en' };
  }

  return { definition: node.definition_zh || t('graphModal.noDefinition'), isFallback: true };
});

const closeModal = () => {
  graphStore.closeConceptModal();
};

const handleNodeClick = (event: any) => {
  if (event.node && event.node.id) {
    const targetUuid = event.node.id;
    if (targetUuid !== graphStore.activeNodeUuid) {
      graphStore.fetchRelatedNodes(targetUuid);
    }
  }
};
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-background/80 backdrop-blur-md overflow-y-auto"
        @click.self="closeModal"
      >
        <!-- 宽大大气的大号模态框卡片 (跟随系统配色) -->
        <div
          class="relative w-[92vw] max-w-7xl bg-card text-card-foreground rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[94vh] transition-colors duration-200 animate-in fade-in zoom-in-95"
        >
          <!-- 弹窗 Header -->
          <div class="px-8 py-5 border-b border-border flex items-center justify-between bg-muted/30">
            <div class="flex items-center space-x-4">
              <div class="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-xl">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <div class="flex items-center space-x-3">
                  <h3 class="text-2xl font-extrabold text-foreground tracking-tight">
                    {{ conceptNameInfo.name }}
                  </h3>
                  <!-- 多语言降级标识 -->
                  <span
                    v-if="conceptNameInfo.isFallback"
                    class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                  >
                    Campbell English Source
                  </span>
                </div>
                <p class="text-xs text-muted-foreground mt-1">
                  {{ t('graphModal.subTitle') }}
                </p>
              </div>
            </div>

            <button
              type="button"
              @click="closeModal"
              class="w-10 h-10 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- 弹窗 Body -->
          <div class="flex-1 overflow-y-auto p-8 space-y-6 bg-card">
            <!-- Loading 状态 -->
            <div v-if="isLoading" class="flex flex-col items-center justify-center py-24 space-y-4">
              <div class="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <p class="text-sm text-muted-foreground">{{ t('graphModal.loadingTopology') }}</p>
            </div>

            <template v-else>
              <!-- 概念定义卡片 (年级标签已移除) -->
              <div class="p-5 rounded-2xl bg-muted/40 border border-border space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold uppercase tracking-wider text-primary">
                    {{ t('graphModal.authoritativeDefinition') }}
                  </span>
                </div>
                <p class="text-base text-foreground leading-relaxed font-normal">
                  {{ conceptDefinitionInfo.definition }}
                </p>
              </div>

              <!-- 1-Hop 拓扑网络画布 (高度扩大至 520px) -->
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <h4 class="text-base font-bold text-foreground">
                    {{ t('graphModal.topologyTitle') }}
                  </h4>
                </div>

                <div class="h-[520px] w-full rounded-2xl border border-border bg-background overflow-hidden relative shadow-inner">
                  <PdfGraphViewer
                    v-if="graphData && graphData.nodes.length > 0"
                    :graph-data="graphData"
                    :center-node-uuid="graphStore.activeNodeUuid"
                    @node-click="handleNodeClick"
                  />
                  <div v-else class="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                    {{ t('graphModal.noRelatedNodes') }}
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.2s ease-out;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
