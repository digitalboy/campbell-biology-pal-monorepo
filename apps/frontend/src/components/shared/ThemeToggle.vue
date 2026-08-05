<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { useColorMode } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import { useI18n } from 'vue-i18n';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

const { t } = useI18n();

// 配置颜色模式，启用本地存储
const mode = useColorMode({
    selector: 'html',
    attribute: 'class',
    emitAuto: true,
    storageKey: 'color-mode',
    storage: localStorage,
    modes: {
        dark: 'dark',
        light: 'light',
    },
});

function toggleTheme() {
    mode.value = mode.value === 'dark' ? 'light' : 'dark';
}
</script>

<template>
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger as-child>
                <Button variant="outline" size="sm" @click="toggleTheme" class="w-9 h-9 p-0 border-none shadow-none">
                    <!-- 亮色模式图标 (在暗色模式时显示) -->
                    <Icon icon="lucide:sun"
                        class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <!-- 暗色模式图标 (在亮色模式时显示) -->
                    <Icon icon="lucide:moon"
                        class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span class="sr-only">{{ t('theme.toggle') }}</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                <p>{{ mode === 'dark' ? t('theme.switch_to_light') : t('theme.switch_to_dark') }}</p>
            </TooltipContent>
        </Tooltip>
    </TooltipProvider>
</template>