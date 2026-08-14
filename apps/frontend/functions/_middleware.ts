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
 * @description Cloudflare Pages Edge 全局中间件，负责全站 (首页 /、教科书页 ?page=X、题目页 /questions/:id) 的 Edge SSR 预渲染与 SEO 元数据治理。
 * 
 * 备注 (经验教训与架构规范):
 * 1. 静态资源优先级机制 (Static Precedence Fix): Cloudflare Pages 默认将 dist/index.html 视作静态文件，
 *    改用 functions/_middleware.ts 可在边缘节点无缝拦截所有路由，执行动态 HTMLRewriter 流式改写。
 * 2. 单一 SSR 中间件原则 (Single Responsibility): 严禁在 functions/ 子目录中混用二级路由拦截 (如 functions/questions/[id].ts)，
 *    防止 context.next() 链式调用产生双重 HTMLRewriter 导致的 Meta 标签与 JSON-LD Schema 重复注入。
 * 3. 彻底杜绝隐形文本 (Anti-Cloaking / Visible Prerendering): 废除 display:none 及 aria-hidden="true"，
 *    使用标准的语义化 HTML (h1, p, nav, a) 作为预渲染主体注入 <div id="app">。在浏览器端 Vue 挂载 (app.mount) 后会自动接管替换，
 *    使 Googlebot 在第一轮无需等待 JS 二次渲染即可完整收录正文与超链接。
 * 4. 爬虫内链网络构建 (Crawlable Internal Links): 所有预渲染页面均内置标准 <a href="..."> 导航标签，
 *    构建起“首页 <-> 1488页教材 <-> 题目”的立体内链网络，确保 Googlebot 能够顺着 DOM 树爬行发现全量页面。
 * 5. 语言参数与 Canonical 一致性 (Canonical Normalization): 严格保持 <link rel="canonical"> 与 Sitemap 中的 hreflang 变体一致，
 *    消除 GSC 中的“已发现 - 未编入索引”与“重复网页”异常。
 * 6. 时间标准化：时间处理严格遵循 ISO 8601 规范 (如 2026-03-13T14:11:00.000Z)。
 */

interface Env {
  // Bindings if any
}

const SUPPORTED_LANGS = ['en', 'zh', 'es', 'fr', 'de', 'ja'];
const TOTAL_BOOK_PAGES = 1488;
const SITE_BASE_URL = 'https://biopal-campbell.beikee.org';

