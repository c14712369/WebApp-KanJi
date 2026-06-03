/**
 * Yahoo Finance 取價的 CORS 代理輔助。
 * corsproxy.io 已失效（回 403），改用 allorigins，其 /get 端點會把回應包成
 * { contents: "<json 字串>", status: {...} }，需再 parse 一次。
 */

/** allorigins 代理基底；用 /get 取得包裹回應 */
export function buildProxyUrl(targetUrl) {
  return `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
}

/**
 * 解開 allorigins /get 的回應，還原成原始 JSON 物件（純函式）。
 * - { contents: "<json 字串>" } → parse 後物件
 * - contents 已是物件 → 直接回傳
 * - 本身就是原始資料（無 contents）→ 原樣回傳（防禦未來換 proxy）
 * - null / 非法 JSON → 回 null（呼叫端自行視為取價失敗）
 */
export function unwrapAllOrigins(wrapped) {
  if (!wrapped) return null;
  if (Object.prototype.hasOwnProperty.call(wrapped, 'contents')) {
    const c = wrapped.contents;
    if (c && typeof c === 'object') return c;
    if (typeof c === 'string') {
      try { return JSON.parse(c); } catch { return null; }
    }
    return null;
  }
  return wrapped; // 已是原始 JSON
}
