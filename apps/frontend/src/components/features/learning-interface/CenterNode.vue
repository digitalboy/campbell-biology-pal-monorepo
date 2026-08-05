<!-- src/components/features/learning-interface/CenterNode.vue -->
<script setup lang="ts">
/**
 * @file CenterNode.vue
 * @description 1-Hop 拓扑中心节点组件。
 * 
 * 备注与经验教训 (重要):
 * 1. 修复中心节点文字显示为空的问题，确保包裹足够宽度与优雅高亮样式。
 * 2. 精确放置 Left / Right 两个方向的 Connection Handles。
 */
import { Handle, Position } from '@vue-flow/core';

defineProps<{
  data: {
    label: string;
  };
}>();
</script>

<template>
  <div class="px-5 py-2.5 rounded-xl border-2 border-emerald-500 bg-emerald-500 text-white font-bold shadow-xl flex items-center justify-center min-w-[120px] text-center text-sm relative transition-all">
    <span class="truncate max-w-[200px]">{{ data.label || '中心节点' }}</span>

    <!-- 接收与发出连接 Handles (左/右侧中心) -->
    <Handle id="left" type="target" :position="Position.Left" class="!bg-emerald-700 !w-3 !h-3 !border-2 !border-white" />
    <Handle id="right" type="target" :position="Position.Right" class="!bg-emerald-700 !w-3 !h-3 !border-2 !border-white" />
    <Handle id="source-left" type="source" :position="Position.Left" class="!bg-emerald-700 !w-3 !h-3 !border-2 !border-white" />
    <Handle id="source-right" type="source" :position="Position.Right" class="!bg-emerald-700 !w-3 !h-3 !border-2 !border-white" />
  </div>
</template>