<script setup lang="ts">
import { type PropType, computed, ref, watch, nextTick } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,

} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import { useI18n } from 'vue-i18n';
import type { GraphData, GraphNode, GraphRelationship, ConceptNode, PageNode } from '@/types/api';
import { VueFlow, useVueFlow, Position, type Node, type Edge, type NodeMouseEvent } from '@vue-flow/core';
import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import CenterNode from '@/components/features/learning-interface/CenterNode.vue';
import ConceptNodeComponent from '@/components/features/learning-interface/SurroundingNode.vue';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true,
  },
  graphData: {
    type: Object as PropType<GraphData | null>,
    default: null,
  },
  centralNodeId: {
    type: String as PropType<string | null>,
    default: null,
  },
  isLoadingGraph: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits<{
  (e: 'update:isOpen', value: boolean): void;
  (e: 'pageSelected', pageNumber: number): void;
  (e: 'nodeClicked', nodeId: string): void;
}>();

const { t, locale } = useI18n();
const { fitView, updateNodeInternals, getNodes, onNodeClick } = useVueFlow();

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);
const hasLayoutBeenApplied = ref(false);

const xSpacing = 400;
const ySpacing = 100;

// S: 1. 数据分离
// 创建计算属性来分离 Page 节点和图表节点
const pageNodes = computed(() => props.graphData?.nodes.filter(n => n.type === 'Page') || []);
const graphNodes = computed(() => props.graphData?.nodes.filter(n => n.type !== 'Page') || []);
// E: 数据分离结束

function initializeGraphState() {
  // 只使用图表节点来初始化 Vue Flow
  const allApiNodes = graphNodes.value;
  if (allApiNodes.length === 0 || !props.centralNodeId) {
    nodes.value = [];
    return;
  }
  nodes.value = allApiNodes.map(node => ({
    id: node.id,
    type: node.id === props.centralNodeId ? 'center' : 'concept',
    position: { x: 0, y: 0 },
    data: {
      label: '',
      ...(node.id !== props.centralNodeId && {
        definition: '',
        handlePosition: Position.Left,
        conceptType: (node as ConceptNode).type,
      }),
    },
    style: { opacity: 0 },
  }));
  edges.value = [];
}

const processedNodes = computed(() => {
  const allApiNodes = graphNodes.value; // 只处理图表节点
  if (allApiNodes.length === 0) {
    return [];
  }
  const getLabel = (n: GraphNode) => {
    const key = `name_${locale.value}` as keyof ConceptNode;
    return (n as ConceptNode)[key] || (n as ConceptNode).name_en;
  };
  const getDefinition = (n: GraphNode): string => {
    const concept = n as ConceptNode;
    const key = `definition_${locale.value}` as keyof ConceptNode;
    return (concept[key] as string) || concept.definition_en || '';
  };
  return nodes.value.map(existingNode => {
    const apiNode = allApiNodes.find(n => n.id === existingNode.id);
    if (!apiNode) return existingNode;
    return {
      ...existingNode,
      data: {
        ...existingNode.data,
        label: getLabel(apiNode),
        ...(existingNode.type === 'concept' && {
          definition: getDefinition(apiNode),
        }),
      },
    };
  });
});

