/**
 * @file robots.txt.ts
 * @description Cloudflare Pages Edge Function，用于拦截前端主域名的 /robots.txt 请求。
 * 
 * 备注 (经验教训):
 * 优先于 Vue SPA 通配路由，在 Cloudflare Edge 边缘节点直接响应标准的 text/plain 文本。
 */

export const onRequest: PagesFunction = async () => {
  try {
    const res = await fetch('https://api.biopal-campbell.beikee.org/robots.txt');
    if (!res.ok) {
      return new Response('User-agent: *\nAllow: /\nSitemap: https://biopal-campbell.beikee.org/sitemap.xml', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
      });
    }
    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error: any) {
    return new Response('User-agent: *\nAllow: /\nSitemap: https://biopal-campbell.beikee.org/sitemap.xml', {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    });
  }
};
