## What's New
The CLI can now initialize projects with Tailwind v4.
Full support for the new @theme directive and @theme inline option.
All components are updated for Tailwind v4.
Every primitive now has a data-slot attribute for styling.
We've fixed and cleaned up the style of the components.
We're deprecating the toast component in favor of sonner.
Buttons now use the default cursor.
We're deprecating the default style. New projects will use new-york.
HSL colors are now converted to OKLCH.


## Dark mode

npm install @vueuse/core


Add a mode toggle
Place a mode toggle on your site to toggle between light and dark mode.

We're using useColorMode from @vueuse/core.

Reactive color mode (dark / light / customs) with auto data persistence.

```vue
<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useColorMode } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Pass { disableTransition: false } to enable transitions
const mode = useColorMode()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline">
        <Icon icon="radix-icons:moon" class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Icon icon="radix-icons:sun" class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span class="sr-only">Toggle theme</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @click="mode = 'light'">
        Light
      </DropdownMenuItem>
      <DropdownMenuItem @click="mode = 'dark'">
        Dark
      </DropdownMenuItem>
      <DropdownMenuItem @click="mode = 'auto'">
        System
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
```