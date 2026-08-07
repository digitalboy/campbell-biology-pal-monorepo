<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" 
                xmlns:html="http://www.w3.org/TR/REC-html40"
                xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
                xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:xhtml="http://www.w3.org/1999/xhtml"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <title>XML Sitemap | Campbell Biology PAL</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <style type="text/css">
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            color: #334155;
            background-color: #f8fafc;
            margin: 0;
            padding: 24px;
          }
          .container {
            max-width: 1200px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
            border: 1px solid #e2e8f0;
            overflow: hidden;
          }
          .header {
            background: linear-gradient(135deg, #064e3b 0%, #047857 100%);
            color: white;
            padding: 24px 32px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .header h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .header p {
            margin: 4px 0 0 0;
            font-size: 13px;
            color: #a7f3d0;
          }
          .stats {
            padding: 16px 32px;
            background-color: #f1f5f9;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
            color: #64748b;
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            background-color: #f8fafc;
            color: #475569;
            text-align: left;
            padding: 12px 24px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-bottom: 1px solid #e2e8f0;
          }
          td {
            padding: 12px 24px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 13px;
          }
          tr:hover td {
            background-color: #f8fafc;
          }
          a {
            color: #059669;
            text-decoration: none;
            font-weight: 500;
          }
          a:hover {
            text-decoration: underline;
          }
          .priority {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 11px;
            background-color: #ecfdf5;
            color: #047857;
            border: 1px solid #a7f3d0;
          }
          .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 11px;
            background: #f1f5f9;
            color: #475569;
            margin-right: 4px;
          }
          .lang-link {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            background: #eff6ff;
            color: #2563eb;
            border: 1px solid #bfdbfe;
            margin-right: 4px;
            margin-bottom: 2px;
            text-decoration: none;
          }
          .lang-link:hover {
            background: #2563eb;
            color: #ffffff;
            text-decoration: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <h1>Campbell Biology PAL — XML Sitemap</h1>
              <p>Index generated for Googlebot, Bingbot and International Search Engines</p>
            </div>
          </div>
          <div class="stats">
            Total URLs in this sitemap: <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/>
          </div>
          <table>
            <thead>
              <tr>
                <th width="40%">URL Location</th>
                <th width="30%">Alternate Languages</th>
                <th width="10%">Priority</th>
                <th width="10%">Change Freq</th>
                <th width="10%">Last Modified</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <tr>
                  <td>
                    <a href="{sitemap:loc}" target="_blank">
                      <xsl:value-of select="sitemap:loc"/>
                    </a>
                  </td>
                  <td>
                    <xsl:for-each select="xhtml:link">
                      <a href="{@href}" target="_blank" class="lang-link" title="{@href}">
                        <xsl:value-of select="translate(@hreflang, 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ')"/>
                      </a>
                    </xsl:for-each>
                  </td>
                  <td>
                    <span class="priority"><xsl:value-of select="sitemap:priority"/></span>
                  </td>
                  <td>
                    <span class="badge"><xsl:value-of select="sitemap:changefreq"/></span>
                  </td>
                  <td>
                    <xsl:value-of select="sitemap:lastmod"/>
                  </td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
