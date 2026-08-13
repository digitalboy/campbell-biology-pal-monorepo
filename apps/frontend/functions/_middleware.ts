// 声明 Cloudflare Edge 运行时环境内联类型（解决前端 IDE TS 检查缺失 @cloudflare/workers-types 的问题）
type PagesFunction<Env = any> = (context: {
  request: Request;
  params: Record<string, string | string[]>;
  next: () => Promise<Response>;
  env: Env;
}) => Promise<Response>;

declare class HTMLRewriter {
  on(selector: string, handlers: { element?: (el: any) => void }): HTMLRewriter;
  transform(response: Response): Response;
}

/**
 * @file _middleware.ts
 * @description Cloudflare Pages Edge 全局中间件，用于为根路径 ?page=X 及动态题目页 /questions/:id 进行 Edge SSR 预渲染与元数据注入。
 * 
 * 备注 (经验教训与架构规范):
 * 1. 静态资源优先级隐患 (Static File Precedence): Cloudflare Pages 默认将 dist/index.html 视作静态文件，
 *    优先级高于普通的 Pages Functions (如 functions/index.ts)。改用 functions/_middleware.ts 全局中间件，可强行拦截静态分发！
 * 2. 多路由 Edge SSR 架构：支持拦截 ?page=X 与 /questions/:id 两个核心入口。其它无匹配请求（如静态 CSS/JS）瞬间 context.next() 穿透。
 * 3. 破解 Google SPA“内容真空” (PRERENDER_PRAGMA): 在 <div id="app"> 节点内 append 隐藏的预渲染 DOM 片段 (<div id="seo-prerender-content">)，
 *    使 Googlebot 在第一轮初刷（无须等待二级 JS 渲染）即可索引到全量的题干与知识点正文，解决薄内容/Duplicate content 拒收问题。
 * 4. Canonical 与 Hreflang 的语言变体同步防线：带有 ?lang=xx 语言参数时，Canonical 必须与 Hreflang 的 href 保持一致，彻底防止 GSC 标记为重复页面。
 * 5. 时间与格式规范：遵循 ISO 8601 标准 (如 2026-03-13T14:11:00.000Z)。
 */

interface Env {
  // Bindings if any
}

const SUPPORTED_LANGS = ['en', 'zh', 'es', 'fr', 'de', 'ja'];
const TOTAL_BOOK_PAGES = 1488;
const SITE_BASE_URL = 'https://biopal-campbell.beikee.org';

const LANG_TEXTS: Record<string, { titlePrefix: string; descPrefix: string; defaultSummary: string }> = {
  en: {
    titlePrefix: 'Campbell Biology Page',
    descPrefix: 'Interactive Study Guide & Companion for Campbell Biology 12th Edition Page',
    defaultSummary: 'Explore interactive knowledge graphs, practice questions, and study notes for Campbell Biology 12th Edition.',
  },
  zh: {
    titlePrefix: '坎贝尔生物学 第',
    descPrefix: '《坎贝尔生物学》（第12版）第',
    defaultSummary: '探索交互式知识图谱、配套练习题及精讲笔记，轻松掌握生物学核心概念。',
  },
  es: {
    titlePrefix: 'Campbell Biología Página',
    descPrefix: 'Guía de estudio interactiva para Campbell Biología 12.ª Edición Página',
    defaultSummary: 'Explore grafos de conocimiento interactivos, preguntas de práctica y notas de estudio.',
  },
  fr: {
    titlePrefix: 'Campbell Biologie Page',
    descPrefix: 'Guide d\'étude interactif pour Campbell Biologie 12e Édition Page',
    defaultSummary: 'Explorez des graphes de connaissances interactifs, des questions d\'entraînement et des notes de cours.',
  },
  de: {
    titlePrefix: 'Campbell Biologie Seite',
    descPrefix: 'Interaktiver Lernleiter für Campbell Biologie 12. Auflage Seite',
    defaultSummary: 'Erkunden Sie interaktive Wissensgraphen, Übungsaufgaben und Lernnotizen.',
  },
  ja: {
    titlePrefix: 'キャンベル生物学 第',
    descPrefix: '『キャンベル生物学 原書第12版』第',
    defaultSummary: 'インタラクティブな知識グラフ、練習問題、解説ノートで生物学の重要概念を効率的に学習。',
  },
};

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const url = new URL(request.url);

  const isRootPath = url.pathname === '/' || url.pathname === '/index.html';
  const rawPage = url.searchParams.get('page');
  const isQuestionPath = url.pathname.startsWith('/questions/');
  const questionId = isQuestionPath ? url.pathname.split('/questions/')[1]?.split('/')[0]?.split('?')[0] : null;

  // 1. 若既不是 ?page=X 路由，也不是 /questions/:id 路由，则快速穿透
  const isPageMatch = isRootPath && rawPage && !isNaN(parseInt(rawPage, 10)) && parseInt(rawPage, 10) >= 1 && parseInt(rawPage, 10) <= TOTAL_BOOK_PAGES;
  const isQuestionMatch = isQuestionPath && Boolean(questionId);

  if (!isPageMatch && !isQuestionMatch) {
    return context.next();
  }

  // 提取语言参数
  const reqLang = (url.searchParams.get('lang') || 'en').toLowerCase();
  const targetLang = SUPPORTED_LANGS.includes(reqLang) ? reqLang : 'en';

  const response = await context.next();

  try {
    // 分支 A: 处理题目详情页 Edge SSR (/questions/:id)
    if (isQuestionMatch && questionId) {
      return await handleQuestionSsr(response, questionId, targetLang, url);
    }

    // 分支 B: 处理教科书页码 Edge SSR (/?page=X)
    if (isPageMatch && rawPage) {
      const pageNum = parseInt(rawPage, 10);
      return await handleBookPageSsr(response, pageNum, targetLang, url);
    }

    return response;
  } catch (error) {
    console.error(`[Edge Middleware SSR Error] ${url.pathname}:`, error);
    return response;
  }
};

