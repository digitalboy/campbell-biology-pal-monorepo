<template>
  <div class="flex flex-col h-full bg-background text-foreground">
    <GlobalHeader />

    <main class="flex flex-col grow overflow-hidden bg-muted/10">
      <div v-if="authStore.isLoading && !authStore.isAuthInitialized" class="flex grow items-center justify-center">
        <LoadingIndicator />
      </div>
      <router-view v-else />
    </main>
    
    <Toaster rich-colors position="bottom-left" />
  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/authStore';
import GlobalHeader from '@/components/shared/GlobalHeader.vue';
import { Toaster } from '@/components/ui/sonner';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';

const authStore = useAuthStore();
const { t } = useI18n();

watchEffect(() => {
  document.title = t('meta.title');
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute('content', t('meta.description'));
  }
});
</script>
