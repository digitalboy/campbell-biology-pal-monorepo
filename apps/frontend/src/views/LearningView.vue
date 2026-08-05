<!-- filepath: c:\...\learning-interface\LearningView.vue -->
<script setup lang="ts">
import { ref, watchEffect, watch } from 'vue';
import PdfViewer from '@/components/features/learning-interface/PdfViewer.vue';
import CompanionPanel from '@/components/features/learning-interface/CompanionPanel.vue';

import 'vue-sonner/style.css';

import { useCompanionStore } from '@/stores/companionStore';

const companionStore = useCompanionStore();

const LAST_VISITED_PAGE_KEY = 'lastVisitedPage';
const TOTAL_PAGES = 1488; // Hardcoded total pages for now

// Helper function to read the initial page from localStorage synchronously
const getInitialPage = (): number => {
  // Check if localStorage is available (for SSR or test environments)
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 1;
  }

  const savedPage = localStorage.getItem(LAST_VISITED_PAGE_KEY);
  if (savedPage) {
    const pageNum = parseInt(savedPage, 10);
    if (!isNaN(pageNum) && pageNum > 0 && pageNum <= TOTAL_PAGES) {
      return pageNum;
    } 
  }
  return 1; // Default to 1 if nothing valid is found
};

const currentPage = ref(getInitialPage());

// Watch for changes in currentPage to save to localStorage
watch(currentPage, (newPage) => {
  localStorage.setItem(LAST_VISITED_PAGE_KEY, newPage.toString());
});

// Fetch companion data whenever the currentPage changes
watchEffect(async () => {
  // console.log('LearningView: watchEffect triggered for page', currentPage.value);
  await companionStore.fetchCompanionData(currentPage.value);
});

function handlePageChange(newPage: number) {
  // console.log('LearningView: handlePageChange called with newPage', newPage);
  currentPage.value = newPage;
}
</script>

<template>
  <!-- 
    【最终方案】: 使用 Flexbox 替代 Grid
    - h-full: 让这个容器撑满父级 <main> 的高度。
    - flex, lg:flex-row: 在大屏幕上是水平排列，在小屏幕上是垂直排列（移动端优先）。
    - p-6, gap-6: 内边距和间距。
  -->
  <div class="flex flex-col lg:flex-row h-full p-6 gap-6">

    <!-- 
      左侧面板容器
      - flex-1: 让它占据可用空间的一半。
      - min-w-0: 这是 Flexbox 的一个关键技巧，防止内部内容（如很宽的图片）撑破布局。
    -->
    <div class="flex-1 min-w-0">
      <PdfViewer :page-number="currentPage" :pdf-url="companionStore.companionData?.pageImageUrl"
        :total-pages="1488"
        @update:page-number="handlePageChange" />
    </div>

    <!-- 
      右侧面板容器
      - flex-1: 让它也占据可用空间的一半。
      - min-w-0: 同样用于防止内容溢出。
    -->
    <div class="flex-1 min-w-0">
      <CompanionPanel :data="companionStore.companionData" :is-loading="companionStore.isLoading" @page-selected="handlePageChange" @request-graph-refresh="companionStore.fetchCompanionData(currentPage)" />
    </div>


  </div>
</template>

<style scoped>
/* No specific styles needed for this layout to work */
</style>