// S: 2. 简化布局和连线逻辑
const runLayoutAndRender = async () => {
  const initializedNodes = getNodes.value;
  if (initializedNodes.length === 0) return false;

  // 布局逻辑现在变得更简单，因为它只处理图表节点
  const actualCentralNode = initializedNodes.find(n => n.id === props.centralNodeId);
  if (!actualCentralNode || actualCentralNode.dimensions.width === 0) {
    console.error("Layout failed: Central node not found or has zero dimensions.");
    return false;
  }
  const surroundingNodes = initializedNodes.filter(n => n.id !== props.centralNodeId);
  const finalNodes: Node[] = [];
  const finalNodesMap = new Map<string, Node>();
  const finalActualCentralNode: Node = {
    ...actualCentralNode,
    position: { x: -actualCentralNode.dimensions.width / 2, y: -actualCentralNode.dimensions.height / 2 },
    style: { opacity: 1 },
  };
  finalNodes.push(finalActualCentralNode);
  finalNodesMap.set(finalActualCentralNode.id, finalActualCentralNode);
  const midIndex = Math.ceil(surroundingNodes.length / 2);
  const leftNodesRaw = surroundingNodes.slice(0, midIndex);
  const rightNodesRaw = surroundingNodes.slice(midIndex);
  const leftTotalHeight = leftNodesRaw.reduce((sum, node) => sum + (node.dimensions.height || 50), 0) + (leftNodesRaw.length > 0 ? (leftNodesRaw.length - 1) * ySpacing : 0);
  let currentYLeft = -leftTotalHeight / 2;
  leftNodesRaw.forEach(node => {
    const nodeHeight = node.dimensions.height || 50;
    const finalNode: Node = { ...node, position: { x: -xSpacing - (node.dimensions.width || 150), y: currentYLeft }, data: { ...node.data, handlePosition: Position.Right }, style: { opacity: 1 } };
    finalNodes.push(finalNode);
    finalNodesMap.set(finalNode.id, finalNode);
    currentYLeft += nodeHeight + ySpacing;
  });
  const rightTotalHeight = rightNodesRaw.reduce((sum, node) => sum + (node.dimensions.height || 50), 0) + (rightNodesRaw.length > 0 ? (rightNodesRaw.length - 1) * ySpacing : 0);
  let currentYRight = -rightTotalHeight / 2;
  rightNodesRaw.forEach(node => {
    const nodeHeight = node.dimensions.height || 50;
    const finalNode: Node = { ...node, position: { x: xSpacing, y: currentYRight }, data: { ...node.data, handlePosition: Position.Left }, style: { opacity: 1 } };
    finalNodes.push(finalNode);
    finalNodesMap.set(finalNode.id, finalNode);
    currentYRight += nodeHeight + ySpacing;
  });

  nodes.value = finalNodes;

  // 连线生成逻辑现在也无需担心 Page 节点，因为它们从一开始就不在数据源中
  edges.value = props.graphData!.relationships.map((rel: GraphRelationship) => {
    const sourceNode = finalNodesMap.get(rel.source);
    const targetNode = finalNodesMap.get(rel.target);
    let sourceHandleId: string | null = null;
    let targetHandleId: string | null = null;
    if (rel.source === props.centralNodeId) {
      sourceHandleId = targetNode && targetNode.position.x > 0 ? 'source-right' : 'source-left';
      targetHandleId = 'a';
    } else if (rel.target === props.centralNodeId) {
      sourceHandleId = 'a';
      targetHandleId = sourceNode && sourceNode.position.x < 0 ? 'left' : 'right';
    } else {
      sourceHandleId = 'a';
      targetHandleId = 'a';
    }
    return { id: `e-${rel.source}-${rel.target}-${rel.type}`, source: rel.source, target: rel.target, sourceHandle: sourceHandleId, targetHandle: targetHandleId, label: rel.type, animated: true };
  });

  hasLayoutBeenApplied.value = true;
  return true;
};
// E: 简化结束

watch(() => [props.graphData, props.centralNodeId], async ([newGraphData, newCentralNodeId], [oldGraphData, oldCentralNodeId]) => {
  // 只有当对话框打开且数据实际发生变化时才重新渲染
  if (props.isOpen && (newGraphData !== oldGraphData || newCentralNodeId !== oldCentralNodeId)) {
    console.log('GraphDataDialog: graphData or centralNodeId changed, re-initializing...');
    hasLayoutBeenApplied.value = false; // 重置布局状态
    initializeGraphState();
    setTimeout(async () => {
      console.log('Step 1: Running first updateNodeInternals...');
      await updateNodeInternals(nodes.value.map(n => n.id));
      await nextTick();
      console.log('Step 2: Running layout calculation...');
      const layoutSuccess = await runLayoutAndRender();
      if (layoutSuccess) {
        await nextTick();
        console.log('Step 3: Running second updateNodeInternals...');
        await updateNodeInternals(nodes.value.map(n => n.id));
        fitView({ padding: 0.2, duration: 200 });
      }
    }, 150);
  }
}, { deep: true });

