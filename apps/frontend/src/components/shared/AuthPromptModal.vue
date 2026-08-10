<script setup lang="ts">
/**
 * @file AuthPromptModal.vue
 * @description 游客交互拦截与登录/注册引导对话框组件。
 * 
 * 备注 (经验教训):
 * 1. 【高颜值 UI 与价值主张展现】避免粗暴的“请先登录”错误提示，向未登录访客直观呈现注册登录后的 3 大核心权益。
 * 2. 【无缝重定向】点击登录后记录当前 URL query 参数，登录成功后平滑重定向回当前学习页面。
 */

import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, BrainCircuit, BookCheck, ArrowRight } from 'lucide-vue-next';

const { t } = useI18n();

const props = defineProps<{
  modelValue: boolean;
  title?: string;
  description?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const router = useRouter();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const handleGoToLogin = () => {
  isOpen.value = false;
  router.push('/login');
};
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-110 p-6 border border-emerald-500/20 shadow-xl overflow-hidden rounded-2xl">
      <!-- 顶部渐变背景修饰块 -->
      <div class="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <DialogHeader class="text-left space-y-3">
        <div class="w-12 h-12 rounded-xl bg-linear-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-inner">
          <Sparkles class="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <DialogTitle class="text-xl font-bold tracking-tight text-foreground">
            {{ props.title || t('guest.modal.title') }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground mt-1">
            {{ props.description || t('guest.modal.description') }}
          </DialogDescription>
        </div>
      </DialogHeader>

      <!-- 核心权益清单 -->
      <div class="my-4 space-y-3 py-2 border-y border-border/50">
        <div class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
          <div class="p-2 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mt-0.5">
            <BrainCircuit class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-xs font-semibold text-foreground">{{ t('guest.modal.benefit1Title') }}</h4>
            <p class="text-[11px] text-muted-foreground">{{ t('guest.modal.benefit1Desc') }}</p>
          </div>
        </div>

        <div class="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
          <div class="p-2 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 mt-0.5">
            <BookCheck class="w-4 h-4" />
          </div>
          <div>
            <h4 class="text-xs font-semibold text-foreground">{{ t('guest.modal.benefit2Title') }}</h4>
            <p class="text-[11px] text-muted-foreground">{{ t('guest.modal.benefit2Desc') }}</p>
          </div>
        </div>
      </div>

      <DialogFooter class="flex flex-col sm:flex-row gap-2 pt-2">
        <Button variant="outline" size="default" class="w-full sm:w-auto text-xs" @click="isOpen = false">
          {{ t('guest.modal.continueGuest') }}
        </Button>
        <Button 
          size="default" 
          class="w-full sm:flex-1 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-semibold shadow-md gap-2"
          @click="handleGoToLogin"
        >
          {{ t('guest.modal.loginBtn') }}
          <ArrowRight class="w-4 h-4" />
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
