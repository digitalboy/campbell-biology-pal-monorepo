<!-- filepath: c:\DavidCode\campbell-biology-pal-v2-frontend\src\components\features\learning-interface\QuestionList.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PropType } from 'vue';
import type { Question } from '@/types/api';
import { DonutChart } from '@/components/ui/chart-donut';
import QuestionViewer from '@/components/shared/QuestionViewer.vue';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import CommentPanel from '@/components/features/learning-interface/CommentPanel.vue';
import { MessageCirclePlus } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

const { t, locale } = useI18n();

const props = defineProps({
  questions: {
    type: Array as PropType<Question[]>,
    required: true,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

const currentQuestionIndex = ref(0);

const currentQuestion = computed(() => props.questions[currentQuestionIndex.value]);

function getQuestionAccuracy(question: Question): number {
  if (!question.userStats || question.userStats.totalAttempts === 0) {
    return 0;
  }
  return (question.userStats.correctAttempts / question.userStats.totalAttempts) * 100;
}

function getAccuracyColor(accuracy: number): string {
  if (accuracy >= 90) return 'excellent';
  if (accuracy >= 70) return 'good';
  if (accuracy >= 50) return 'average';
  if (accuracy >= 30) return 'poor';
  return 'bad'; // Catches everything from 0 to < 30
}

function getChartConfig(question: Question) {
  const stats = question.userStats;

  // 定义颜色映射
  const colorMap = {
    excellent: 'hsl(142, 76%, 36%)', // emerald-600
    good: 'hsl(221, 83%, 53%)', // blue-500
    average: 'hsl(45, 93%, 47%)', // yellow-500
    poor: 'hsl(25, 95%, 53%)', // orange-500
    bad: 'hsl(0, 84%, 60%)', // red-500
    unanswered: 'hsl(215, 20%, 65%)', // slate-400 (Changed to a lighter gray for visibility)
    gray: 'hsl(215, 20%, 65%)' // slate-400
  };

  if (!stats || stats.totalAttempts === 0) {
    return {
      data: [{
        category: t('questionList.chart.unanswered'),
        value: 100,
        status: 'unanswered'
      }],
      colors: [colorMap.unanswered],
    };
  }

  const accuracy = getQuestionAccuracy(question);

  // If accuracy is 0 after at least one attempt, it's 100% incorrect.
  if (accuracy === 0) {
    return {
      data: [{
        category: t('questionList.chart.incorrect'),
        value: 100,
        status: 'incorrect'
      }],
      colors: [colorMap.bad] // Use the 'bad' color (red)
    };
  }

  const incorrectPercentage = 100 - accuracy;

  const data = [];
  const colors = [];

  if (accuracy > 0) {
    data.push({
      category: t('questionList.chart.correct'),
      value: Math.round(accuracy),
      status: 'correct'
    });
    const accuracyLevel = getAccuracyColor(accuracy);
    colors.push(colorMap[accuracyLevel as keyof typeof colorMap] || colorMap.average);
  }

  if (incorrectPercentage > 0) {
    data.push({
      category: t('questionList.chart.incorrect'),
      value: Math.round(incorrectPercentage),
      status: 'incorrect'
    });
    colors.push(colorMap.gray);
  }

  if (data.length === 0) {
    return {
      data: [{
        category: t('questionList.chart.unanswered'),
        value: 100,
        status: 'unanswered'
      }],
      colors: [colorMap.unanswered],
    };
  }

  return { data, colors };
}

function getAccuracyLevel(question: Question): string {
  if (!question.userStats || question.userStats.totalAttempts === 0) {
    return t('questionList.accuracy.unanswered');
  }
  const accuracy = getQuestionAccuracy(question);
  if (accuracy >= 90) return t('questionList.accuracy.excellent');
  if (accuracy >= 70) return t('questionList.accuracy.good');
  if (accuracy >= 50) return t('questionList.accuracy.average');
  if (accuracy >= 30) return t('questionList.accuracy.poor');
  return t('questionList.accuracy.bad');
}

const valueFormatter = (tick: number): string => `${tick}%`;

function selectQuestion(index: number) {
  currentQuestionIndex.value = index;
}

function handleAnswerSubmitted(payload: { questionId: string; isCorrect: boolean }) {
  const question = props.questions.find(q => q.id === payload.questionId);

  if (question) {
    if (!question.userStats) {
      question.userStats = { totalAttempts: 0, correctAttempts: 0 };
    }
    question.userStats.totalAttempts += 1;
    if (payload.isCorrect) {
      question.userStats.correctAttempts += 1;
    }
  }
}
</script>

<template>
  <div class="relative space-y-6">
    <div v-if="isLoading" class="absolute inset-0 flex justify-center items-center z-20 rounded-xl">
      <LoadingIndicator />
    </div>

    <div :class="{ 'opacity-50 pointer-events-none': isLoading }">
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold text-foreground">{{ t('questionList.title') }}</h3>

        <!-- 题目圆环导航 -->
        <div v-if="questions.length > 1" class="flex items-center space-x-3 mt-2 pb-4">
          <TooltipProvider :delay-duration="300">
            <Tooltip v-for="(q, index) in questions" :key="q.id">
              <TooltipTrigger as-child>
                <button @click="selectQuestion(index)"
                  class="relative rounded-full transition-all duration-300 w-10 h-10 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:scale-110 cursor-pointer"
                  :class="[
                    index === currentQuestionIndex
                      ? 'ring-2 ring-primary shadow-lg transform scale-110'
                      : 'hover:opacity-80'
                  ]">
                  <!-- 圆环图表 -->
                  <DonutChart index="category" category="value" :data="getChartConfig(q).data"
                    :colors="getChartConfig(q).colors" :show-legend="false" :show-tooltip="false"
                    :value-formatter="valueFormatter" type="pie" class="w-full h-full pointer-events-none" />


                  <span
                    class="pointer-events-none absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background text-sm font-bold text-foreground transition-colors duration-200 group-hover:text-primary">
                    {{ index + 1 }}
                  </span>

                  <!-- 准确率指示器 -->
                  <div v-if="q.userStats && q.userStats.totalAttempts > 0"
                    class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background flex items-center justify-center text-xs font-bold transition-all duration-200 pointer-events-none"
                    :class="[
                      getQuestionAccuracy(q) >= 90 ? 'bg-green-500 text-white' :
                        getQuestionAccuracy(q) >= 70 ? 'bg-emerald-500 text-white' :
                          getQuestionAccuracy(q) >= 50 ? 'bg-yellow-500 text-black' :
                            getQuestionAccuracy(q) >= 30 ? 'bg-orange-500 text-white' :
                              getQuestionAccuracy(q) > 0 ? 'bg-red-500 text-white' :
                                'bg-slate-500 text-white'
                    ]">
                    <span v-if="getQuestionAccuracy(q) >= 90">★</span>
                    <span v-else-if="getQuestionAccuracy(q) >= 70">✓</span>
                    <span v-else-if="getQuestionAccuracy(q) >= 50">~</span>
                    <span v-else-if="getQuestionAccuracy(q) >= 30">!</span>
                    <span v-else>✗</span>
                  </div>
                </button>
              </TooltipTrigger>

              <!-- 统一的 Tooltip 内容 -->
              <TooltipContent side="bottom"
                class="max-w-xs backdrop-blur-sm">
                <div class="text-xs space-y-2">
                  <p class="font-bold text-center">
                    {{ t('questionList.tooltip.title', { index: index + 1 }) }}
                  </p>

                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span >{{ t('questionList.tooltip.accuracy') }}:</span>
                      <span class="font-semibold ml-1" :class="[
                        getQuestionAccuracy(q) >= 70 ? 'text-green-400' :
                          getQuestionAccuracy(q) >= 50 ? 'text-yellow-400' :
                            getQuestionAccuracy(q) > 0 ? 'text-red-400' :
                              'text-slate-100'
                      ]">
                        {{ getQuestionAccuracy(q).toFixed(0) }}%
                      </span>
                    </div>
                    <div>
                      <span >{{ t('questionList.tooltip.attempts') }}:</span>
                      <span class="font-semibold ml-1 text-white">{{ q.userStats?.totalAttempts || 0 }}</span>
                    </div>
                    <div>
                      <span  >{{ t('questionList.tooltip.correct') }}:</span>
                      <span class="font-semibold ml-1 text-green-800">{{ q.userStats?.correctAttempts || 0 }}</span>
                    </div>
                    <div>
                      <span >{{ t('questionList.tooltip.incorrect') }}:</span>
                      <span class="font-semibold ml-1 text-red-400">{{ (q.userStats?.totalAttempts || 0) -
                        (q.userStats?.correctAttempts || 0) }}</span>
                    </div>
                  </div>

                  <div class="text-center pt-2 border-t border-slate-600">
                    <span class="font-medium text-xs text-slate-100">{{ getAccuracyLevel(q)
                    }}</span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <!-- 当前题目显示区域 -->
      <div v-if="currentQuestion" class="relative">
        <QuestionViewer :key="currentQuestion.id" :question="currentQuestion"
          @answer-submitted="handleAnswerSubmitted" />

        <!-- Floating Comment Button -->
        <Sheet>
          <SheetTrigger as-child>
            <Button variant="default" size="icon" class="absolute bottom-4 right-4 rounded-full shadow-lg">
              <MessageCirclePlus class="w-6 h-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" class="w-full sm:max-w-lg p-0">
            <SheetHeader class="p-6 pb-0 mb-0">
              <SheetTitle>{{ t('questionViewer.commentPanel.titlePrefix') }}{{
                currentQuestion.question_text[locale]?.substring(0, 15) || currentQuestion.question_text.en.substring(0,
                  15) }}{{ (currentQuestion.question_text[locale]?.length || currentQuestion.question_text.en.length) > 15
                  ? '...' : '' }}</SheetTitle>
              <SheetDescription>{{ t('questionViewer.commentPanel.description') }}</SheetDescription>
            </SheetHeader>
            <ScrollArea class="h-[calc(100vh-6rem)] p-6">
              <CommentPanel anchor-type="question" :anchor-id="currentQuestion.id" />
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </div>
      <div v-else class="text-center py-8 text-muted-foreground">
        <p>{{ t('questionList.noQuestions') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group:hover .absolute {
  animation: pulse 2s infinite;
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.8;
  }
}
</style>