const HOME_TEXTS: Record<string, { title: string; desc: string; heading: string; intro: string }> = {
  en: {
    title: 'BioPal — Campbell Biology AI Learning Companion',
    desc: 'Interactive AI study companion for Campbell Biology 12th Edition. Master biology concepts with knowledge graphs, textbook summaries, and practice quizzes.',
    heading: 'Campbell Biology 12th Edition — AI Interactive Study Companion',
    intro: 'Explore interactive knowledge graphs, 1488 textbook pages study guides, and comprehensive practice questions designed for biology learners worldwide.',
  },
  zh: {
    title: 'BioPal — 坎贝尔生物学 AI 学习伴侣',
    desc: '《坎贝尔生物学》（第12版）智能化 AI 学习助手。提供交互式知识图谱、全书 1488 页精讲导读与配套练习题库。',
    heading: '《坎贝尔生物学》（第12版）AI 交互式学习伴侣',
    intro: '探索交互式生物知识图谱、1488 页教材深度导读、配套模拟练习题与 AI 智能答疑。',
  },
  es: {
    title: 'BioPal — Compañero de aprendizaje IA de Biología de Campbell',
    desc: 'Compañero interactivo de estudio IA para Biología de Campbell 12.ª Edición. Domina conceptos de biología con grafos de conocimiento y preguntas de práctica.',
    heading: 'Biología de Campbell 12.ª Edición — Compañero de Estudio IA',
    intro: 'Explore grafos de conocimiento interactivos, guías de estudio de 1488 páginas y preguntas de práctica.',
  },
  fr: {
    title: 'BioPal — Compagnon d\'apprentissage IA de Biologie de Campbell',
    desc: 'Compagnon d\'étude interactif pour Biologie de Campbell 12e Édition. Maîtrisez les concepts biologiques avec des graphes de connaissances et des quiz.',
    heading: 'Biologie de Campbell 12e Édition — Compagnon d\'Étude IA',
    intro: 'Explorez des graphes de connaissances interactifs, des guides d\'étude de 1488 pages et des questions d\'entraînement.',
  },
  de: {
    title: 'BioPal — KI-Lernbegleiter für Campbell-Biologie',
    desc: 'Interaktiver KI-Lernbegleiter für Campbell Biologie 12. Auflage. Verstehen Sie Biologiekonzepte mit Wissensgraphen und Übungsfragen.',
    heading: 'Campbell Biologie 12. Auflage — KI-Lernbegleiter',
    intro: 'Erkunden Sie interaktive Wissensgraphen, 1488 Lehrbuchseiten und interaktive Übungsaufgaben.',
  },
  ja: {
    title: 'BioPal — キャンベル生物学のAI学習コンパニオン',
    desc: '『キャンベル生物学 原書第12版』対応のAI学習アシスタント。知識グラフ、全1488ページの解説、練習問題で生物学をマスター。',
    heading: 'キャンベル生物学 原書第12版 — AI学習アシスタント',
    intro: 'インタラクティブな知識グラフ、1488ページの教材ガイド、練習問題で効率的に学習できます。',
  },
};

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

  // 静态资源 (JS/CSS/图片/字体/API/Sitemap) 快速放行
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.xml') ||
    url.pathname.endsWith('.txt') ||
    url.pathname.endsWith('.xsl') ||
    url.pathname.startsWith('/api/')
  ) {
    return context.next();
  }

  const isRootPath = url.pathname === '/' || url.pathname === '/index.html';
  const rawPage = url.searchParams.get('page');
  const isQuestionPath = url.pathname.startsWith('/questions/');
  const questionId = isQuestionPath ? url.pathname.split('/questions/')[1]?.split('/')[0]?.split('?')[0] : null;

  const isBookPageMatch = isRootPath && rawPage && !isNaN(parseInt(rawPage, 10)) && parseInt(rawPage, 10) >= 1 && parseInt(rawPage, 10) <= TOTAL_BOOK_PAGES;
  const isQuestionMatch = isQuestionPath && Boolean(questionId);
  const isHomeMatch = isRootPath && !rawPage;

  if (!isBookPageMatch && !isQuestionMatch && !isHomeMatch) {
    return context.next();
  }

  // 提取当前语言偏好
  const reqLang = (url.searchParams.get('lang') || 'en').toLowerCase();
  const targetLang = SUPPORTED_LANGS.includes(reqLang) ? reqLang : 'en';

  const response = await context.next();

  try {
    // 分支 1: 处理题目详情页 Edge SSR (/questions/:id)
    if (isQuestionMatch && questionId) {
      return await handleQuestionSsr(response, questionId, targetLang);
    }

    // 分支 2: 处理教科书页码 Edge SSR (/?page=X)
    if (isBookPageMatch && rawPage) {
      const pageNum = parseInt(rawPage, 10);
      return await handleBookPageSsr(response, pageNum, targetLang);
    }

    // 分支 3: 处理首页 Edge SSR (/)
    if (isHomeMatch) {
      return await handleHomeSsr(response, targetLang);
    }

    return response;
  } catch (error) {
    console.error(`[Edge Middleware SSR Error] ${url.pathname}:`, error);
    return response;
  }
};

/**
 * 1. 处理网站首页的 Edge SSR 预渲染与元数据注入
 */
