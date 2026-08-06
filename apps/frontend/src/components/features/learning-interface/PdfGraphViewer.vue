<!-- src/components/features/learning-interface/PdfGraphViewer.vue -->
<script setup lang="ts">
/**
 * @file PdfGraphViewer.vue
 * @description Vue Flow 1-Hop 拓扑图谱渲染组件 (具备宽敞的 520px 高度与主题系统颜色融合)。
 */

import { type PropType, ref, watch, nextTick, computed } from 'vue';
import type { GraphData, GraphNode, GraphRelationship, ConceptNode } from '@/types/api';
import { VueFlow, useVueFlow, Position, type Node, type Edge, type NodeMouseEvent } from '@vue-flow/core';

import { MiniMap } from '@vue-flow/minimap';
import { Controls } from '@vue-flow/controls';
import { useI18n } from 'vue-i18n';

import CenterNode from '@/components/features/learning-interface/CenterNode.vue';
import ConceptNodeComponent from '@/components/features/learning-interface/SurroundingNode.vue';

import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

const props = defineProps({
  graphData: {
    type: Object as PropType<GraphData>,
    required: true,
  },
  centerNodeUuid: {
    type: String,
    default: null,
  },
});

const emit = defineEmits<{
  (e: 'node-click', event: NodeMouseEvent): void;
  (e: 'graphUpdated'): void;
}>();

const { locale } = useI18n();
const { fitView, onNodesInitialized, updateNodeInternals, onNodeClick } = useVueFlow();

onNodeClick((event: NodeMouseEvent) => {
  if (event.node) {
    emit('node-click', event);
  }
});

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

const xSpacing = 360;
const ySpacing = 80;

const getNodeLabel = (n: GraphNode): string => {
  const concept = n as ConceptNode;
  const currentLang = locale.value;
  const key = `name_${currentLang}` as keyof ConceptNode;

  if (concept[key] && typeof concept[key] === 'string' && (concept[key] as string).trim() !== '') {
    return concept[key] as string;
  }
  if (concept.name_zh && concept.name_zh.trim() !== '') return concept.name_zh;
  if (concept.name_en && concept.name_en.trim() !== '') return concept.name_en;
  if ((n as any).name && typeof (n as any).name === 'string') return (n as any).name;
  return '知识节点';
};

const getDefinition = (n: GraphNode): string => {
  const concept = n as ConceptNode;
  const currentLang = locale.value;
  const key = `definition_${currentLang}` as keyof ConceptNode;

  if (concept[key] && typeof concept[key] === 'string' && (concept[key] as string).trim() !== '') {
    return concept[key] as string;
  }
  return concept.definition_en || concept.definition_zh || '';
};

const processedNodes = computed(() => {
  const allApiNodes = props.graphData?.nodes;
  if (!allApiNodes || allApiNodes.length === 0) {
    return [];
  }

  return nodes.value.map(existingNode => {
    const apiNode = allApiNodes.find(n => n.id === existingNode.id || (n as ConceptNode).raw_id === existingNode.id);
    if (!apiNode) return existingNode;

    return {
      ...existingNode,
      data: {
        ...existingNode.data,
        label: getNodeLabel(apiNode),
        definition: getDefinition(apiNode),
      },
    };
  });
});

const initializeGraphState = () => {
  const allApiNodes = props.graphData?.nodes;
  if (!allApiNodes || allApiNodes.length === 0) {
    nodes.value = [];
    edges.value = [];
    return;
  }

  const centerApiNode = (props.centerNodeUuid ? allApiNodes.find(n => n.id === props.centerNodeUuid || (n as ConceptNode).raw_id === props.centerNodeUuid) : null)
    || allApiNodes.find(n => n.type === 'Page') 
    || allApiNodes[0];

  const initialNodes = allApiNodes.map(node => {
    const isCenter = node.id === centerApiNode.id;
    return {
      id: node.id,
      type: isCenter ? 'center' : 'concept',
      position: { x: 0, y: 0 },
      data: {
        label: getNodeLabel(node),
        definition: getDefinition(node),
        handlePosition: Position.Left,
      },
      style: { opacity: 0 },
    };
  });

  nodes.value = initialNodes;
  edges.value = [];
};

