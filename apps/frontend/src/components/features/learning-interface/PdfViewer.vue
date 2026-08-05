<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { ref, watch, onMounted, onUnmounted } from 'vue';
import VuePdfEmbed from 'vue-pdf-embed';
import { Button } from '@/components/ui/button';
import LoadingIndicator from '@/components/shared/LoadingIndicator.vue';
import { MessageCirclePlus, CircleArrowLeft, CircleArrowRight, ZoomIn, ZoomOut, RotateCcw } from 'lucide-vue-next';
import {
  NumberField,
  NumberFieldInput,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
} from '@/components/ui/number-field';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import DiscussionPanel from '@/components/features/learning-interface/CommentPanel.vue';
import 'vue-pdf-embed/dist/styles/annotationLayer.css'
import 'vue-pdf-embed/dist/styles/textLayer.css'

const props = defineProps({
  pageNumber: {
    type: Number,
    required: true,
  },
  pdfUrl: {
    type: String,
    default: null,
  },
  totalPages: {
    type: Number,
    default: 1,
  }
});

const emit = defineEmits(['update:pageNumber']);

const { t } = useI18n();

const isLoading = ref(true);
const pdfWidth = ref(0);
const initialPdfWidth = ref(0);
const zoomStep = 100;
const bookContainer = ref<HTMLElement | null>(null);

// Panning state
const isPanning = ref(false);
const isPanModeActive = ref(false);
const lastPanPosition = ref({ x: 0, y: 0 });

const handleKeyDown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  // Do not prevent default if an input, textarea, or select is focused
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) {
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    isPanModeActive.value = true;
  }
};

const handleKeyUp = (e: KeyboardEvent) => {
  if (e.code === 'Space') {
    e.preventDefault();
    isPanModeActive.value = false;
    endPan();
  }
};



onMounted(() => {
  if (bookContainer.value) {
    const containerWidth = bookContainer.value.clientWidth;
    pdfWidth.value = containerWidth;
    initialPdfWidth.value = containerWidth;

    toast.info(t('pdfViewer.pan.toastMessage'), {
      duration: 5000,
      dismissible: true,
    });
  }
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
});

watch(() => props.pdfUrl, (newUrl) => {
  if (newUrl) {
    isLoading.value = true;
  }
}, { immediate: true });

// Watch for pageNumber changes to immediately show loading indicator
watch(() => props.pageNumber, (newPage, oldPage) => {
  if (newPage !== oldPage) {
    isLoading.value = true;
  }
});

function onPdfRendered() {
  isLoading.value = false;
}

function onRenderingFailed(error: any) {
  console.error("PDF rendering failed for URL:", props.pdfUrl, error);
  isLoading.value = false;
}

const currentPageInput = ref(props.pageNumber);

watch(() => props.pageNumber, (newPage) => {
  currentPageInput.value = newPage;
});

function handlePageChange(value: number) {
  emit('update:pageNumber', value);
}

function previousPage() {
  if (props.pageNumber > 1) {
    emit('update:pageNumber', props.pageNumber - 1);
  }
}

function nextPage() {
  if (props.pageNumber < props.totalPages) {
    emit('update:pageNumber', props.pageNumber + 1);
  }
}

function zoomIn() {
  pdfWidth.value += zoomStep;
}

function zoomOut() {
  if (pdfWidth.value > zoomStep) {
    pdfWidth.value -= zoomStep;
  }
}

function resetWidth() {
  pdfWidth.value = initialPdfWidth.value;
}

function startPan(e: MouseEvent) {
  if (!isPanModeActive.value || !bookContainer.value) return;
  e.preventDefault();
  isPanning.value = true;
  lastPanPosition.value = { x: e.clientX, y: e.clientY };
  bookContainer.value.style.userSelect = 'none';
}

function pan(e: MouseEvent) {
  if (!isPanning.value || !bookContainer.value) return;
  e.preventDefault();
  const dx = e.clientX - lastPanPosition.value.x;
  const dy = e.clientY - lastPanPosition.value.y;
  bookContainer.value.scrollLeft -= dx;
  bookContainer.value.scrollTop -= dy;
  lastPanPosition.value = { x: e.clientX, y: e.clientY };
}

