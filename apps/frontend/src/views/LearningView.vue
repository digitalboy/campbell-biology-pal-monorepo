<script setup lang="ts">
import { ref, watchEffect, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PdfViewer from '@/components/features/learning-interface/PdfViewer.vue';
import CompanionPanel from '@/components/features/learning-interface/CompanionPanel.vue';

import 'vue-sonner/style.css';

import { useCompanionStore } from '@/stores/companionStore';
import { api } from '@/services/apiClient';

const route = useRoute();
const { locale } = useI18n();
const companionStore = useCompanionStore();

const LAST_VISITED_PAGE_KEY = 'lastVisitedPage';
const TOTAL_PAGES = 1488; // Hardcoded total pages for now

// Helper function to read the initial page from localStorage synchronously
const getInitialPage = (): number => {
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
  return 1;
};

const currentPage = ref(getInitialPage());
const targetQuestionId = ref<string | null>(null);
const openPdfComment = ref<boolean>(false);

// Watch for changes in currentPage to save to localStorage
watch(currentPage, (newPage) => {
  localStorage.setItem(LAST_VISITED_PAGE_KEY, newPage.toString());
});

// 处理深层链接路由 /questions/:id 以及 URL Query (?page=554&openPdfComment=true&lang=zh)
const processQuestionDeepLink = async () => {
  // 0. 检查 URL 多语言参数 ?lang=zh/en/es/fr/de/ja
  const langQuery = (route.query.lang as string || '').toLowerCase();
  if (langQuery && ['en', 'zh', 'es', 'fr', 'de', 'ja'].includes(langQuery)) {
    locale.value = langQuery;
  }

  // 1. 检查路由参数 /questions/:id
  const questionId = route.params.id as string;
  if (questionId) {
    targetQuestionId.value = questionId;
    try {
      const res = await api.getQuestionById(questionId);
      if (res.ok && res.data && res.data.page_number) {
        currentPage.value = res.data.page_number;
      }
    } catch (e) {
      console.error('Failed to resolve question deep link page:', e);
    }
    return;
  }

  // 2. 检查 URL Query (?page=554&openPdfComment=true)
  const pageQuery = route.query.page as string;
  if (pageQuery) {
    const pageNum = parseInt(pageQuery, 10);
    if (!isNaN(pageNum) && pageNum > 0 && pageNum <= TOTAL_PAGES) {
      currentPage.value = pageNum;
    }
  }

  if (route.query.openPdfComment === 'true' || route.query.openComment === 'true') {
    openPdfComment.value = true;
  }
};

onMounted(() => {
  processQuestionDeepLink();
});

watch(
  () => [route.params.id, route.query.page, route.query.openPdfComment],
  () => {
    processQuestionDeepLink();
  }
);

// Fetch companion data whenever the currentPage changes
watchEffect(async () => {
  await companionStore.fetchCompanionData(currentPage.value);
});

function handlePageChange(newPage: number) {
  currentPage.value = newPage;
}
</script>

<template>
  <div class="flex flex-col lg:flex-row h-full p-6 gap-6">

    <!-- 左侧面板容器 (PDF 阅读器 + 自动开启左侧评论抽屉) -->
    <div class="flex-1 min-w-0">
      <PdfViewer
        :page-number="currentPage"
        :pdf-url="companionStore.companionData?.pageImageUrl"
        :total-pages="1488"
        :open-pdf-comment="openPdfComment"
        @update:page-number="handlePageChange"
      />
    </div>

    <!-- 右侧面板容器 (伴侣工作台 + 自动展开评论抽屉) -->
    <div class="flex-1 min-w-0">
      <CompanionPanel
        :data="companionStore.companionData"
        :is-loading="companionStore.isLoading"
        :target-question-id="targetQuestionId"
        @page-selected="handlePageChange"
        @request-graph-refresh="companionStore.fetchCompanionData(currentPage)"
      />
    </div>

  </div>
</template>

<style scoped>
/* No specific styles needed for this layout to work */
</style>