onNodesInitialized((initializedNodes) => {
  if (initializedNodes.length === 0 || !props.graphData?.relationships) return;
  const centerNode = initializedNodes.find(n => n.type === 'center') || initializedNodes[0];
  if (!centerNode) return;

  const conceptNodes = initializedNodes.filter(n => n.id !== centerNode.id);
  const conceptNodeIds = conceptNodes.map(n => n.id);
  const midIndex = Math.ceil(conceptNodes.length / 2);
  const leftNodesRaw = conceptNodes.slice(0, midIndex);
  const rightNodesRaw = conceptNodes.slice(midIndex);

  const finalNodes: Node[] = [];
  const finalNodesMap = new Map<string, Node>();

  const leftTotalHeight = leftNodesRaw.reduce((sum, node) => sum + (node.dimensions?.height || 50), 0) + (leftNodesRaw.length - 1) * ySpacing;
  let currentYLeft = -leftTotalHeight / 2;
  leftNodesRaw.forEach(node => {
    const nodeHeight = node.dimensions?.height || 50;
    const finalNode: Node = {
      ...node,
      position: { x: -xSpacing - (node.dimensions?.width || 140), y: currentYLeft },
      data: { ...node.data, handlePosition: Position.Right },
      style: { opacity: 1 },
    };
    finalNodes.push(finalNode);
    finalNodesMap.set(finalNode.id, finalNode);
    currentYLeft += nodeHeight + ySpacing;
  });

  const rightTotalHeight = rightNodesRaw.reduce((sum, node) => sum + (node.dimensions?.height || 50), 0) + (rightNodesRaw.length - 1) * ySpacing;
  let currentYRight = -rightTotalHeight / 2;
  rightNodesRaw.forEach(node => {
    const nodeHeight = node.dimensions?.height || 50;
    const finalNode: Node = {
      ...node,
      position: { x: xSpacing, y: currentYRight },
      data: { ...node.data, handlePosition: Position.Left },
      style: { opacity: 1 },
    };
    finalNodes.push(finalNode);
    finalNodesMap.set(finalNode.id, finalNode);
    currentYRight += nodeHeight + ySpacing;
  });

  const finalCenterNode: Node = {
    ...centerNode,
    position: { x: -(centerNode.dimensions?.width || 140) / 2, y: -(centerNode.dimensions?.height || 50) / 2 },
    style: { opacity: 1 },
  };
  finalNodes.push(finalCenterNode);
  finalNodesMap.set(finalCenterNode.id, finalCenterNode);

  nodes.value = finalNodes;

  nextTick(() => {
    updateNodeInternals(conceptNodeIds);

    nextTick(() => {
      const finalEdges = props.graphData.relationships.map((rel: GraphRelationship) => {
        const sourceIsLeft = (finalNodesMap.get(rel.source)?.position.x ?? 0) < 0;
        const targetIsLeft = (finalNodesMap.get(rel.target)?.position.x ?? 0) < 0;

        let sourceHandle = 'right';
        let targetHandle = 'left';

        if (rel.source === centerNode.id) {
          sourceHandle = targetIsLeft ? 'left' : 'right';
          targetHandle = targetIsLeft ? 'right' : 'left';
        } else if (rel.target === centerNode.id) {
          sourceHandle = sourceIsLeft ? 'right' : 'left';
          targetHandle = sourceIsLeft ? 'left' : 'right';
        }

        return {
          id: `e-${rel.source}-${rel.target}-${rel.type}`,
          source: rel.source,
          target: rel.target,
          sourceHandle,
          targetHandle,
          label: rel.label_zh || rel.type,
          animated: true,
          style: { stroke: 'var(--primary)', strokeWidth: 2 },
        };
      });
      edges.value = finalEdges;

      nextTick(() => {
        fitView({ padding: 0.18, duration: 200 });
      });
    });
  });
});

watch(() => props.graphData, (newData) => {
  if (newData && newData.nodes.length > 0) {
    initializeGraphState();
  }
}, { immediate: true, deep: true });
</script>

<template>
  <div class="w-full h-full min-h-[520px] relative bg-background">
    <VueFlow :nodes="processedNodes" v-model:edges="edges" :fit-view-on-init="false">
      <MiniMap />
      <Controls />

      <template #node-center="nodeProps">
        <CenterNode :data="nodeProps.data" />
      </template>
      <template #node-concept="nodeProps">
        <ConceptNodeComponent
          :id="nodeProps.id"
          :data="nodeProps.data"
          @node-deleted="emit('graphUpdated')"
        />
      </template>
    </VueFlow>
  </div>
</template>