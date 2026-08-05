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
        <Button variant="outline" size="sm">{{ t('header.login') }}</Button>
      </router-link>
    </template>
  </div>
</template>