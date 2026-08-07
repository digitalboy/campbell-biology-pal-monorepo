<template>
  <div class="h-screen bg-slate-50 text-slate-900 flex flex-col overflow-hidden">
    <!-- Header Navbar -->
    <header class="bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-xs shrink-0">
      <div class="flex items-center gap-3">
        <router-link to="/" class="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <img src="/logo.svg" alt="Logo" class="w-7 h-7 drop-shadow-sm" />
          <span class="font-bold text-lg text-emerald-700 tracking-tight">Campbell Biology PAL</span>
        </router-link>
        <span class="text-slate-300 font-light">|</span>
        <span class="text-sm font-semibold text-slate-600">Question Detail & Reader</span>
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="copyShareLink"
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60 transition-all cursor-pointer shadow-2xs"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <span>{{ copied ? 'Link Copied!' : 'Copy Share Link' }}</span>
        </button>

        <router-link
          to="/"
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-white hover:bg-slate-700 transition-all shadow-2xs"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m12 19-7-7 7-7"/>
            <path d="M19 12H5"/>
          </svg>
          <span>Back to Home</span>
        </router-link>
      </div>
    </header>

    <!-- Main Content Container: Left PDF, Right Question/Discussion -->
    <main class="flex-1 min-h-0 p-6">
      <!-- Loading State -->
      <div v-if="isLoading" class="h-full flex flex-col items-center justify-center gap-4">
        <div class="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-slate-500 text-sm font-medium">Loading question & textbook page...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="h-full flex flex-col items-center justify-center">
        <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700 max-w-lg shadow-sm">
          <p class="font-bold text-lg mb-2">Failed to load question</p>
          <p class="text-sm text-red-600 mb-4">{{ error }}</p>
          <router-link to="/" class="inline-block px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">Return to Home</router-link>
        </div>
      </div>

      <!-- Content State: 1:1 Split Layout (Refined to match Screenshot 2) -->
      <div v-else-if="question" class="flex flex-col lg:flex-row h-full gap-6">
        <!-- Left Panel: PDF Viewer -->
        <div class="flex-1 min-w-0 h-full">
          <PdfViewer
            :page-number="pdfPageNumber"
            :pdf-url="pdfUrl"
            :total-pages="1488"
            @update:page-number="handlePageChange"
          />
        </div>

        <!-- Right Panel: Question Viewer & Discussion -->
        <div class="flex-1 min-w-0 h-full overflow-y-auto pr-1 flex flex-col gap-6">
          <!-- Question Card Container -->
          <div class="bg-white rounded-2xl p-6 shadow-xs border border-slate-200/80">
            <div class="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-md">
                  Page {{ question.page_number }} Question
                </span>
              </div>
              <span class="text-xs font-mono text-slate-400">UUID: {{ question.id.substring(0, 8) }}</span>
            </div>

            <QuestionViewer
              :question="question"
              :question-number="1"
            />
          </div>

          <!-- Discussion Section Container -->
          <div class="bg-white rounded-2xl p-6 shadow-xs border border-slate-200/80">
            <h2 class="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span>Question Discussion</span>
            </h2>

            <CommentPanel
              parent-type="question"
              :parent-id="question.id"
            />
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/services/apiClient';
import type { Question } from '@/types/api';
import PdfViewer from '@/components/features/learning-interface/PdfViewer.vue';
import QuestionViewer from '@/components/shared/QuestionViewer.vue';
import CommentPanel from '@/components/features/learning-interface/CommentPanel.vue';

const route = useRoute();
const question = ref<Question | null>(null);
const isLoading = ref(true);
const error = ref<string | null>(null);
const copied = ref(false);
const pdfPageNumber = ref<number>(1);

// R2 PDF 资源基础路径公网拼接算法
const R2_BASE_URL = 'https://campbell-12e-pdf-by-pages.beikee.org';
const pdfUrl = computed(() => {
  const pageStr = String(pdfPageNumber.value).padStart(4, '0');
  return `${R2_BASE_URL}/page_${pageStr}.png`;
});

const fetchQuestionDetail = async (id: string) => {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await api.getQuestionById(id);
    if (res.ok && res.data) {
      question.value = res.data;
      if (res.data.page_number) {
        pdfPageNumber.value = res.data.page_number;
      }
    } else {
      error.value = 'Question not found or removed.';
    }
  } catch (e: any) {
    error.value = e?.message || 'An error occurred while fetching the question.';
  } finally {
    isLoading.value = false;
  }
};

const handlePageChange = (newPage: number) => {
  pdfPageNumber.value = newPage;
};

const copyShareLink = () => {
  const url = window.location.href;
  navigator.clipboard.writeText(url).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2500);
  });
};

onMounted(() => {
  const id = route.params.id as string;
  if (id) {
    fetchQuestionDetail(id);
  }
});

watch(() => route.params.id, (newId) => {
  if (newId) {
    fetchQuestionDetail(newId as string);
  }
});
</script>
