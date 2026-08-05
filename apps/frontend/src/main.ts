/**
 * @file main.ts
 * @description 前端 Vue 3 应用入口文件。
 * 
 * 备注 (经验教训):
 * 1. 自动执行 `conceptDictionary.initDictionary()` 预加载 D1 数据库 3,212 个节点的知识词汇。
 * 2. 静态资源 hash 过期自动刷新监听器，彻底消除旧版本 Hash 带来的 MIME 报错。
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useAuthStore } from './stores/authStore';
import { createI18n } from 'vue-i18n';
import messages from './locales';
import { createHead } from '@vueuse/head';
import { conceptDictionary } from './services/conceptDictionary';

import './styles/main.css';

// 全局捕获版本部署更新导致的动态 Chunk 加载失败并自动刷新
window.addEventListener('error', (e) => {
  if (
    e.message &&
    (e.message.includes('Failed to fetch dynamically imported module') ||
      e.message.includes('Importing a module script failed') ||
      e.message.includes('text/html'))
  ) {
    const hasReloaded = sessionStorage.getItem('chunk_reload');
    if (!hasReloaded) {
      sessionStorage.setItem('chunk_reload', 'true');
      console.warn('New deployment detected, reloading page for fresh assets...');
      window.location.reload();
    }
  }
});

const app = createApp(App);
const pinia = createPinia();
const head = createHead();

app.use(pinia);
app.use(router);
app.use(head);

const i18n = createI18n({
  locale: localStorage.getItem('i18n_lang') || navigator.language.slice(0, 2) || 'en',
  fallbackLocale: 'en',
  messages,
  legacy: false,
  globalInjection: true,
});

app.use(i18n);

// 异步静默初始化 3,212 个知识节点的词典匹配库
conceptDictionary.initDictionary();

const authStore = useAuthStore();
authStore.initializeAuthListener();

app.mount('#app');