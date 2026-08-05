
import { useI18n } from 'vue-i18n';
import promptMessages, { type Locale } from '@/prompts';

interface ContextData {
  type?: 'question' | 'node' | 'page' | string;
  [key: string]: any;
}

/**
 * A simple template string replacer
 * @param tpl template, e.g. "Hello, {name}"
 * @param data data object, e.g. { name: "World" }
 * @returns formatted string
 */
function format(tpl: string, data: Record<string, any>): string {
  if (!tpl) return '';
  return tpl.replace(/\{(\w+)\}/g, (match, key) => {
    return data.hasOwnProperty(key) ? data[key] : match;
  });
}

export function usePrompts() {
  const { locale, t } = useI18n();

  const getSystemPrompt = (contextData?: ContextData): string => {
    const currentLocale = locale.value as Locale;
    // Get all prompts for the current language, fallback to English
    const prompts = promptMessages[currentLocale] || promptMessages.en;

    let systemPrompt = prompts.system.base;

    if (contextData?.type && contextData.type in prompts.system.context) {
        const contextKey = contextData.type as keyof typeof prompts.system.context;
        const contextTemplate = prompts.system.context[contextKey];
        const definitionFallback = { nodeDefinition: t('common.notAvailable', 'N/A') };
        const mergedContextData = { ...definitionFallback, ...contextData };
        systemPrompt += format(contextTemplate, mergedContextData);
    }

    return systemPrompt;
  };

  return {
    getSystemPrompt,
  };
}