async function handleHomeSsr(response: Response, targetLang: string): Promise<Response> {
  const homeData = HOME_TEXTS[targetLang] || HOME_TEXTS.en;
  const pageTitle = homeData.title;
  const pageDescription = homeData.desc;

  const canonicalUrl = `${SITE_BASE_URL}/${targetLang !== 'en' ? `?lang=${targetLang}` : ''}`;

  const hreflangTags = SUPPORTED_LANGS.map((lang) => {
    const href = lang === 'en' ? `${SITE_BASE_URL}/` : `${SITE_BASE_URL}/?lang=${lang}`;
    return `<link rel="alternate" hreflang="${lang}" href="${escapeAttr(href)}" />`;
  });
  hreflangTags.push(`<link rel="alternate" hreflang="x-default" href="${escapeAttr(`${SITE_BASE_URL}/`)}" />`);

  const jsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': 'BioPal',
    'alternateName': 'Campbell Biology AI Study Companion',
    'url': SITE_BASE_URL,
    'description': pageDescription,
    'inLanguage': targetLang,
    'potentialAction': {
      '@type': 'SearchAction',
      'target': `${SITE_BASE_URL}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  const jsonLdScript = JSON.stringify(jsonLdData);

  // 构造首页爬虫抓取内链：包含重点章节与核心页码引导链接
  const samplePages = [1, 2, 28, 94, 162, 200, 300, 450, 600, 800, 1000, 1200, 1488];
  const pageLinks = samplePages
    .map((p) => `<li><a href="/?page=${p}">Page ${p} Study Guide</a></li>`)
    .join('\n');

  const prerenderDomSnippet = `
<div id="seo-prerender-content" class="seo-static-content">
  <h1>${escapeAttr(homeData.heading)}</h1>
  <p>${escapeAttr(homeData.intro)}</p>
  <nav aria-label="Textbook Chapters and Pages Navigation">
    <h2>Explore Textbook Companion Pages (1–1488)</h2>
    <ul>
      ${pageLinks}
    </ul>
    <p><a href="/?page=1">Start Reading from Page 1</a></p>
  </nav>
</div>`;

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
    .on('meta[name="description"]', {
      element(el: any) {
        el.remove();
      },
    })
    .on('link[rel="canonical"]', {
      element(el: any) {
        el.remove();
      },
    })
    .on('head', {
      element(el: any) {
        el.append(`<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`, { html: true });
        el.append(`<meta name="description" content="${escapeAttr(pageDescription)}" />`, { html: true });
        el.append(`<meta property="og:title" content="${escapeAttr(pageTitle)}" />`, { html: true });
        el.append(`<meta property="og:description" content="${escapeAttr(pageDescription)}" />`, { html: true });
        el.append(`<meta property="og:type" content="website" />`, { html: true });
        el.append(`<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`, { html: true });
        el.append(`<meta property="og:image" content="${SITE_BASE_URL}/logo.svg" />`, { html: true });
        el.append(hreflangTags.join('\n'), { html: true });
        el.append(`<script type="application/ld+json">${jsonLdScript}</script>`, { html: true });
      },
    })
    .on('div#app', {
      element(el: any) {
        el.setInnerContent(prerenderDomSnippet, { html: true });
      },
    })
    .transform(response);
}

/**
 * 2. 处理题目详情页的 Edge SSR 预渲染与元数据注入
 */
async function handleQuestionSsr(response: Response, questionId: string, targetLang: string): Promise<Response> {
  let questionStem = 'Campbell Biology Practice Question';
  let explanationText = '';
  let optionsList: { id: string; text: string }[] = [];
  let pageNum = 1;
  let correctAnsIds: string[] = [];

  try {
    const apiRes = await fetch(`https://api.biopal-campbell.beikee.org/api/v1/questions/${questionId}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
    } as any);

    if (apiRes.ok) {
      const json = (await apiRes.json()) as any;
      if (json.ok && json.data) {
        const q = json.data;
        pageNum = q.page_number || 1;
        correctAnsIds = Array.isArray(q.correct_answers) ? q.correct_answers : [];

        // 精准提取对应语言的题干 (降级策略: targetLang -> en -> zh)
        if (q.question_text) {
          questionStem = q.question_text[targetLang] || q.question_text.en || q.question_text.zh || questionStem;
        } else if (q.stem) {
          questionStem = typeof q.stem === 'string' ? q.stem : (q.stem[targetLang] || q.stem.en || questionStem);
        }

        // 提取解释文本
        if (q.explanation) {
          if (typeof q.explanation === 'string') {
            explanationText = q.explanation;
          } else {
            explanationText = q.explanation[targetLang] || q.explanation.en || q.explanation.zh || '';
          }
        }

        // 提取选项列表
        if (Array.isArray(q.options)) {
          optionsList = q.options.map((opt: any) => {
            let optText = '';
            if (typeof opt.text === 'string') {
              optText = opt.text;
            } else if (opt.text && typeof opt.text === 'object') {
              optText = opt.text[targetLang] || opt.text.en || opt.text.zh || '';
            } else if (typeof opt === 'string') {
              optText = opt;
            }
            return { id: opt.id || '', text: optText };
          });
        }
      }
    }
  } catch (err) {
    console.warn(`[Edge Question SSR] Failed to fetch question ${questionId}:`, err);
  }

  // 清洗特殊 Markdown 符号
  const cleanStem = questionStem.replace(/[#*`_~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanExplanation = explanationText.replace(/[#*`_~\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
  const shortStem = cleanStem.length > 70 ? `${cleanStem.substring(0, 67)}...` : cleanStem;

  const isZhOrJa = targetLang === 'zh' || targetLang === 'ja';
  const pageTitle = isZhOrJa
    ? `[坎贝尔生物学 第${pageNum}页练习题] ${shortStem}`
    : `[Campbell Biology P.${pageNum}] ${shortStem} | Practice Question`;

  const optionsDesc = optionsList.map((o) => `${o.id}: ${o.text}`).join('; ');
  const descRaw = cleanExplanation
    ? `Question: ${cleanStem}. Options: ${optionsDesc}. Explanation: ${cleanExplanation}`
    : `Question: ${cleanStem}. Options: ${optionsDesc}`;
  const pageDescription = descRaw.length > 160 ? `${descRaw.substring(0, 157)}...` : descRaw;

  const basePath = `/questions/${questionId}`;
  const canonicalUrl = `${SITE_BASE_URL}${basePath}${targetLang !== 'en' ? `?lang=${targetLang}` : ''}`;

  const hreflangTags = SUPPORTED_LANGS.map((lang) => {
    const href = lang === 'en' ? `${SITE_BASE_URL}${basePath}` : `${SITE_BASE_URL}${basePath}?lang=${lang}`;
    return `<link rel="alternate" hreflang="${lang}" href="${escapeAttr(href)}" />`;
  });
  hreflangTags.push(`<link rel="alternate" hreflang="x-default" href="${escapeAttr(`${SITE_BASE_URL}${basePath}`)}" />`);

  // 构建标准 Schema.org Question 数据结构
  const acceptedAnswers = optionsList
    .filter((o) => correctAnsIds.includes(o.id))
    .map((o) => ({
      '@type': 'Answer',
      'text': `${o.id}: ${o.text}`,
    }));

  const jsonLdData: any = {
    '@context': 'https://schema.org/',
    '@type': 'Question',
    'name': shortStem,
    'text': cleanStem,
    'inLanguage': targetLang,
    'educationalAlignment': 'Campbell Biology 12th Edition',
    'learningResourceType': 'Practice Problem',
    'suggestedAnswer': optionsList.map((o) => ({
      '@type': 'Answer',
      'text': `${o.id}: ${o.text}`,
    })),
  };

  if (acceptedAnswers.length > 0) {
    jsonLdData.acceptedAnswer = acceptedAnswers.length === 1 ? acceptedAnswers[0] : acceptedAnswers;
  }

  const jsonLdScript = JSON.stringify(jsonLdData);

  // 构建可见的语义化预渲染 DOM（包含内链），Vue 挂载后自动替换
  const optionsHtml = optionsList.map((o) => `<li><strong>${escapeAttr(o.id)}:</strong> ${escapeAttr(o.text)}</li>`).join('\n');
  const prerenderDomSnippet = `
<div id="seo-prerender-content" class="seo-static-content">
  <article>
    <h1>${escapeAttr(pageTitle)}</h1>
    <p class="question-stem">${escapeAttr(cleanStem)}</p>
    <ul class="question-options">
      ${optionsHtml}
    </ul>
    ${cleanExplanation ? `<div class="question-explanation"><h3>Explanation</h3><p>${escapeAttr(cleanExplanation)}</p></div>` : ''}
  </article>
  <nav aria-label="Related Study Navigation">
    <p>Corresponding Textbook Page: <a href="/?page=${pageNum}">Campbell Biology Page ${pageNum}</a></p>
    <p><a href="/">Back to Biology Companion Home</a></p>
  </nav>
</div>`;

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
    .on('meta[name="description"]', {
      element(el: any) {
        el.remove();
      },
    })
    .on('link[rel="canonical"]', {
      element(el: any) {
        el.remove();
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
        el.setInnerContent(prerenderDomSnippet, { html: true });
      },
    })
    .transform(response);
}

/**
 * 3. 处理教科书页码的 Edge SSR 预渲染与元数据注入
 */
async function handleBookPageSsr(response: Response, pageNum: number, targetLang: string): Promise<Response> {
  const langConfig = LANG_TEXTS[targetLang] || LANG_TEXTS.en;
  let customSummary = '';

  try {
    const apiRes = await fetch(`https://api.biopal-campbell.beikee.org/api/v1/pdf-content/${pageNum}`, {
      cf: { cacheTtl: 86400, cacheEverything: true },
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
    const href = lang === 'en' ? `${SITE_BASE_URL}${basePath}` : `${SITE_BASE_URL}${basePath}&lang=${lang}`;
    return `<link rel="alternate" hreflang="${lang}" href="${escapeAttr(href)}" />`;
  });
  hreflangTags.push(`<link rel="alternate" hreflang="x-default" href="${escapeAttr(`${SITE_BASE_URL}${basePath}`)}" />`);

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

  // 构造前后页翻页及全书目录内链，赋能 Googlebot 递归爬取
  const prevLink = pageNum > 1 ? `<a href="/?page=${pageNum - 1}">← Previous Page (P.${pageNum - 1})</a>` : '';
  const nextLink = pageNum < TOTAL_BOOK_PAGES ? `<a href="/?page=${pageNum + 1}">Next Page (P.${pageNum + 1}) →</a>` : '';

  const prerenderDomSnippet = `
<div id="seo-prerender-content" class="seo-static-content">
  <article>
    <h1>${escapeAttr(pageTitle)}</h1>
    <p class="page-summary">${escapeAttr(summaryContent)}</p>
  </article>
  <nav aria-label="Page Pagination and Navigation">
    <p>
      ${prevLink}
      ${prevLink && nextLink ? ' | ' : ''}
      ${nextLink}
    </p>
    <p><a href="/">Back to Biology Companion Overview</a></p>
  </nav>
</div>`;

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
    .on('meta[name="description"]', {
      element(el: any) {
        el.remove();
      },
    })
    .on('link[rel="canonical"]', {
      element(el: any) {
        el.remove();
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
        el.setInnerContent(prerenderDomSnippet, { html: true });
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