watch(() => props.isOpen, async (isOpen) => {
  if (isOpen && props.graphData && !hasLayoutBeenApplied.value) {
    initializeGraphState();
    setTimeout(async () => {
      console.log('Step 1: Running first updateNodeInternals...');
      await updateNodeInternals(nodes.value.map(n => n.id));
      await nextTick();
      console.log('Step 2: Running layout calculation...');
      const layoutSuccess = await runLayoutAndRender();
      if (layoutSuccess) {
        await nextTick();
        console.log('Step 3: Running second updateNodeInternals...');
        await updateNodeInternals(nodes.value.map(n => n.id));
        fitView({ padding: 0.2, duration: 200 }); // 增加一点 padding 以免按钮和图表太近
      }
    }, 150);
  } else if (!isOpen) {
    hasLayoutBeenApplied.value = false;
  }
});

// S: 3. 创建外部按钮的点击事件处理器
function onPageButtonClick(pageNode: GraphNode) {
  console.log('Page button clicked!', pageNode);
  emit('pageSelected', (pageNode as PageNode).number);
  emit('update:isOpen', false);
}
// E: 处理器创建结束

onNodeClick((event: NodeMouseEvent) => {
  // 这个处理器现在只处理图表节点的点击
  console.log('Graph node clicked:', event.node);
  emit('nodeClicked', event.node.id);
});

const dialogTitle = computed(() => {
  if (!props.centralNodeId || !props.graphData) {
    return t('graphDataDialog.title');
  }
  const centralNode = props.graphData.nodes.find(node => node.id === props.centralNodeId);
  if (centralNode) {
    if (centralNode.type === 'Page') return `${t('graphDataDialog.titleFor')} ${(centralNode as any).name}`;
    const key = `name_${locale.value}` as keyof ConceptNode;
    return `${t('graphDataDialog.titleFor')} ${(centralNode as ConceptNode)[key] || (centralNode as ConceptNode).name_en}`;
  }
  return t('graphDataDialog.title');
});
</script>

<template>
  <Dialog :open="isOpen" @update:open="emit('update:isOpen', $event)">
    <DialogContent class="sm:max-w-[800px] lg:max-w-[1200px] h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>{{ dialogTitle }}</DialogTitle>
        <DialogDescription>
          {{ t('graphDataDialog.description') }}
        </DialogDescription>
      </DialogHeader>

      <!-- S: 4. 渲染 Page 按钮的专属区域 -->
      <div v-if="pageNodes.length > 0" class="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-10 gap-2 p-2 border-b">
        <Button v-for="pageNode in pageNodes" :key="pageNode.id" variant="outline" size="sm"
          @click="onPageButtonClick(pageNode)">
          {{ (pageNode as any).name || pageNode.id }}
        </Button>
      </div>
      <!-- E: 按钮区域结束 -->

      <div class="flex-grow relative">
        <div v-if="!graphData || graphNodes.length === 0 || isLoadingGraph"
          class="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <LoadingIndicator v-if="isLoadingGraph" />
          <span v-else-if="!graphData || graphNodes.length === 0">{{ t('graphDataDialog.noData') }}</span>
        </div>
        <div v-else class="w-full h-full">
          <VueFlow v-model:nodes="processedNodes" v-model:edges="edges" :fit-view-on-init="false">
            <MiniMap />
            <Controls />
            <template #node-center="props">
              <CenterNode :data="props.data" />
            </template>
            <template #node-concept="props">
              <ConceptNodeComponent :id="props.id" :data="props.data" :source-position="props.sourcePosition"
                :target-position="props.targetPosition" />
            </template>
            <!-- Page 节点的模板已移除 -->
          </VueFlow>
        </div>
      </div>
      
    </DialogContent>
  </Dialog>
</template>