<script setup lang="ts">
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { Languages } from 'lucide-vue-next';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const { locale, t } = useI18n();

const languages = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ja', name: '日本語' },
];

// Watch for locale changes and save to localStorage
watch(locale, (newLocale: string) => {
  localStorage.setItem('i18n_lang', newLocale);
});

function setLocale(lang: string) {
  locale.value = lang;
}
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <DropdownMenu>
        <TooltipTrigger as-child>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon">
              <Languages class="w-5 h-5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <DropdownMenuContent class="w-[100px] p-0">
          <DropdownMenuItem v-for="lang in languages" :key="lang.code" @click="setLocale(lang.code)">
            {{ lang.name }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TooltipContent>
        <p>{{ t('header.language') }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
