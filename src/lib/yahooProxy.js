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

/**
 * 由使用者輸入的代號推導出要查詢 Yahoo 的候選代號（依序嘗試），純函式。
 * - 台股數字代號（可帶單一字母結尾，如 00631L 槓桿、00981A 主動式 ETF）：
 *   一律補суffix。上市用 .TW、上櫃用 .TWO，無法事先得知掛牌市場，
 *   故兩者都產生、依序嘗試（呼叫端取第一個有價者）。
 * - 已帶 .TW / .TWO 者：把指定的擺前面，另一個當後備。
 * - 其餘（美股等英文代號）：原樣回傳。
 */
export function twSymbolCandidates(rawSymbol) {
  const s = (rawSymbol || '').trim();
  if (!s) return [];
  const m = s.match(/^(\d{3,6}[A-Za-z]?)(?:\.(TW|TWO))?$/i);
  if (!m) return [s.toUpperCase()];
  const base = m[1].toUpperCase();
  const order = m[2] && m[2].toUpperCase() === 'TWO' ? ['TWO', 'TW'] : ['TW', 'TWO'];
  return order.map(suf => `${base}.${suf}`);
}
