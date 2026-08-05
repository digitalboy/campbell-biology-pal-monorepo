<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/authStore';
import LanguageSwitcher from './LanguageSwitcher.vue';
import UserNav from './UserNav.vue';
import ThemeToggle from './ThemeToggle.vue';
import { Button } from '@/components/ui/button';
import WrongAnswerNotebookDialog from '@/components/features/review-session/WrongAnswerNotebookDialog.vue';
import { BookX, Trophy } from 'lucide-vue-next';
import LeaderboardDialog from '@/components/features/social/LeaderboardDialog.vue';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const { t } = useI18n();
const authStore = useAuthStore();

const isWrongAnswerNotebookOpen = ref(false);
const isLeaderboardOpen = ref(false);
</script>

<template>
  <header class="p-4 border-b">
    <nav class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <router-link to="/" class="flex items-center gap-2">
          <img src="/logo.svg" alt="App Logo" class="h-8 w-8" />
          <span class="font-semibold">{{ t('header.home') }}</span>
        </router-link>
        
      </div>
      <div class="flex items-center gap-4">
        <template v-if="authStore.user">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" @click="isLeaderboardOpen = true">
                  <Trophy class="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ t('leaderboard.title') }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button variant="ghost" size="icon" @click="isWrongAnswerNotebookOpen = true">
                  <BookX class="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ t('wrongAnswerNotebook.title') }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </template>

        <LanguageSwitcher />
        <ThemeToggle />
        <UserNav />
      </div>
    </nav>

    <LeaderboardDialog v-model="isLeaderboardOpen" />
    <WrongAnswerNotebookDialog v-model="isWrongAnswerNotebookOpen" />
  </header>
</template>
