import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 本機開發鏡像：在 vite dev 重現 api/yahoo.js（serverless）的行為，
// 讓 /api/yahoo 在 `npm run dev` 也能用（正式環境由 Vercel Function 接手）。
function yahooDevProxy() {
  const ALLOWED_HOSTS = new Set(['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  return {
    name: 'yahoo-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/yahoo', async (req, res) => {
        const send = (code, obj) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(typeof obj === 'string' ? obj : JSON.stringify(obj));
        };
        try {
          const reqUrl = new URL(req.originalUrl, 'http://localhost');
          const target = reqUrl.searchParams.get('url');
          if (!target) return send(400, { error: 'missing url param' });
          const u = new URL(target);
          if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
            return send(403, { error: 'host not allowed' });
          }
          const upstream = await fetch(u.toString(), { headers: { 'User-Agent': UA, Accept: 'application/json' } });
          const body = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(body);
        } catch {
          send(502, { error: 'upstream fetch failed' });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    yahooDevProxy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'SubItemManager 收支管理系統',
        short_name: '收支管理',
        description: '記錄每一筆固定支出與日常生活費的財務管理工具',
        theme_color: '#C17B2E',
        background_color: '#F0EDE8',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'favicon.ico',
            sizes: '192x192',
            type: 'image/x-icon'
          },
          {
            src: 'favicon.ico',
            sizes: '512x512',
            type: 'image/x-icon'
          }
        ]
      }
    })
  ],
  base: '/',
  root: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 把穩定的第三方庫切成獨立 chunk，利於瀏覽器長期快取（改版時不必重抓）
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-motion':   ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  css: {
    devSourcemap: true,
  },
});
