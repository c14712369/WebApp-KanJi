/**
 * 零依賴測試：node src/lib/yahooProxy.test.mjs
 * 驗證 allorigins /get 回應的解包（corsproxy.io 失效後改用 allorigins）。
 */
import assert from 'node:assert';
import { unwrapAllOrigins, twSymbolCandidates } from './yahooProxy.js';

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

console.log('\n[twSymbolCandidates]');
test('純數字台股代號 → 補 .TW 再 .TWO（2330 上市）', () => {
  assert.deepEqual(twSymbolCandidates('2330'), ['2330.TW', '2330.TWO']);
});
test('上櫃股 6488 仍會嘗試 .TWO 後備', () => {
  assert.ok(twSymbolCandidates('6488').includes('6488.TWO'));
});
test('帶字母結尾的主動式 ETF 00981A → 補 .TW', () => {
  assert.deepEqual(twSymbolCandidates('00981A'), ['00981A.TW', '00981A.TWO']);
});
test('槓桿 ETF 00631L 不會被字母吃掉', () => {
  assert.deepEqual(twSymbolCandidates('00631L'), ['00631L.TW', '00631L.TWO']);
});
test('已指定 .TWO → 擺前面，.TW 當後備', () => {
  assert.deepEqual(twSymbolCandidates('6488.TWO'), ['6488.TWO', '6488.TW']);
});
test('小寫輸入正規化為大寫', () => {
  assert.deepEqual(twSymbolCandidates('00981a'), ['00981A.TW', '00981A.TWO']);
});
test('美股英文代號 → 原樣（大寫）', () => {
  assert.deepEqual(twSymbolCandidates('aapl'), ['AAPL']);
});
test('空字串 → 空陣列', () => {
  assert.deepEqual(twSymbolCandidates(''), []);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
