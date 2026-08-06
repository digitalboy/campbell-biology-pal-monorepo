<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { authService } from '@/services/authService';
import { useAuthStore } from '@/stores/authStore';
import LanguageSwitcher from '@/components/shared/LanguageSwitcher.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const router = useRouter();
const isLoading = computed(() => authStore.isLoading);
const heroRef = ref<HTMLElement>();

async function handleGoogleLogin() {
  try {
    await authService.signInWithGoogle();
    router.push('/');
  } catch (error) {
    console.error("Google sign-in failed:", error);
  }
}

// 统计数据
const stats = [
  { value: '200+', label: 'landing.stats.chapters' },
  { value: '1000+', label: 'landing.stats.questions' },
  { value: '24/7', label: 'landing.stats.ai_support' },
  { value: '6', label: 'landing.stats.languages' }
];

// 特性数据
const features = [
  {
    title: 'landing.features.one.title',
    description: 'landing.features.one.description',
    icon: '🧬',
    imgSrc: '/img/screenshots/feature-1.png',
    imgAlt: 'Knowledge Graph Screenshot',
    highlights: ['landing.features.one.highlight1', 'landing.features.one.highlight2']
  },
  {
    title: 'landing.features.two.title',
    description: 'landing.features.two.description',
    icon: '🤖',
    imgSrc: '/img/screenshots/feature-2.png',
    imgAlt: 'AI Chat Assistant Screenshot',
    highlights: ['landing.features.two.highlight1', 'landing.features.two.highlight2']
  },
  {
    title: 'landing.features.three.title',
    description: 'landing.features.three.description',
    icon: '📊',
    imgSrc: '/img/screenshots/feature-3.png',
    imgAlt: 'Learning Analytics Screenshot',
    highlights: ['landing.features.three.highlight1', 'landing.features.three.highlight2']
  },
];

// 用户评价
const testimonials = [
  {
    name: 'landing.testimonials.student1.name',
    role: 'landing.testimonials.student1.role',
    content: 'landing.testimonials.student1.content',
    avatar: '👩‍🎓'
  },
  {
    name: 'landing.testimonials.student2.name',
    role: 'landing.testimonials.student2.role',
    content: 'landing.testimonials.student2.content',
    avatar: '👨‍🔬'
  },
  {
    name: 'landing.testimonials.student3.name',
    role: 'landing.testimonials.student3.role',
    content: 'landing.testimonials.student3.content',
    avatar: '👩‍⚕️'
  }
];

// 视差滚动与 Google One Tap 初始化
onMounted(() => {
  if (!authStore.isLoggedIn) {
    authService.initGoogleOneTap();
  }

  const handleScroll = () => {
    if (heroRef.value) {
      const scrolled = window.scrollY;
      const rate = scrolled * -0.5;
      heroRef.value.style.transform = `translateY(${rate}px)`;
    }
  };

  window.addEventListener('scroll', handleScroll);
  return () => window.removeEventListener('scroll', handleScroll);
});
</script>

