<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import UserAvatarDropdown from './UserAvatarDropdown.vue';

const { t } = useI18n();
const authStore = useAuthStore();
</script>

<template>
  <div class="flex items-center">
    <template v-if="authStore.user">
      <UserAvatarDropdown />
    </template>
    <template v-else>
      <router-link to="/login">
        <Button class="bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium shadow-sm transition-all duration-200" size="sm">
          {{ t('guest.loginRegister') }}
        </Button>
      </router-link>
    </template>
  </div>
</template>