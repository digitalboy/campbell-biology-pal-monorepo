<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/authStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const { t } = useI18n();
const authStore = useAuthStore();
const user = computed(() => authStore.user);

// console.log('UserAvatarDropdown: user computed property:', user.value);

function handleLogout() {
  authStore.logout();
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" class="relative h-8 flex items-center justify-center space-x-2 px-2">
        <Avatar class="h-8 w-8 border">
          <AvatarImage :src="user?.avatar_url || ''" :alt="user?.nickname" />
          <AvatarFallback>{{ user?.nickname?.[0] || '' }}</AvatarFallback>
        </Avatar>
        <!-- <span class="font-medium">{{ user?.nickname }}</span> -->
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="w-56" align="end">
      <DropdownMenuLabel class="font-normal">
        <div class="flex flex-col space-y-1">
          <p class="text-sm font-medium leading-none">{{ user?.nickname }}</p>
          <p class="text-xs leading-none">
            {{ user?.email }}
          </p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="handleLogout">
        {{ t('header.logout') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