function endPan() {
  if (!bookContainer.value) return;
  isPanning.value = false;
  bookContainer.value.style.userSelect = 'auto';
}

</script>

<template>
  <section
    class="bg-card text-card-foreground rounded-2xl shadow-lg flex flex-col relative h-full overflow-hidden group">
    <!-- Header -->
    <div class="p-4 border-b flex-shrink-0 flex items-center justify-between">
      <NumberField
        v-model="currentPageInput"
        :min="1"
        :max="totalPages"
        @update:model-value="handlePageChange"
      >
        <NumberFieldContent>
          <NumberFieldDecrement />
          <NumberFieldInput />
          <NumberFieldIncrement />
        </NumberFieldContent>
      </NumberField>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="icon" @click="zoomOut" :title="$t('pdfViewer.zoom.out')">
          <ZoomOut class="w-5 h-5" />
        </Button>
        <span class="text-sm font-medium w-16 text-center">{{ pdfWidth }}px</span>
        <Button variant="outline" size="icon" @click="zoomIn" :title="$t('pdfViewer.zoom.in')">
          <ZoomIn class="w-5 h-5" />
        </Button>
        <Button variant="outline" size="icon" @click="resetWidth" :title="$t('pdfViewer.zoom.reset')">
          <RotateCcw class="w-5 h-5" />
        </Button>
      </div>
    </div>

    <!-- PDF Container -->
    <div 
      id="book-container" 
      ref="bookContainer" 
      class="flex-grow relative overflow-auto"
      :class="{
        'cursor-grab': isPanModeActive && !isPanning,
        'cursor-grabbing': isPanModeActive && isPanning,
      }"
      @mousedown="startPan"
      @mousemove="pan"
      @mouseup="endPan"
      @mouseleave="endPan"
    >
      <div v-if="!pdfUrl" class="w-full h-full flex justify-center items-center text-slate-400">
        <p>{{ $t('pdfViewer.waitingForPdf') }}</p>
      </div>
      <template v-else>
        <!-- Loading Overlay -->
        <div v-if="isLoading" class="absolute inset-0 flex justify-center items-center bg-slate-50/80 z-10">
          <LoadingIndicator />
        </div>

        <VuePdfEmbed v-if="pdfWidth > 0" annotation-layer text-layer :key="pdfUrl" :source="pdfUrl" :page="1" :width="pdfWidth" @rendered="onPdfRendered"
          @rendering-failed="onRenderingFailed"  />

      </template>
    </div>

    <!-- Navigation Buttons -->
    <div class="absolute inset-y-0 left-0 right-0 flex items-center justify-between pl-4 pr-8 pointer-events-none">
      <!-- 
    1. 添加 size="icon"
    2. 将图标尺寸从 w-8 h-8 增大到 w-9 h-9 (您可以根据视觉效果微调)
  -->
      <Button @click="previousPage" :disabled="pageNumber <= 1" size="icon"
        class="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full  shadow-lg">
        <CircleArrowLeft class="w-9 h-9" />
      </Button>

      <Button @click="nextPage" :disabled="pageNumber >= totalPages" size="icon"
        class="pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-full  shadow-lg">
        <CircleArrowRight class="w-9 h-9" />
      </Button>
    </div>

    <!-- Floating Comment Button -->
    <Sheet>
      <SheetTrigger as-child>
        <Button variant="default" size="icon" class="absolute bottom-6 left-4 rounded-full shadow-lg">
          <MessageCirclePlus class="w-6 h-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" class="w-full sm:max-w-lg p-0"> 
        <SheetHeader class="p-6 pb-0 mb-0">
          <SheetTitle>{{ $t('pdfViewer.sheet.title') }}</SheetTitle>
          <SheetDescription>{{ $t('pdfViewer.sheet.description') }}</SheetDescription>
        </SheetHeader>
        <ScrollArea class="h-[calc(100vh-6rem)] p-6">
          <DiscussionPanel anchor-type="page" :anchor-id="String(pageNumber)" />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  </section>
</template>