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
 * @description Cloudflare Pages Edge 全局中间件，用于拦截主域名根路径 (GET /) 的 ?page=X 请求。
 * 
 * 备注 (经验教训与架构规范):
 * 1. 静态资源优先级隐患 (Static File Precedence): Cloudflare Pages 默认将 dist/index.html 视作静态文件，
 *    优先级高于普通的 Pages Functions (如 functions/index.ts)，导致 functions/index.ts 无法触发。
 *    改用 functions/_middleware.ts 全局中间件，可在 Cloudflare Pages 返回静态 dist/index.html 之前强制拦截并执行 HTMLRewriter 变换！
 * 2. 路由穿透与零污染：仅在 (url.pathname === '/' || url.pathname === '/index.html') 且存在有效 page 参数 (1 <= page <= 1488) 时执行改写；
 *    其它请求（如 /questions/:id、/sitemap.xml、静态 JS/CSS 资源）一律在第一行直接 context.next() 穿透，确保零额外延迟。
 * 3. 搜索引擎规范对齐：为 ?page=X 动态注入 Canonical、hreflang 与 JSON-LD，解决 Google Search Console 薄内容/未编入索引警告。
 * 4. 时间规范：遵循 ISO 8601 标准 (如 2026-03-13T14:11:00.000Z)。
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

  // 仅在根路径且存在 page 参数时拦截，其它请求（包含静态资源）快速穿透
  const isRootPath = url.pathname === '/' || url.pathname === '/index.html';
  const rawPage = url.searchParams.get('page');

  if (!isRootPath || !rawPage) {
    return context.next();
  }

  const pageNum = parseInt(rawPage, 10);
  if (isNaN(pageNum) || pageNum < 1 || pageNum > TOTAL_BOOK_PAGES) {
    return context.next();
  }

  // 2. 提取多语言参数与配置
  const reqLang = (url.searchParams.get('lang') || 'en').toLowerCase();
  const targetLang = SUPPORTED_LANGS.includes(reqLang) ? reqLang : 'en';
  const langConfig = LANG_TEXTS[targetLang] || LANG_TEXTS.en;

  const response = await context.next();

  try {
    let customSummary = '';
    // 3. 尝试从后端获取该页面的 Markdown 概览内容
    try {
      const apiRes = await fetch(`https://api.biopal-campbell.beikee.org/api/v1/pdf-content/${pageNum}`, {
        cf: { cacheTtl: 300, cacheEverything: true },
      } as any);
      if (apiRes.ok) {
        const json = (await apiRes.json()) as any;
        if (json.ok && json.data?.markdown_text) {
          // 提取纯文本前 160 字符作为动态 Description
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

    // 4. 构建标题与描述
    const isZhOrJa = targetLang === 'zh' || targetLang === 'ja';
    const pageTitle = isZhOrJa
      ? `[${langConfig.titlePrefix}${pageNum}页] Campbell Biology 12th Edition`
      : `[${langConfig.titlePrefix} ${pageNum}] Campbell Biology 12th Edition`;

    const summaryContent = customSummary || langConfig.defaultSummary;
    const pageDescription = isZhOrJa
      ? `${langConfig.descPrefix}${pageNum}页学习指南：${summaryContent}`
      : `${langConfig.descPrefix} ${pageNum}: ${summaryContent}`;

    const canonicalUrl = `${SITE_BASE_URL}/?page=${pageNum}`;

    // 5. 构建 hreflang 关联标签
    const hreflangTags = SUPPORTED_LANGS.map((lang) => {
      return `<link rel="alternate" hreflang="${lang}" href="${escapeAttr(`${SITE_BASE_URL}/?page=${pageNum}&lang=${lang}`)}" />`;
    });
    hreflangTags.push(
      `<link rel="alternate" hreflang="x-default" href="${escapeAttr(`${SITE_BASE_URL}/?page=${pageNum}&lang=en`)}" />`
    );

    // 6. 构建 Schema.org 结构化数据 (WebPage & LearningResource)
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

    // 7. 使用 HTMLRewriter 注入头部元数据
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
          // 规范链接 Canonical
          el.append(`<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`, { html: true });

          // 基础 Meta 标签
          el.append(`<meta name="description" content="${escapeAttr(pageDescription)}" />`, { html: true });
          el.append(`<meta property="og:title" content="${escapeAttr(pageTitle)}" />`, { html: true });
          el.append(`<meta property="og:description" content="${escapeAttr(pageDescription)}" />`, { html: true });
          el.append(`<meta property="og:type" content="article" />`, { html: true });
          el.append(`<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`, { html: true });
          el.append(`<meta property="og:image" content="${SITE_BASE_URL}/logo.svg" />`, { html: true });

          // Hreflang 多语言关联
          el.append(hreflangTags.join('\n'), { html: true });

          // JSON-LD 结构化数据
          el.append(`<script type="application/ld+json">${jsonLdScript}</script>`, { html: true });
        },
      })
      .transform(response);
  } catch (error) {
    console.error(`[Edge Middleware SSR Error] Page ${pageNum}:`, error);
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
