/**
 * 零依賴測試：node src/lib/tripActions.test.mjs
 * 旅程操作純函式：服務費判斷、可設例外的店名與顯示標籤、從旅程記一筆的預設草稿。
 */
import assert from 'node:assert';
import { isFeeEntry, exclusionNames, exclusionLabel, tripEntryDraft } from './tripActions.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

console.log('\n[tripActions]');
test('服務費不能設例外', () => {
  assert.deepEqual(exclusionNames({ note: '[台新] 國外交易服務費', feeOf: 'x' }), []);
  assert.equal(isFeeEntry({ note: '[台新] 國外交易服務費', feeOf: 'x' }), true);
  assert.equal(isFeeEntry({ note: '[台新] 國外交易服務費－10' }), true);
  assert.equal(isFeeEntry({ note: '[台新] 統一超商' }), false);
});
test('外幣列不能設例外', () => {
  assert.deepEqual(exclusionNames({ note: '7-ELEVEN', currency: 'JPY' }), []);
  assert.equal(exclusionNames({ note: '7-ELEVEN', currency: 'TWD' }).length, 1);
});
test('帳單列從即時列換來：note 與 liveNote 是同一家就只留一個', () => {
  assert.equal(exclusionNames({ note: '[台新] 統一超商－京發A3709 TAIPEI', liveNote: '7-ELEVEN' }).length, 1);
});
test('帳單列從即時列換來：兩個名字不同家就兩個都留', () => {
  assert.equal(exclusionNames({ note: '[台新] 某某小吃', liveNote: 'MOUMOU CAFE' }).length, 2);
});
test('顯示店名優先用 liveNote，去掉銀行前綴', () => {
  assert.equal(exclusionLabel({ note: '[台新] 統一超商', liveNote: '7-ELEVEN' }), '7-ELEVEN');
  assert.equal(exclusionLabel({ note: '[台新] 台灣大哥大' }), '台灣大哥大');
});
test('從旅程記一筆的日期：已結束用回程日，其他用今天', () => {
  const t = { id: 't', startDate: '2026-12-05', endDate: '2026-12-07' };
  assert.equal(tripEntryDraft(t, '2026-12-20').date, '2026-12-07');
  assert.equal(tripEntryDraft(t, '2026-12-06').date, '2026-12-06');
  assert.equal(tripEntryDraft(t, '2026-11-30').date, '2026-11-30');
  assert.equal(tripEntryDraft(t, '2026-12-06').tripId, 't');
  assert.equal(tripEntryDraft(t, '2026-12-06').type, 'expense');
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
