/**
 * 零依賴測試：node src/lib/yahooProxy.test.mjs
 * 驗證 allorigins /get 回應的解包（corsproxy.io 失效後改用 allorigins）。
 */
import assert from 'node:assert';
import { unwrapAllOrigins } from './yahooProxy.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

console.log('\n[unwrapAllOrigins]');
test('解開 {contents:"<json 字串>"} 還原成物件', () => {
  const wrapped = { contents: '{"chart":{"result":[{"meta":{"regularMarketPrice":1085}}]}}' };
  const data = unwrapAllOrigins(wrapped);
  assert.equal(data.chart.result[0].meta.regularMarketPrice, 1085);
});
test('contents 已是物件時直接回傳', () => {
  const wrapped = { contents: { chart: { result: [] } } };
  assert.deepEqual(unwrapAllOrigins(wrapped), { chart: { result: [] } });
});
test('沒有 contents 但本身就是 chart 資料 → 原樣回傳（防禦）', () => {
  const direct = { chart: { result: [{ meta: { previousClose: 50 } }] } };
  assert.equal(unwrapAllOrigins(direct).chart.result[0].meta.previousClose, 50);
});
test('null/空 → 回 null', () => {
  assert.equal(unwrapAllOrigins(null), null);
  assert.equal(unwrapAllOrigins(undefined), null);
});
test('contents 為非法 JSON → 回 null（不丟例外）', () => {
  assert.equal(unwrapAllOrigins({ contents: 'not json{' }), null);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
