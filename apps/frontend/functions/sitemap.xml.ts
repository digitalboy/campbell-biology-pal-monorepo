/**
 * @file sitemap.xml.ts
 * @description Cloudflare Pages Edge Function，用于拦截前端主域名的 /sitemap.xml 请求。
 * 
 * 备注 (经验教训):
 * Cloudflare Pages 静态文件与 SPA 路由优先级低于 Pages Functions。
 * 在 functions/ 中声明 sitemap.xml.ts 可确保在边缘节点以 200 OK 且 Response Header 为 application/xml; charset=UTF-8 瞬间响应，
 * 彻底解决 Vue Router 通配路由将 /sitemap.xml 误判为前端 404 的重大 Bug。
 */

export const onRequest: PagesFunction = async () => {
  try {
    const res = await fetch('https://api.biopal-campbell.beikee.org/sitemap.xml');
    if (!res.ok) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><error>Failed to load sitemap</error>', {
        status: 500,
        headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
      });
    }
    const xml = await res.text();
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=UTF-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error: any) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><error>Fetch error</error>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
    });
  }
};
