import { useColorMode } from '@vueuse/core';

export function useAppColorMode() {
  const mode = useColorMode({
    selector: 'html',
    attribute: 'class',
    emitAuto: true,
    modes: {
      dark: 'dark',
      light: 'light',
    },
  });

  return {
    mode,
  };
}