/**
 * 处理题目详情页的 Edge SSR 预渲染与元数据注入
 */
async function handleQuestionSsr(response: Response, questionId: string, targetLang: string, url: URL): Promise<Response> {
  let stemText = 'Practice Question';
  let explanationText = '';
  let optionsText = '';

  try {
    const apiRes = await fetch(`https://api.biopal-campbell.beikee.org/api/v1/questions/${questionId}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as any);

    if (apiRes.ok) {
      const json = (await apiRes.json()) as any;
      if (json.ok && json.data) {
        const q = json.data;
        if (q.stem) {
          stemText = q.stem.replace(/[#*`_~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
        }
        if (q.explanation) {
          explanationText = q.explanation.replace(/[#*`_~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
        }
        if (Array.isArray(q.options)) {
          optionsText = q.options.join('; ');
        }
      }
    }
  } catch (err) {
    console.warn(`[Edge Question SSR] Failed to fetch question ${questionId}:`, err);
  }

  const shortStem = stemText.length > 70 ? `${stemText.substring(0, 67)}...` : stemText;
  const pageTitle = `[Biology Question] ${shortStem} | Campbell Biology`;
  const descRaw = explanationText ? `${stemText} - ${explanationText}` : `${stemText}. Options: ${optionsText}`;
  const pageDescription = descRaw.length > 160 ? `${descRaw.substring(0, 157)}...` : descRaw;

  const basePath = `/questions/${questionId}`;
  const canonicalUrl = `${SITE_BASE_URL}${basePath}${targetLang !== 'en' ? `?lang=${targetLang}` : ''}`;

  const hreflangTags = SUPPORTED_LANGS.map((lang) => {
    return `<link rel="alternate" hreflang="${lang}" href="${escapeAttr(`${SITE_BASE_URL}${basePath}?lang=${lang}`)}" />`;
  });
  hreflangTags.push(
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(`${SITE_BASE_URL}${basePath}?lang=en`)}" />`
  );

  const jsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'Quiz',
    'name': pageTitle,
    'description': pageDescription,
    'url': canonicalUrl,
    'inLanguage': targetLang,
    'hasPart': {
      '@type': 'Question',
      'name': shortStem,
      'text': stemText,
      'suggestedAnswer': optionsText,
    },
  };

  const jsonLdScript = JSON.stringify(jsonLdData);
  const prerenderDomSnippet = `<div id="seo-prerender-content" style="display:none;" aria-hidden="true">` +
    `<h1>${escapeAttr(stemText)}</h1>` +
    `${explanationText ? `<p>${escapeAttr(explanationText)}</p>` : ''}` +
    `<p>Campbell Biology 12th Edition Interactive Practice - Question ID: ${escapeAttr(questionId)}</p>` +
    `</div>`;

  return new HTMLRewriter()
    .on('html', {
      element(el: any) {
        el.setAttribute('lang', targetLang);
      },
    })
    .on('title', {
      element(el: any) {
        el.setInnerContent(pageTitle);
      },
    })
    .on('head', {
      element(el: any) {
        el.append(`<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`, { html: true });
        el.append(`<meta name="description" content="${escapeAttr(pageDescription)}" />`, { html: true });
        el.append(`<meta property="og:title" content="${escapeAttr(pageTitle)}" />`, { html: true });
        el.append(`<meta property="og:description" content="${escapeAttr(pageDescription)}" />`, { html: true });
        el.append(`<meta property="og:type" content="article" />`, { html: true });
        el.append(`<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`, { html: true });
        el.append(`<meta property="og:image" content="${SITE_BASE_URL}/logo.svg" />`, { html: true });
        el.append(hreflangTags.join('\n'), { html: true });
        el.append(`<script type="application/ld+json">${jsonLdScript}</script>`, { html: true });
      },
    })
    .on('div#app', {
      element(el: any) {
        el.append(prerenderDomSnippet, { html: true });
      },
    })
    .transform(response);
}