<template>
  <div class="min-h-screen bg-background text-foreground overflow-x-hidden">
    <!-- Floating background elements -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <div class="absolute top-20 left-10 w-32 h-32 bg-primary/5 rounded-full blur-3xl animate-pulse"></div>
      <div class="absolute top-40 right-20 w-48 h-48 bg-biology-primary/10 rounded-full blur-2xl animate-pulse"
        style="animation-delay: 1s"></div>
      <div class="absolute bottom-20 left-1/4 w-24 h-24 bg-success/10 rounded-full blur-xl animate-pulse"
        style="animation-delay: 2s"></div>
    </div>

    <!-- Header -->
    <header class="relative z-50 p-4 flex justify-between items-center container mx-auto backdrop-blur-sm">
      <div class="flex items-center gap-3">
        <div class="relative">
          <img src="/logo.svg" alt="BioPal Logo" class="h-10 w-10 drop-shadow-lg" />
          <div class="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full animate-ping"></div>
        </div>
        <div>
          <span
            class="text-2xl font-bold bg-gradient-to-r from-primary to-biology-primary bg-clip-text text-transparent font-sans">
            BioPal
          </span>
          <Badge variant="secondary" class="ml-2 text-xs">v2.0</Badge>
        </div>
      </div>
      <LanguageSwitcher />
    </header>

    <!-- Hero Section -->
    <main class="relative">
      <div ref="heroRef" class="container mx-auto px-4 py-5 sm:py-12 text-center">
        <!-- Main Headline -->
        <div class="space-y-8 mb-12">
          <Badge variant="outline" class="mb-4 bg-primary/10 border-primary/20 text-primary">
            {{ t('landing.hero.badge') }}
          </Badge>

          <h1 class="text-5xl sm:text-6xl md:text-7xl font-extrabold tracking-tight font-sans">
            <span class="bg-gradient-to-r from-foreground via-primary to-biology-primary bg-clip-text text-transparent">
              {{ t('landing.hero.title') }}
            </span>
          </h1>

          <p class="max-w-4xl mx-auto text-xl sm:text-2xl text-muted-foreground leading-relaxed font-sans">
            {{ t('landing.hero.subtitle') }}
          </p>
        </div>

        <!-- CTA Section -->
        <div class="space-y-8">
          <div class="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button @click="handleGoogleLogin" :disabled="isLoading" size="lg"
              class="text-sm px-8 py-6 bg-gradient-to-r from-primary to-biology-primary hover:from-primary/90 hover:to-biology-primary/90 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl font-sans">
              <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span v-if="isLoading">{{ t('login.signing_in') }}</span>
              <span v-else>{{ t('landing.hero.cta') }}</span>
            </Button>

            
          </div>

          <!-- Stats -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto mt-16">
            <div v-for="stat in stats" :key="stat.label" class="text-center">
              <div class="text-3xl font-bold text-primary mb-2 font-sans">{{ stat.value }}</div>
              <div class="text-sm text-muted-foreground font-sans">{{ t(stat.label) }}</div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Features Section -->
    <section class="bg-muted/30 py-24 sm:py-32 relative">
      <div class="container mx-auto px-4">
        <div class="text-center mb-20">
          <Badge variant="outline" class="mb-4">{{ t('landing.features.badge') }}</Badge>
          <h2 class="text-4xl sm:text-5xl font-bold mb-6 font-sans">{{ t('landing.features.title') }}</h2>
          <p class="text-xl text-muted-foreground max-w-2xl mx-auto font-sans">{{ t('landing.features.subtitle') }}</p>
        </div>

        <div class="space-y-32">
          <div v-for="(feature, index) in features" :key="index"
            class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <!-- Text Content -->
            <div :class="['space-y-8', { 'lg:order-last': index % 2 === 1 }]">
              <div class="inline-flex items-center gap-3 p-3 bg-primary/10 rounded-xl">
                <span class="text-3xl">{{ feature.icon }}</span>
                <Badge variant="secondary">{{ t('landing.features.new') }}</Badge>
              </div>

              <h3 class="text-4xl font-bold tracking-tight font-sans">{{ t(feature.title) }}</h3>

              <p class="text-xl text-muted-foreground leading-relaxed font-sans">
                {{ t(feature.description) }}
              </p>

              <ul class="space-y-3">
                <li v-for="highlight in feature.highlights" :key="highlight" class="flex items-center gap-3">
                  <div class="w-2 h-2 bg-primary rounded-full"></div>
                  <span class="text-muted-foreground font-sans">{{ t(highlight) }}</span>
                </li>
              </ul>
            </div>

            <!-- Screenshot -->
            <div :class="['relative', { 'lg:order-first': index % 2 === 1 }]">
              <div
                class="bg-gradient-to-br from-card via-card to-muted p-4 rounded-2xl shadow-2xl border transform hover:scale-105 transition-all duration-500 group">
                <div
                  class="aspect-[16/10] bg-gradient-to-br from-muted to-background rounded-xl overflow-hidden relative">
                  <!-- Mock browser chrome -->
                  <div
                    class="absolute top-0 left-0 right-0 h-8 bg-neutral-100 dark:bg-neutral-800 flex items-center px-4 z-10">
                    <div class="flex gap-2">
                      <div class="w-3 h-3 bg-red-400 rounded-full"></div>
                      <div class="w-3 h-3 bg-yellow-400 rounded-full"></div>
                      <div class="w-3 h-3 bg-green-400 rounded-full"></div>
                    </div>
                  </div>

                  <!-- Screenshot Image -->
                  <div class="relative h-full pt-8">
                    <img :src="feature.imgSrc" :alt="feature.imgAlt || t(feature.title)"
                      class="w-full h-full object-cover object-top rounded-b-xl transition-transform duration-500 group-hover:scale-105"
                      loading="lazy" />

                    <!-- Overlay for better visual effect -->
                    <div
                      class="absolute inset-0 bg-gradient-to-t from-background/20 via-transparent to-transparent rounded-b-xl">
                    </div>
                  </div>
                </div>
              </div>

              <!-- Floating elements -->
              <div class="absolute -top-4 -right-4 w-8 h-8 bg-primary/20 rounded-full blur-sm animate-pulse"></div>
              <div class="absolute -bottom-6 -left-6 w-12 h-12 bg-success/20 rounded-full blur-md animate-pulse"
                style="animation-delay: 1s"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Testimonials Section -->
    <section class="py-24 sm:py-32">
      <div class="container mx-auto px-4">
        <div class="text-center mb-20">
          <Badge variant="outline" class="mb-4">{{ t('landing.testimonials.badge') }}</Badge>
          <h2 class="text-4xl sm:text-5xl font-bold mb-6 font-sans">{{ t('landing.testimonials.title') }}</h2>
          <p class="text-xl text-muted-foreground font-sans">{{ t('landing.testimonials.subtitle') }}</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div v-for="testimonial in testimonials" :key="testimonial.name"
            class="bg-card p-8 rounded-2xl border shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
            <div class="flex items-center gap-4 mb-6">
              <div class="text-4xl">{{ testimonial.avatar }}</div>
              <div>
                <div class="font-semibold font-sans">{{ t(testimonial.name) }}</div>
                <div class="text-sm text-muted-foreground font-sans">{{ t(testimonial.role) }}</div>
              </div>
            </div>
            <p class="text-muted-foreground italic leading-relaxed font-sans">
              "{{ t(testimonial.content) }}"
            </p>
            <div class="flex gap-1 mt-4">
              <span v-for="i in 5" :key="i" class="text-yellow-400">★</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="bg-gradient-to-r from-primary/10 via-biology-primary/10 to-success/10 py-20">
      <div class="container mx-auto px-4 text-center">
        <h2 class="text-4xl sm:text-5xl font-bold mb-6 font-sans">{{ t('landing.cta.title') }}</h2>
        <p class="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto font-sans">{{ t('landing.cta.subtitle') }}</p>

        <Button @click="handleGoogleLogin" :disabled="isLoading" size="lg"
          class="text-lg px-12 py-6 bg-gradient-to-r from-primary to-biology-primary hover:from-primary/90 hover:to-biology-primary/90 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl font-sans">
          <span v-if="isLoading">{{ t('login.signing_in') }}</span>
          <span v-else>{{ t('landing.cta.button') }}</span>
        </Button>
      </div>
    </section>

    <!-- Footer -->
    <footer class="py-12 border-t bg-card/50">
      <div class="container mx-auto px-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <!-- Brand -->
          <div class="space-y-4">
            <div class="flex items-center gap-2">
              <img src="/logo.svg" alt="BioPal Logo" class="h-8 w-8" />
              <span class="text-xl font-bold font-sans">BioPal</span>
            </div>
            <p class="text-muted-foreground text-sm font-sans">{{ t('landing.footer.description') }}</p>
          </div>


          
        </div>

        <div class="border-t pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p class="text-sm text-muted-foreground font-sans">
            &copy; {{ new Date().getFullYear() }} BioPal. {{ t('landing.footer.rights') }}
          </p>
          <div class="flex gap-4">
            <!-- Social media links would go here -->
            <span class="text-sm text-muted-foreground font-sans">{{ t('landing.footer.version') }} 2.0.0</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
@keyframes float {

  0%,
  100% {
    transform: translateY(0px);
  }

  50% {
    transform: translateY(-20px);
  }
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

.animate-float-delayed {
  animation: float 6s ease-in-out infinite 2s;
}

/* Gradient text animation */
@keyframes gradient {

  0%,
  100% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }
}

.animate-gradient {
  background-size: 200% 200%;
  animation: gradient 4s ease infinite;
}

/* 确保中文字体一致性 */
.font-sans {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}
</style>