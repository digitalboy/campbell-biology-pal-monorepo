import { defineStore } from 'pinia';
import { useAppColorMode } from '@/composables/useColorMode';

export const useUiStore = defineStore('ui', () => {
  const { mode } = useAppColorMode();

  return {
    theme: mode,
  };
});