/**
 * 处理教科书页码的 Edge SSR 预渲染与元数据注入
 */
async function handleBookPageSsr(response: Response, pageNum: number, targetLang: string, url: URL): Promise<Response> {
  const langConfig = LANG_TEXTS[targetLang] || LANG_TEXTS.en;
  let customSummary = '';

  try {
    const apiRes = await fetch(`https://api.biopal-campbell.beikee.org/api/v1/pdf-content/${pageNum}`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    } as any);
    if (apiRes.ok) {
      const json = (await apiRes.json()) as any;
      if (json.ok && json.data?.markdown_text) {
        const cleanText = json.data.markdown_text
          .replace(/[#*`_~\[\]()]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanText.length > 20) {
          customSummary = cleanText.substring(0, 160);
        }
      }
    }
  } catch (apiErr) {
    console.warn(`[Edge Middleware SSR] Failed to fetch backend content for page ${pageNum}:`, apiErr);
  }

  const isZhOrJa = targetLang === 'zh' || targetLang === 'ja';
  const pageTitle = isZhOrJa
    ? `[${langConfig.titlePrefix}${pageNum}页] Campbell Biology 12th Edition`
    : `[${langConfig.titlePrefix} ${pageNum}] Campbell Biology 12th Edition`;

  const summaryContent = customSummary || langConfig.defaultSummary;
  const pageDescription = isZhOrJa
    ? `${langConfig.descPrefix}${pageNum}页学习指南：${summaryContent}`
    : `${langConfig.descPrefix} ${pageNum}: ${summaryContent}`;

  const basePath = `/?page=${pageNum}`;
  const canonicalUrl = `${SITE_BASE_URL}${basePath}${targetLang !== 'en' ? `&lang=${targetLang}` : ''}`;

  const hreflangTags = SUPPORTED_LANGS.map((lang) => {
    return `<link rel="alternate" hreflang="${lang}" href="${escapeAttr(`${SITE_BASE_URL}${basePath}&lang=${lang}`)}" />`;
  });
  hreflangTags.push(
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(`${SITE_BASE_URL}${basePath}&lang=en`)}" />`
  );

  const jsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': pageTitle,
    'description': pageDescription,
    'url': canonicalUrl,
    'inLanguage': targetLang,
    'isPartOf': {
      '@type': 'Book',
      'name': 'Campbell Biology 12th Edition',
      'isbn': '9780135188743',
    },
    'mainEntity': {
      '@type': 'LearningResource',
      'learningResourceType': 'Textbook Page',
      'educationalAlignment': 'Campbell Biology 12th Edition',
      'name': `Page ${pageNum}`,
    },
  };

  const jsonLdScript = JSON.stringify(jsonLdData);
  const prerenderDomSnippet = `<div id="seo-prerender-content" style="display:none;" aria-hidden="true">` +
    `<h1>${escapeAttr(pageTitle)}</h1>` +
    `<p>${escapeAttr(summaryContent)}</p>` +
    `</div>`;

  return new HTMLRewriter()
    .on('html', {
      element(el: any) {
        el.setAttribute('lang', targetLang);
      },
    })
    .on('title', {
      element(el: any) {
        el.setInnerContent(pageTitle);
      },
    })
    .on('head', {
      element(el: any) {
        el.append(`<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`, { html: true });
        el.append(`<meta name="description" content="${escapeAttr(pageDescription)}" />`, { html: true });
        el.append(`<meta property="og:title" content="${escapeAttr(pageTitle)}" />`, { html: true });
        el.append(`<meta property="og:description" content="${escapeAttr(pageDescription)}" />`, { html: true });
        el.append(`<meta property="og:type" content="article" />`, { html: true });
        el.append(`<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`, { html: true });
        el.append(`<meta property="og:image" content="${SITE_BASE_URL}/logo.svg" />`, { html: true });
        el.append(hreflangTags.join('\n'), { html: true });
        el.append(`<script type="application/ld+json">${jsonLdScript}</script>`, { html: true });
      },
    })
    .on('div#app', {
      element(el: any) {
        el.append(prerenderDomSnippet, { html: true });
      },
    })
    .transform(response);
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

