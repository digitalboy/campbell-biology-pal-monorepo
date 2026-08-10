<script setup lang="ts">
/**
 * @file QuestionViewer.vue
 * @description 题目展示与答题交互组件，内嵌题干与选项概念高亮与 1-Hop 动态图谱弹窗。
 * 
 * 备注与经验教训 (重要):
 * 1. 题干与选项文本使用 ConceptHighlighter 渲染，实现专业生物学概念与别名在 6 种语言下的自动匹配。
 * 2. 挂载 ConceptGraphModal 弹窗，点击文本概念直接触发 D1 1-Hop 局部拓扑交互。
 */

import { ref, computed, type PropType, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { storeToRefs } from 'pinia';
import type { Question } from '@/types/api';
import { Button } from '@/components/ui/button';
import { toast } from 'vue-sonner';

import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import { CircleDot, ListChecks, Bot } from 'lucide-vue-next';
import AiChatDialog from '@/components/shared/AiChatDialog.vue';
import ConceptHighlighter from '@/components/features/learning-interface/ConceptHighlighter.vue';
import ConceptGraphModal from '@/components/features/learning-interface/ConceptGraphModal.vue';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { CheckCircle, XCircle } from 'lucide-vue-next';

import { useQuestionStore } from '@/stores/questionStore';
import { useAuthStore } from '@/stores/authStore';
import AuthPromptModal from '@/components/shared/AuthPromptModal.vue';

const { t, locale } = useI18n();
const questionStore = useQuestionStore();
const authStore = useAuthStore();
const { isLoading, submissionResult, isAnswered } = storeToRefs(questionStore);

const props = defineProps({
  question: {
    type: Object as PropType<Question>,
    required: true,
  },
});

const emit = defineEmits(['answer-submitted']);

const selectedAnswers = ref<Set<string>>(new Set());
const isAiChatOpen = ref(false);
const isAuthPromptOpen = ref(false);
const isConceptGraphOpen = ref(false);
const selectedConceptName = ref('');
const aiChatContext = ref({});
const aiInitialPrompt = ref('');

const isMultipleChoice = computed(() => props.question.choice_type === 'multiple_choice');

const instructionText = computed(() => {
  return isMultipleChoice.value
    ? t('questionViewer.selectMultiple')
    : t('questionViewer.selectSingle');
});

onUnmounted(() => {
  questionStore.resetSubmissionState();
});

function toggleOption(optionId: string) {
  if (isAnswered.value || isLoading.value) return;

  if (isMultipleChoice.value) {
    if (selectedAnswers.value.has(optionId)) {
      selectedAnswers.value.delete(optionId);
    } else {
      selectedAnswers.value.add(optionId);
    }
  } else {
    selectedAnswers.value.clear();
    selectedAnswers.value.add(optionId);
    submitAnswer();
  }
}

async function submitAnswer() {
  if (isAnswered.value || isLoading.value || selectedAnswers.value.size === 0) return;

  // 校验未登录拦截：平滑弹出 Auth 引导对话框，替代粗暴报错
  if (!authStore.user) {
    isAuthPromptOpen.value = true;
    selectedAnswers.value.clear();
    return;
  }

  try {
    const result = await questionStore.submitAnswer(props.question.id, {
      selectedAnswers: Array.from(selectedAnswers.value)
    });

    emit('answer-submitted', { questionId: props.question.id, isCorrect: result.isCorrect });
  } catch (error: any) {
    console.error('Failed to submit answer:', error);
    // 若捕获 401 状态，调起登录引导
    if (error?.response?.status === 401 || !authStore.user) {
      isAuthPromptOpen.value = true;
    } else {
      toast.error(t('questionViewer.toast.submitError'));
    }
    selectedAnswers.value.clear();
  }
}

const explanationClass = computed(() => {
  if (!submissionResult.value) return '';

  if (submissionResult.value.isCorrect) {
    return 'bg-success/10 text-success-foreground';
  } else if (submissionResult.value.isPartiallyCorrect) {
    return 'bg-warning/10 text-warning-foreground';
  } else {
    return 'bg-destructive/10 text-destructive-foreground';
  }
});

const explanationBorderClass = computed(() => {
  if (!submissionResult.value) return '';

  if (submissionResult.value.isCorrect) {
    return 'border-green-500';
  } else if (submissionResult.value.isPartiallyCorrect) {
    return 'border-yellow-500';
  } else {
    return 'border-red-500';
  }
});

function getOptionClass(optionId: string) {
  const baseClass = 'border-border bg-card hover:bg-primary hover:text-primary-foreground';

  if (!isAnswered.value) {
    if (selectedAnswers.value.has(optionId)) {
      return 'border-primary bg-primary text-primary-foreground font-semibold';
    }
    return baseClass;
  }

  if (!submissionResult.value) return baseClass;

  const isCorrectAnswer = submissionResult.value.correctAnswers?.includes(optionId) ?? false;
  const isUserSelected = selectedAnswers.value.has(optionId);

  if (isCorrectAnswer && isUserSelected) {
    return 'border-success bg-success/20 text-success-foreground ring-2 ring-success/30';
  }
  if (isCorrectAnswer && !isUserSelected) {
    return 'border-success bg-success/10 text-success-foreground opacity-80';
  }
  if (!isCorrectAnswer && isUserSelected) {
    return 'border-destructive bg-destructive/10 text-destructive-foreground';
  }

  return 'border-border bg-card opacity-60';
}

function getOptionIcon(optionId: string) {
  if (!isAnswered.value || !submissionResult.value) return '';

  const isCorrectAnswer = submissionResult.value.correctAnswers?.includes(optionId) ?? false;
  const isUserSelected = selectedAnswers.value.has(optionId);

  if (isCorrectAnswer && isUserSelected) return '✓';
  if (isCorrectAnswer && !isUserSelected) return '○';
  if (!isCorrectAnswer && isUserSelected) return '✗';
  return '';
}

function getOptionIconClass(optionId: string): string {
  if (!isAnswered.value || !submissionResult.value) return '';

  const isCorrectAnswer = submissionResult.value.correctAnswers?.includes(optionId) ?? false;
  const isUserSelected = selectedAnswers.value.has(optionId);

  if (isCorrectAnswer && isUserSelected) return 'answer-icon-correct';
  if (isCorrectAnswer && !isUserSelected) return 'answer-icon-missed';
  if (!isCorrectAnswer && isUserSelected) return 'answer-icon-incorrect';
  return '';
}

function getDisplayOptionId(optionId: string): string {
  const matchOptionPrefix = optionId.match(/option_([a-zA-Z])/);
  if (matchOptionPrefix && matchOptionPrefix[1]) {
    return matchOptionPrefix[1].toUpperCase();
  }
  const matchFirstLetter = optionId.match(/^[a-zA-Z]/);
  if (matchFirstLetter && matchFirstLetter[0]) {
    return matchFirstLetter[0].toUpperCase();
  }
  return optionId;
}

function handleAiExplain() {
  if (!submissionResult.value) return;

  const optionsText = props.question.options.map(opt => {
    const text = opt.text?.[locale.value] || opt.text?.en || '';
    return `${getDisplayOptionId(opt.id)}: ${text}`;
  }).join('\n');
  const correctAnswersText = submissionResult.value.correctAnswers.map(id => getDisplayOptionId(id)).join(', ');
  const userAnswersText = Array.from(selectedAnswers.value).map(id => getDisplayOptionId(id)).join(', ');

  aiChatContext.value = {
    type: 'question',
    questionId: props.question.id,
    questionText: props.question.question_text?.[locale.value] || props.question.question_text?.en || '',
    options: optionsText,
    correctAnswers: correctAnswersText,
    userAnswers: userAnswersText,
  };
  aiInitialPrompt.value = t('questionViewer.aiInitialPrompt');
  isAiChatOpen.value = true;
}
</script>

<template>
  <div class="relative bg-muted/10 rounded-xl p-5 border border-border pb-4">
    <div v-if="isLoading" class="absolute inset-0 flex justify-center items-center bg-background/80 z-20 rounded-xl">
      <LoadingIndicator />
    </div>

    <div :class="{ 'opacity-50 pointer-events-none': isLoading }">
      <!-- 题干 (包含高亮触发器) -->
      <div class="flex items-start justify-between mb-4">
        <div class="font-semibold text-foreground text-lg pr-8">
          <ConceptHighlighter
            :text="question.question_text[locale] || question.question_text.en"
            :nodes="question.concept_nodes"
          />
        </div>
        <div class="flex flex-col items-end gap-2">
          <div v-if="!isAnswered">
            <TooltipProvider :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <div class="cursor-help">
                    <ListChecks v-if="isMultipleChoice" class="h-6 w-6 text-primary" />
                    <CircleDot v-else class="h-6 w-6 text-primary" />
                  </div>
                </TooltipTrigger>
                <TooltipContent class="backdrop-blur-sm border">
                  <div class="text-xs">
                    <p>{{ instructionText }}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <!-- 选项列表 (包含高亮触发器) -->
      <div class="space-y-3">
        <Button
          v-for="option in question.options"
          :key="option.id"
          @click="toggleOption(option.id)"
          :disabled="isAnswered || isLoading"
          variant="outline"
          class="w-full text-left p-4 h-auto justify-start whitespace-normal transition-all duration-200 relative"
          :class="getOptionClass(option.id)"
        >
          <div class="flex items-center justify-between w-full">
            <div class="flex items-start">
              <span class="font-bold mr-2 mt-0.5">{{ getDisplayOptionId(option.id) }}.</span>
              <ConceptHighlighter
                :text="option.text[locale] || option.text.en"
                :nodes="question.concept_nodes"
              />
            </div>
            <span v-if="getOptionIcon(option.id)" class="answer-icon ml-2 shrink-0" :class="getOptionIconClass(option.id)">
              {{ getOptionIcon(option.id) }}
            </span>
          </div>
        </Button>
      </div>

      <!-- 多选题提交按钮 -->
      <div v-if="isMultipleChoice && !isAnswered" class="mt-4 flex justify-center">
        <Button @click="submitAnswer" :disabled="selectedAnswers.size === 0 || isLoading" class="px-8">
          {{ isLoading ? t('common.submitting') : t('common.submit') }}
        </Button>
      </div>

      <!-- Social data -->
      <div v-if="question.answeredByUsers && question.answeredByUsers.length > 0" class="mt-6">
        <h4 class="text-sm font-semibold mb-2">{{ t('questionViewer.answeredBy') }}</h4>
        <div class="flex flex-wrap gap-2">
          <TooltipProvider :delay-duration="200">
            <Tooltip v-for="user in question.answeredByUsers" :key="user.userId">
              <TooltipTrigger as-child>
                <Avatar class="h-8 w-8 cursor-pointer border-2 hover:border-primary transition-colors">
                  <AvatarImage :src="user.avatarUrl" :alt="user.nickname || 'User Avatar'" />
                  <AvatarFallback>{{ user.nickname ? user.nickname.charAt(0).toUpperCase() : '?' }}</AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent class="backdrop-blur-sm text-white border">
                <div class="text-xs">
                  <p class="font-bold">{{ user.nickname || t('common.anonymousUser') }}</p>
                  <p>{{ t('questionViewer.socialStats.totalAttempts', { count: user.totalAttempts }) }}</p>
                  <p>{{ t('questionViewer.socialStats.correctAttempts', { count: user.correctAttempts }) }}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <!-- 答案解析 -->
      <div
        v-if="isAnswered && submissionResult"
        :class="explanationClass"
        class="explanation-area mt-6 text-sm animate-in fade-in duration-500"
      >
        <div class="p-4 border-l-8 rounded-r-lg leading-relaxed" :class="explanationBorderClass">
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-2">
              <CheckCircle v-if="submissionResult.isCorrect || submissionResult.isPartiallyCorrect" class="w-6 h-6 text-green-500" />
              <XCircle v-else class="w-6 h-6 text-red-500" />
              <span class="font-bold text-lg">
                <template v-if="submissionResult.isCorrect">{{ t('questionViewer.result.correct') }}</template>
                <template v-else-if="submissionResult.isPartiallyCorrect">{{ t('questionViewer.result.partiallyCorrect') }}</template>
                <template v-else>{{ t('questionViewer.result.incorrect') }}</template>
              </span>
            </div>
            <Button variant="outline" size="sm" @click="handleAiExplain" class="gap-2">
              <Bot class="h-4 w-4" />
              <span>{{ t('questionViewer.aiExplain') }}</span>
            </Button>
          </div>
          <strong class="font-bold">{{ t('questionViewer.explanation') }}：</strong>
          <ConceptHighlighter
            :text="submissionResult.explanation[locale] || submissionResult.explanation.en"
            :nodes="question.concept_nodes"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- AI Chat 对话框与 1-Hop 动态拓扑图谱弹窗 -->
  <AiChatDialog v-model:isOpen="isAiChatOpen" :context-data="aiChatContext" :initial-prompt="aiInitialPrompt" />
  <ConceptGraphModal v-model="isConceptGraphOpen" :concept-name="selectedConceptName" />
  <AuthPromptModal v-model="isAuthPromptOpen" />
</template>