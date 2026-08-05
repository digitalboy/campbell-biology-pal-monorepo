<script setup lang="ts">
import { ref, watchEffect, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useReviewStore } from '@/stores/reviewStore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import QuestionViewer from '@/components/shared/QuestionViewer.vue';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
  PaginationItem,
} from '@/components/ui/pagination';

const props = defineProps({
  modelValue: { // Use modelValue for v-model support
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const reviewStore = useReviewStore();

const selectedDateRange = ref<'1_day' | '3_days' | '7_days' | '30_days'>('3_days');

const currentQuestionIndex = ref(0);

const currentQuestion = computed(() => {
  if (reviewStore.wrongAnswers.length > 0) {
    return reviewStore.wrongAnswers[currentQuestionIndex.value];
  }
  return null;
});

const startDate = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selectedDateRange.value === '1_day') {
    const date = new Date(today);
    date.setDate(today.getDate() - 1);
    return date.toISOString();
  } else if (selectedDateRange.value === '3_days') {
    const date = new Date(today);
    date.setDate(today.getDate() - 3);
    return date.toISOString();
  } else if (selectedDateRange.value === '7_days') {
    const date = new Date(today);
    date.setDate(today.getDate() - 7);
    return date.toISOString();
  } else if (selectedDateRange.value === '30_days') {
    const date = new Date(today);
    date.setDate(today.getDate() - 30);
    return date.toISOString();
  }
  return undefined;
});

const endDate = computed(() => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today.toISOString();
});

watchEffect(() => {
  if (!props.modelValue) {
    // Do not fetch if dialog is closed
    return;
  }
  reviewStore.fetchWrongAnswers({ startDate: startDate.value, endDate: endDate.value });
  currentQuestionIndex.value = 0; // Reset index when questions change
});

function handleAnswerSubmitted(payload: { questionId: string; isCorrect: boolean }) {
  // Optionally, refresh the list or remove the question if answered correctly
  if (payload.isCorrect) {
    reviewStore.wrongAnswers = reviewStore.wrongAnswers.filter(q => q.id !== payload.questionId);
  }
}

</script>

<template>
  <Dialog :open="props.modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[800px] h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>{{ t('wrongAnswerNotebook.title') }}</DialogTitle>
        <DialogDescription>{{ t('wrongAnswerNotebook.description') }}</DialogDescription>
      </DialogHeader>

      <div class="flex items-center space-x-4 mb-4">
        <Select v-model="selectedDateRange">
          <SelectTrigger class="w-[180px]">
            <SelectValue :placeholder="t('wrongAnswerNotebook.selectRange')" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{{ t('wrongAnswerNotebook.predefinedRanges') }}</SelectLabel>
              <SelectItem value="1_day">{{ t('wrongAnswerNotebook.last1Day') }}</SelectItem>
              <SelectItem value="3_days">{{ t('wrongAnswerNotebook.last3Days') }}</SelectItem>
              <SelectItem value="7_days">{{ t('wrongAnswerNotebook.last7Days') }}</SelectItem>
              <SelectItem value="30_days">{{ t('wrongAnswerNotebook.last30Days') }}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div v-if="reviewStore.isLoading" class="flex-grow flex justify-center items-center">
        <LoadingIndicator />
      </div>
      <div v-else-if="reviewStore.error" class="flex-grow text-center text-red-500">
        {{ reviewStore.error }}
      </div>
      <div v-else-if="reviewStore.wrongAnswers.length === 0" class="flex-grow text-center text-muted-foreground">
        {{ t('wrongAnswerNotebook.noWrongAnswers') }}
      </div>
      <ScrollArea v-else class="flex-grow pr-4">
        <div class="space-y-6">
          <QuestionViewer
            v-if="currentQuestion"
            :key="currentQuestion.id"
            :question="currentQuestion"
            @answer-submitted="handleAnswerSubmitted"
          />
        </div>
      </ScrollArea>

      <div v-if="reviewStore.wrongAnswers.length > 0" class="flex-shrink-0 mt-4">
        <Pagination
          :page="currentQuestionIndex + 1"
          :total="reviewStore.wrongAnswers.length"
          :items-per-page="1"
          :sibling-count="1"
          :show-edges="true"
          @update:page="(newPage) => currentQuestionIndex = newPage - 1"
        >
          <PaginationContent v-slot="{ items }" class="flex items-center gap-1">
            <PaginationFirst />
            <PaginationPrevious />

            <template v-for="(item, index) in items">
              <PaginationItem v-if="item.type === 'page'" :key="index" :value="item.value" as-child>
                <Button class="w-10 h-10 p-0" :variant="item.value === currentQuestionIndex + 1 ? 'default' : 'outline'">
                  {{ item.value }}
                </Button>
              </PaginationItem>
              <PaginationEllipsis v-else :key="item.type" />
            </template>

            <PaginationNext />
            <PaginationLast />
          </PaginationContent>
        </Pagination>
      </div>
    </DialogContent>
  </Dialog>
</template>