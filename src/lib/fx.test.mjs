/**
 * 零依賴測試：node src/lib/fx.test.mjs
 * 外幣記帳：幣別資料、顯示格式、換算台幣、抓匯率（含備援與快取）、存檔欄位、沿用上次幣別。
 */
import assert from 'node:assert';
import {
  CURRENCIES, currencyMeta, formatForeign, formatRate, toTWD, parseRateResponse,
  fetchRateToTWD, entryAmountFields,
} from './fx.js';

let passed = 0, failed = 0;
const pending = [];
const test = (name, fn) => {
  pending.push((async () => {
    try { await fn(); passed++; console.log('  ✅ ' + name); }
    catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
  })());
};

// 假的 fetch：依網址回應，記錄呼叫過的網址
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const hit = Object.keys(routes).find(k => url.includes(k));
    if (!hit) return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
    return { ok: true, status: 200, json: async () => routes[hit] };
  };
  return { impl, calls };
}
const memStorage = () => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};

console.log('幣別資料與顯示');
test('日圓：名稱、符號、沒有小數', () => {
  const m = currencyMeta('JPY');
  assert.equal(m.name, '日圓');
  assert.equal(m.symbol, '¥');
  assert.equal(m.decimals, 0);
});
test('支援常見旅遊地幣別（至少 35 種、代碼不重複、都有中文名）', () => {
  assert.ok(CURRENCIES.length >= 35);
  assert.equal(new Set(CURRENCIES.map(c => c.code)).size, CURRENCIES.length);
  ['PHP', 'IDR', 'NZD', 'CHF', 'MOP', 'INR', 'AED', 'TRY', 'CZK', 'ISK'].forEach(code => {
    assert.ok(CURRENCIES.some(c => c.code === code), code + ' 不在清單');
  });
  assert.ok(CURRENCIES.every(c => /[\u4e00-\u9fff]/.test(c.name)));
});
test('常用幣別排在前面（分組顯示用）', () => {
  assert.deepEqual(CURRENCIES.filter(c => c.common).map(c => c.code).slice(0, 4), ['TWD', 'JPY', 'KRW', 'USD']);
});
test('不認得的幣別：符號退回幣別代碼', () => {
  assert.equal(currencyMeta('XYZ').symbol, 'XYZ ');
});
test('原幣金額加千分位', () => {
  assert.equal(formatForeign(10000, 'JPY'), '¥10,000');
  assert.equal(formatForeign(50000, 'KRW'), '₩50,000');
});
test('有小數的美元補滿兩位，整數不補', () => {
  assert.equal(formatForeign(12.5, 'USD'), 'US$12.50');
  assert.equal(formatForeign(12, 'USD'), 'US$12');
});
test('匯率顯示 4 位有效數字', () => {
  assert.equal(formatRate(0.20619814), '0.2062');
  assert.equal(formatRate(32.4123), '32.41');
  assert.equal(formatRate(0.021934), '0.02193');
});

console.log('換算台幣');
test('四捨五入到整數台幣', () => {
  assert.equal(toTWD(10000, 0.2062), 2062);
  assert.equal(toTWD(333, 0.2065), 69);
});
test('沒有匯率 → null，不可當 1:1', () => {
  assert.equal(toTWD(100, null), null);
  assert.equal(toTWD(100, 0), null);
});

console.log('解析匯率回應');
test('取出 jpy → twd', () => {
  assert.equal(parseRateResponse({ jpy: { twd: 0.2062 } }, 'JPY'), 0.2062);
});
test('格式不對或 0 → null', () => {
  assert.equal(parseRateResponse({ message: 'not found' }, 'JPY'), null);
  assert.equal(parseRateResponse({ jpy: { twd: 0 } }, 'JPY'), null);
  assert.equal(parseRateResponse(null, 'JPY'), null);
});

console.log('抓匯率');
test('台幣固定 1，不連網', async () => {
  const f = fakeFetch({});
  assert.equal(await fetchRateToTWD('TWD', '2026-11-14', { fetchImpl: f.impl, storage: null }), 1);
  assert.equal(f.calls.length, 0);
});
test('過去日期抓當天的歷史匯率', async () => {
  const f = fakeFetch({ '@2026-11-14/v1/currencies/jpy': { jpy: { twd: 0.20619814 } } });
  const r = await fetchRateToTWD('JPY', '2026-11-14', { fetchImpl: f.impl, storage: null, today: '2026-11-24' });
  assert.equal(r, 0.206198);
  assert.ok(f.calls[0].includes('@2026-11-14'));
});
test('今天或未來日期抓最新匯率', async () => {
  const f = fakeFetch({ '@latest/v1/currencies/jpy': { jpy: { twd: 0.2074 } } });
  const r = await fetchRateToTWD('JPY', '2026-12-01', { fetchImpl: f.impl, storage: null, today: '2026-11-24' });
  assert.equal(r, 0.2074);
});
test('主來源失敗改用備援來源', async () => {
  const f = fakeFetch({ '2026-11-14.currency-api.pages.dev': { jpy: { twd: 0.2061 } } });
  const r = await fetchRateToTWD('JPY', '2026-11-14', { fetchImpl: f.impl, storage: null, today: '2026-11-24' });
  assert.equal(r, 0.2061);
  assert.equal(f.calls.length, 2);
});
test('全部失敗回傳 null（不可回傳 1）', async () => {
  const f = fakeFetch({});
  const r = await fetchRateToTWD('JPY', '2026-11-14', { fetchImpl: f.impl, storage: null, today: '2026-11-24' });
  assert.equal(r, null);
});
test('連線丟例外也回傳 null', async () => {
  const boom = async () => { throw new Error('offline'); };
  assert.equal(await fetchRateToTWD('JPY', '2026-11-14', { fetchImpl: boom, storage: null, today: '2026-11-24' }), null);
});
test('同一天同幣別第二次讀快取，不再連網', async () => {
  const f = fakeFetch({ '@2026-11-15/v1/currencies/jpy': { jpy: { twd: 0.2063 } } });
  const storage = memStorage();
  const opts = { fetchImpl: f.impl, storage, today: '2026-11-24' };
  await fetchRateToTWD('JPY', '2026-11-15', opts);
  assert.equal(await fetchRateToTWD('JPY', '2026-11-15', opts), 0.2063);
  assert.equal(f.calls.length, 1);
});

console.log('存檔欄位');
test('外幣：金額存台幣，另存幣別、原幣、匯率', () => {
  assert.deepStrictEqual(entryAmountFields(10000, 'JPY', 0.2062), {
    amount: 2062, currency: 'JPY', originalAmount: 10000, fxRate: 0.2062, fxCustom: undefined,
  });
});
test('自訂匯率記號（之後編輯改日期不重抓）', () => {
  assert.equal(entryAmountFields(10000, 'JPY', 0.21, true).fxCustom, true);
});
test('台幣：清掉外幣欄位（編輯時從日圓改回台幣不殘留）', () => {
  assert.deepStrictEqual(entryAmountFields(120, 'TWD', 1, true), {
    amount: 120, currency: undefined, originalAmount: undefined, fxRate: undefined, fxCustom: undefined,
  });
});

await Promise.all(pending);
console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
