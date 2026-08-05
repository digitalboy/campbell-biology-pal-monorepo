import { createI18n } from 'vue-i18n';
import messages from './locales'; // Import aggregated messages

const i18n = createI18n({
  legacy: false, // Use Composition API
  locale: 'en', // Default locale, will be updated on client-side
  fallbackLocale: 'en', // Fallback locale
  messages, // Use the aggregated messages
  globalInjection: true,
});

export default i18n;