// Vercel Serverless Function：伺服器端代打 Yahoo Finance。
// 取代失效的第三方 CORS proxy（corsproxy.io→allorigins 皆已不穩）：
//   - 同源呼叫，無瀏覽器 CORS 限制
//   - 帶瀏覽器 User-Agent，避開 Yahoo 對無 UA 請求的 429 限流
//   - 白名單僅允許 Yahoo finance 主機，防止被當成開放式 SSRF 代理
const ALLOWED_HOSTS = new Set([
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
]);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export default async function handler(req, res) {
  const target = req.query?.url;
  if (!target) {
    res.status(400).json({ error: 'missing url param' });
    return;
  }

  let u;
  try {
    u = new URL(target);
  } catch {
    res.status(400).json({ error: 'invalid url' });
    return;
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
    res.status(403).json({ error: 'host not allowed' });
    return;
  }

  try {
    const upstream = await fetch(u.toString(), {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    const body = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 邊緣快取 10 分鐘、背景再驗證一天，減少對 Yahoo 的重複打點
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
    res.status(upstream.status).send(body);
  } catch {
    res.status(502).json({ error: 'upstream fetch failed' });
  }
}
