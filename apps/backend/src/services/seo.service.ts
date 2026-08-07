import { Env } from '../index';

/**
 * @file seo.service.ts
 * @description SEO 搜索引擎优化服务层，用于动态生成 sitemap.xml 与 robots.txt。
 * 
 * 备注 (经验教训与规范):
 * 1. 时间处理归一化：所有 lastmod 字段严格使用 2026-03-13T14:11:00.000Z 标准 ISO 8601 格式或 YYYY-MM-DD。
 * 2. 性能与边缘防护：由于包含全量题目与 1488 页教科书 URL，使用 StringBuilder/数组 join 拼接 XML，避免高频内存浪费。
 * 3. 多语言扩展预留：架构上引入 xmlns:xhtml 命名空间，未来增加多语言后缀时可无缝扩展 hreflang。
 */

const SITE_BASE_URL = 'https://biopal-campbell.beikee.org';
const TOTAL_BOOK_PAGES = 1488;

/**
 * 生成标准的 robots.txt 文本
 */
export const generateRobotsTxt = (): string => {
  return `User-agent: *
Allow: /
Allow: /questions/
Allow: /?page=*

Sitemap: ${SITE_BASE_URL}/sitemap.xml
`;
};

const SUPPORTED_LANGS = ['en', 'zh', 'es', 'fr', 'de', 'ja'];

const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const buildHreflangTags = (pathWithQuery: string): string => {
  const links = SUPPORTED_LANGS.map(lang => {
    const separator = pathWithQuery.includes('?') ? '&' : '?';
    const rawHref = `${SITE_BASE_URL}${pathWithQuery}${separator}lang=${lang}`;
    return `    <xhtml:link rel="alternate" hreflang="${lang}" href="${escapeXml(rawHref)}" />`;
  });
  const defaultRawHref = `${SITE_BASE_URL}${pathWithQuery}${pathWithQuery.includes('?') ? '&' : '?'}lang=en`;
  links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(defaultRawHref)}" />`);
  return links.join('\n');
};

/**
 * 从 D1 数据库实时检索题目与页码，生成符合 Google 多语言规范的全量 sitemap.xml
 */
export const generateSitemapXml = async (env: Env): Promise<string> => {
  const nowIso = new Date().toISOString();
  const todayDate = nowIso.split('T')[0];

  let questions: { id: string; created_at?: string }[] = [];
  try {
    const stmt = env.DB.prepare('SELECT id, created_at FROM Questions ORDER BY created_at DESC');
    const result = await stmt.all<{ id: string; created_at?: string }>();
    questions = result.results || [];
  } catch (error) {
    console.error('Error fetching questions for sitemap:', error);
  }

  const urls: string[] = [];

  // 1. 根路径 (Priority: 1.0)
  urls.push(`  <url>
    <loc>${SITE_BASE_URL}/</loc>
${buildHreflangTags('/')}
    <lastmod>${todayDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`);

  // 2. 动态题目深层链接 URL (Priority: 0.9)
  for (const q of questions) {
    const lastmod = q.created_at ? q.created_at.split('T')[0] : todayDate;
    const path = `/questions/${q.id}`;
    urls.push(`  <url>
    <loc>${SITE_BASE_URL}${path}</loc>
${buildHreflangTags(path)}
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`);
  }

  // 3. 教科书 1~1488 页 URL (Priority: 0.7)
  for (let page = 1; page <= TOTAL_BOOK_PAGES; page++) {
    const path = `/?page=${page}`;
    urls.push(`  <url>
    <loc>${escapeXml(`${SITE_BASE_URL}${path}`)}</loc>
${buildHreflangTags(path)}
    <lastmod>${todayDate}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`);
  }

  // 5. 拼接完整的 XML 结构 (关联 /sitemap.xsl 实现浏览器端高颜值 HTML 表格渲染)
  return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>`;
};
