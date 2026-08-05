<script setup lang="ts">
import { ref, watchEffect, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLeaderboardStore } from '@/stores/leaderboardStore';
import type { LeaderboardSortBy } from '@/types/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const leaderboardStore = useLeaderboardStore();

const selectedSortBy = ref<LeaderboardSortBy>('totalAttempts');
const selectedDateRange = ref<'1_day' | '7_days' | '30_days' | 'all_time'>('30_days');

const startDate = computed(() => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selectedDateRange.value === '1_day') {
    const date = new Date(today);
    date.setDate(today.getDate() - 1);
    return date.toISOString();
  } else if (selectedDateRange.value === '7_days') {
    const date = new Date(today);
    date.setDate(today.getDate() - 7);
    return date.toISOString();
  } else if (selectedDateRange.value === '30_days') {
    const date = new Date(today);
    date.setDate(today.getDate() - 30);
    return date.toISOString();
  } else if (selectedDateRange.value === 'all_time') {
    return undefined; // No start date for all time
  }
  return undefined;
});

const endDate = computed(() => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (selectedDateRange.value === 'all_time') {
    return undefined; // No end date for all time
  }
  return today.toISOString();
});

watchEffect(() => {
  if (!props.modelValue) {
    // Do not fetch if dialog is closed
    return;
  }
  leaderboardStore.fetchLeaderboard({
    sortBy: selectedSortBy.value,
    startDate: startDate.value,
    endDate: endDate.value,
    limit: 10, // Default limit
  });
});

function getAccuracyDisplay(accuracy: number): string {
  return (accuracy * 100).toFixed(1) + '%';
}
</script>

<template>
  <Dialog :open="props.modelValue" @update:open="emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[800px] h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>{{ t('leaderboard.title') }}</DialogTitle>
        <DialogDescription>{{ t('leaderboard.description') }}</DialogDescription>
      </DialogHeader>

      <div class="flex items-center space-x-4 mb-4">
        <Select v-model="selectedSortBy">
          <SelectTrigger class="w-[180px]">
            <SelectValue :placeholder="t('leaderboard.sortBy')" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{{ t('leaderboard.sortBy') }}</SelectLabel>
              <SelectItem value="totalAttempts">{{ t('leaderboard.sortByOptions.totalAttempts') }}</SelectItem>
              <SelectItem value="correctAttempts">{{ t('leaderboard.sortByOptions.correctAttempts') }}</SelectItem>
              <SelectItem value="accuracy">{{ t('leaderboard.sortByOptions.accuracy') }}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select v-model="selectedDateRange">
          <SelectTrigger class="w-[180px]">
            <SelectValue :placeholder="t('leaderboard.selectRange')" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>{{ t('leaderboard.predefinedRanges') }}</SelectLabel>
              <SelectItem value="1_day">{{ t('leaderboard.last1Day') }}</SelectItem>
              <SelectItem value="7_days">{{ t('leaderboard.last7Days') }}</SelectItem>
              <SelectItem value="30_days">{{ t('leaderboard.last30Days') }}</SelectItem>
              <SelectItem value="all_time">{{ t('leaderboard.allTime') }}</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div v-if="leaderboardStore.isLoading" class="flex-grow flex justify-center items-center">
        <LoadingIndicator />
      </div>
      <div v-else-if="leaderboardStore.error" class="flex-grow text-center text-red-500">
        {{ leaderboardStore.error }}
      </div>
      <div v-else-if="leaderboardStore.leaderboardData.length === 0" class="flex-grow text-center text-muted-foreground">
        {{ t('leaderboard.noData') }}
      </div>
      <ScrollArea v-else class="flex-grow pr-4">
        <table class="w-full text-sm text-left text-muted-foreground">
          <thead class="text-xs uppercase bg-muted text-muted-foreground">
            <tr>
              <th scope="col" class="px-6 py-3">#</th>
              <th scope="col" class="px-6 py-3">{{ t('leaderboard.tableHeaders.user') }}</th>
              <th scope="col" class="px-6 py-3 text-right">{{ t('leaderboard.tableHeaders.totalAttempts') }}</th>
              <th scope="col" class="px-6 py-3 text-right">{{ t('leaderboard.tableHeaders.correctAttempts') }}</th>
              <th scope="col" class="px-6 py-3 text-right">{{ t('leaderboard.tableHeaders.accuracy') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(user, index) in leaderboardStore.leaderboardData" :key="user.userId"
              class="border-b hover:bg-muted">
              <td class="px-6 py-4 font-medium text-foreground whitespace-nowrap">
                {{ index + 1 }}
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center space-x-3">
                  <Avatar class="h-8 w-8">
                    <AvatarImage :src="user.avatarUrl || ''" :alt="user.nickname" />
                    <AvatarFallback>{{ user.nickname?.[0] || '' }}</AvatarFallback>
                  </Avatar>
                  <span>{{ user.nickname }}</span>
                </div>
              </td>
              <td class="px-6 py-4 text-right">{{ user.totalAttempts }}</td>
              <td class="px-6 py-4 text-right">{{ user.correctAttempts }}</td>
              <td class="px-6 py-4 text-right">{{ getAccuracyDisplay(user.accuracy) }}</td>
            </tr>
          </tbody>
        </table>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>