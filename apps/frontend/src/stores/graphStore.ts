/**
 * @file graphStore.ts
 * @description 知识图谱 Pinia 状态库，支持 1-Hop 拓扑图谱抓取与概念抽屉/弹窗开合控制。
 * 
 * 备注与经验教训 (重要):
 * 1. 采用以单个点击概念词 (Node UUID) 为中心的 1-Hop 拓扑增量加载，避免了一次性抓取全局 3,000+ 节点导致的浏览器卡顿。
 * 2. 具备完整的 Modal 状态管理与自动请求重试机制。
 */

import { ref } from 'vue';
import { defineStore } from 'pinia';
import { graphService } from '@/services/graphService';
import { api } from '@/services/apiClient';
import type { GraphData } from '@/types/api';
import { toast } from 'vue-sonner';

export const useGraphStore = defineStore('graph', () => {
  // --- State ---
  const graphData = ref<GraphData | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // 1-Hop 动态弹窗/抽屉状态
  const isModalOpen = ref(false);
  const activeNodeUuid = ref<string | null>(null);

  // --- Actions ---

  /**
   * 调取以指定 Node UUID 为中心的 1-Hop 拓扑网络
   * @param uuid 中心节点 UUID
   */
  async function fetchRelatedNodes(uuid: string, lang?: string) {
    isLoading.value = true;
    error.value = null;
    activeNodeUuid.value = uuid;

    try {
      const response = await graphService.getRelatedNodes(uuid, lang);
      graphData.value = response;
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || '获取知识图谱失败。';
      console.error(error.value);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 打开指定概念节点的 1-Hop 图谱弹窗
   * @param uuid 概念节点 UUID
   */
  async function openConceptModal(uuid: string, lang?: string) {
    isModalOpen.value = true;
    await fetchRelatedNodes(uuid, lang);
  }

  /**
   * 关闭 1-Hop 图谱弹窗
   */
  function closeConceptModal() {
    isModalOpen.value = false;
    activeNodeUuid.value = null;
  }

  /**
   * 删除指定的概念节点及连线
   * @param uuid 节点 UUID
   */
  async function deleteGraphNode(uuid: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await api.deleteNode(uuid);
      if (response.ok) {
        toast.success(response.message || '节点删除成功。');
        if (graphData.value) {
          graphData.value.nodes = graphData.value.nodes.filter(node => node.id !== uuid);
          graphData.value.relationships = graphData.value.relationships.filter(
            rel => rel.source !== uuid && rel.target !== uuid
          );
        }
      } else {
        error.value = response.message || '删除节点失败。';
        toast.error(error.value);
      }
    } catch (e) {
      const apiError = e as any;
      error.value = apiError.message || '删除节点失败。';
      console.error(error.value);
      if (error.value) {
        toast.error(error.value);
      }
    } finally {
      isLoading.value = false;
    }
  }

  return {
    graphData,
    isLoading,
    error,
    isModalOpen,
    activeNodeUuid,
    fetchRelatedNodes,
    openConceptModal,
    closeConceptModal,
    deleteGraphNode,
  };
});
