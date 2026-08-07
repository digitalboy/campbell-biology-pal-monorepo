/**
 * @file [id].ts
 * @description Cloudflare Pages Edge Function，用于对 /questions/:id 动态拦截并注入 6 种语言的多语言题干 Meta 标签、JSON-LD Question Schema 与 hreflang 关联。
 * 
 * 备注 (经验教训):
 * 1. 多语言 Edge HTMLRewriter：解析 URL 的 lang 参数 (?lang=zh/en/es/fr/de/ja)，根据语言精准从数据库节点提取对应语言的题干与选项描述。
 * 2. 结构化数据 Schema.org：注入标准 Question Schema，并标注 acceptedAnswer 正确答案与 suggestedAnswer 选项数组，最大化提升 Google Rich Snippets 展示效果。
 * 3. Hreflang 注入：在 <head> 注入 6 种语言与 x-default 的 <link rel="alternate" hreflang="...">。
 */

interface Env {
  // Bindings if any
}

const SUPPORTED_LANGS = ['en', 'zh', 'es', 'fr', 'de', 'ja'];

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, params } = context;
  const questionId = params.id as string;
  const url = new URL(request.url);
  const reqLang = (url.searchParams.get('lang') || 'en').toLowerCase();
  const targetLang = SUPPORTED_LANGS.includes(reqLang) ? reqLang : 'en';

  const response = await context.next();

  if (!questionId) {
    return response;
  }

  try {
    const apiRes = await fetch(`https://api.biopal-campbell.beikee.org/api/v1/questions/${questionId}`);
    if (!apiRes.ok) {
      return response;
    }

    const json = await apiRes.json() as any;
    if (!json.ok || !json.data) {
      return response;
    }

    const q = json.data;
    // 提取对应语言的题干文本 (若无则依次降级至 en, zh)
    const questionText = q.question_text?.[targetLang] || q.question_text?.en || q.question_text?.zh || 'Campbell Biology Question';
    const pageNum = q.page_number || 1;

    // 格式化选项文本
    const optionsList = Array.isArray(q.options)
      ? q.options.map((opt: any) => {
          const optText = opt.text?.[targetLang] || opt.text?.en || opt.text?.zh || '';
          return { id: opt.id, text: optText };
        })
      : [];

    const optionsDescription = optionsList.map(o => `${o.id}: ${o.text}`).join('; ');
    const pageTitle = `[Campbell Biology P.${pageNum}] ${questionText.substring(0, 60)}${questionText.length > 60 ? '...' : ''}`;
    const pageDescription = `Practice Question (${targetLang.toUpperCase()}): ${questionText}. Options: ${optionsDescription}`;

    // 确定正确答案 (correct_answers 可能是包含 'A' 或 'C' 的数组)
    const correctAnsIds: string[] = Array.isArray(q.correct_answers) ? q.correct_answers : [];
    const acceptedAnswers = optionsList
      .filter(o => correctAnsIds.includes(o.id))
      .map(o => ({
        '@type': 'Answer',
        'text': `${o.id}: ${o.text}`,
      }));

    // 构建 JSON-LD Question Schema
    const jsonLdData: any = {
      '@context': 'https://schema.org/',
      '@type': 'Question',
      'name': questionText,
      'text': questionText,
      'inLanguage': targetLang,
      'educationalAlignment': 'Campbell Biology 12th Edition',
      'learningResourceType': 'Practice Problem',
      'suggestedAnswer': optionsList.map(o => ({
        '@type': 'Answer',
        'text': `${o.id}: ${o.text}`,
      })),
    };

    if (acceptedAnswers.length > 0) {
      jsonLdData.acceptedAnswer = acceptedAnswers.length === 1 ? acceptedAnswers[0] : acceptedAnswers;
    }

    const jsonLdScript = JSON.stringify(jsonLdData);

    // 构建 hreflang 关联标签
    const hreflangTags = SUPPORTED_LANGS.map(lang => {
      return `<link rel="alternate" hreflang="${lang}" href="https://biopal-campbell.beikee.org/questions/${questionId}?lang=${lang}" />`;
    });
    hreflangTags.push(`<link rel="alternate" hreflang="x-default" href="https://biopal-campbell.beikee.org/questions/${questionId}?lang=en" />`);

    return new HTMLRewriter()
      .on('html', {
        element(el) {
          el.setAttribute('lang', targetLang);
        },
      })
      .on('title', {
        element(el) {
          el.setInnerContent(pageTitle);
        },
      })
      .on('head', {
        element(el) {
          // 注入 Meta 标签
          el.append(`<meta name="description" content="${escapeAttr(pageDescription)}" />`, { html: true });
          el.append(`<meta property="og:title" content="${escapeAttr(pageTitle)}" />`, { html: true });
          el.append(`<meta property="og:description" content="${escapeAttr(pageDescription)}" />`, { html: true });
          el.append(`<meta property="og:type" content="article" />`, { html: true });
          el.append(`<meta property="og:image" content="https://biopal-campbell.beikee.org/logo.svg" />`, { html: true });

          // 注入 Hreflang 标签
          el.append(hreflangTags.join('\n'), { html: true });

          // 注入 JSON-LD Schema
          el.append(`<script type="application/ld+json">${jsonLdScript}</script>`, { html: true });
        },
      })
      .transform(response);
  } catch (error) {
    console.error(`Error in Edge Function for question ${questionId} (lang: ${targetLang}):`, error);
    return response;
  }
};

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
