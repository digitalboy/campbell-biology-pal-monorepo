<script setup lang="ts">
/**
 * @file LearningView.vue
 * @description 核心主学习视图，结合 PDF 阅读器与伴侣工作台。
 * 
 * 备注 (经验教训与规范):
 * 1. 【地址栏 Question 参数同步与分享】
 *    地址栏 URL 包含 ?page=XXX&question=YYY，支持复制全量深层链接直接分享定位给他人。
 * 2. 【翻页默认第一题与无题目降级】
 *    - 翻页时若新页面包含题目，自动选中首题 (Index 0) 并同步至 URL 地址栏；
 *    - 若新页面无题目，自动从地址栏 URL Query 中安全清理 question 参数，只保留 ?page=XXX，右侧提示“本页暂无题目”。
 * 3. 【无刷新无抖动导航】
 *    使用 router.replace 替代 router.push，防止用户频繁点选题目时破坏浏览器的历史回退栈。
 */

import { ref, watchEffect, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import PdfViewer from '@/components/features/learning-interface/PdfViewer.vue';
import CompanionPanel from '@/components/features/learning-interface/CompanionPanel.vue';

import 'vue-sonner/style.css';

import { useCompanionStore } from '@/stores/companionStore';
import { api } from '@/services/apiClient';

const route = useRoute();
const router = useRouter();
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

/**
 * 安全地同步当前页码与题目 ID 到浏览器的 URL Query 参数中
 */
const syncUrlQueryParams = (page: number, questionId: string | null) => {
  const newQuery: Record<string, string> = { ...route.query as Record<string, string>, page: page.toString() };
  if (questionId) {
    newQuery.question = questionId;
  } else {
    delete newQuery.question;
  }

  // 避免冗余触发 router.replace
  if (route.query.page !== newQuery.page || route.query.question !== newQuery.question) {
    router.replace({ query: newQuery });
  }
};

// 处理深层链接路由 /questions/:id 以及 URL Query (?page=554&question=q_123&openPdfComment=true&lang=zh)
const processQuestionDeepLink = async () => {
  // 0. 检查 URL 多语言参数 ?lang=zh/en/es/fr/de/ja
  const langQuery = (route.query.lang as string || '').toLowerCase();
  if (langQuery && ['en', 'zh', 'es', 'fr', 'de', 'ja'].includes(langQuery)) {
    locale.value = langQuery;
  }

  // 1. 检查路由路径参数 /questions/:id 或 URL query ?question=id
  const questionIdParam = (route.params.id as string) || (route.query.question as string);
  if (questionIdParam) {
    targetQuestionId.value = questionIdParam;
    
    // 如果没有显示的 page 参数，通过后端 API 反查该题目所在的 page_number
    if (!route.query.page) {
      try {
        const res = await api.getQuestionById(questionIdParam);
        if (res.ok && res.data && res.data.page_number) {
          currentPage.value = res.data.page_number;
        }
      } catch (e) {
        console.error('Failed to resolve question deep link page:', e);
      }
    }
  }

  // 2. 检查 URL Query ?page=554
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
  () => [route.params.id, route.query.page, route.query.question, route.query.openPdfComment],
  () => {
    processQuestionDeepLink();
  }
);

// 监听 Companion 数据变化：处理翻页默认首题与无题目时的 URL 安全清理
watch(
  () => companionStore.companionData,
  (data) => {
    if (!data) return;
    const questions = data.questions || [];
    if (questions.length > 0) {
      // 如果当前已有指定的 targetQuestionId 且属于本页题目，保留；否则翻页默认选中第一题 (Index 0)
      const isTargetInCurrentPage = targetQuestionId.value
        ? questions.some((q) => q.id === targetQuestionId.value)
        : false;

      if (!isTargetInCurrentPage) {
        targetQuestionId.value = questions[0].id;
      }
      syncUrlQueryParams(currentPage.value, targetQuestionId.value);
    } else {
      // 本页没有题目：清理 URL 中的 question 参数，保持 ?page=XXX
      targetQuestionId.value = null;
      syncUrlQueryParams(currentPage.value, null);
    }
  },
  { deep: true }
);

// Fetch companion data whenever the currentPage changes
watchEffect(async () => {
  await companionStore.fetchCompanionData(currentPage.value);
});

function handlePageChange(newPage: number) {
  currentPage.value = newPage;
  // 切换页面时先将 targetQuestionId 清空，由 companionData 监听器选择首题或清除参数
  targetQuestionId.value = null;
}

function handleQuestionSelected(questionId: string) {
  targetQuestionId.value = questionId;
  syncUrlQueryParams(currentPage.value, questionId);
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
        @question-selected="handleQuestionSelected"
        @request-graph-refresh="companionStore.fetchCompanionData(currentPage)"
      />
    </div>

  </div>
</template>

<style scoped>
/* No specific styles needed for this layout to work */
</style>
