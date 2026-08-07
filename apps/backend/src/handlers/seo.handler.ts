import { Context } from 'hono';
import { Env } from '../index';
import { HonoContextVariables } from '../router';
import { generateRobotsTxt, generateSitemapXml } from '../services/seo.service';

/**
 * GET /robots.txt
 * 返回标准的 robots.txt 内容
 */
export const getRobotsTxtHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  const content = generateRobotsTxt();

  return c.text(content, 200, {
    'Content-Type': 'text/plain; charset=UTF-8',
    'Cache-Control': 'public, max-age=86400, s-maxage=86400',
  });
};

/**
 * GET /sitemap.xml
 * 动态生成并返回 UTF-8 编码的 sitemap.xml，带有 24h 边缘缓存设置保护 D1
 */
export const getSitemapXmlHandler = async (
  c: Context<{ Bindings: Env; Variables: HonoContextVariables }>
) => {
  try {
    const xml = await generateSitemapXml(c.env);

    return c.text(xml, 200, {
      'Content-Type': 'application/xml; charset=UTF-8',
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    });
  } catch (error: any) {
    console.error('Error generating sitemap.xml:', error);
    return c.text('<?xml version="1.0" encoding="UTF-8"?><error>Failed to generate sitemap</error>', 500, {
      'Content-Type': 'application/xml; charset=UTF-8',
    });
  }
};
