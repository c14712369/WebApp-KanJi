/**
 * 零依賴測試：node src/lib/monthCompare.test.mjs
 * 生活費「較上月」：本月還沒過完時，要拿上月「同一段日子」比，不能拿本月至今比上月整月
 * （否則每個月上半月都會顯示大降，是假的好消息）。
 */
import assert from 'node:assert';
import { lifeMonthOverMonth } from './monthCompare.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

const exp = (date, amount, extra = {}) => ({ id: date + amount, type: 'expense', date, amount, ...extra });

console.log('本月（還沒過完）');
test('只拿上月 1 日到同一天比：上月 24 日後的花費不算', () => {
  const list = [
    exp('2026-10-05', 1000), exp('2026-10-20', 1000), exp('2026-10-28', 8000), // 10/28 在同期之外
    exp('2026-11-03', 1500), exp('2026-11-20', 1500),
  ];
  const r = lifeMonthOverMonth(list, '2026-11', '2026-11-24');
  assert.equal(r.label, '較上月同期');
  assert.equal(r.delta, 1000);           // 3000 − 2000
  assert.equal(r.pct, 50);
  assert.equal(r.up, true);
  assert.equal(r.range, '1–24 日');
});
test('今天是 31 日、上月只有 30 天 → 上月算整月', () => {
  const list = [exp('2026-11-30', 3000), exp('2026-12-31', 3000)];
  const r = lifeMonthOverMonth(list, '2026-12', '2026-12-31');
  assert.equal(r.delta, 0);
  assert.equal(r.up, false);
});
test('收入不算', () => {
  const list = [exp('2026-10-02', 1000), exp('2026-11-02', 1000), exp('2026-11-02', 50000, { type: 'income' })];
  const r = lifeMonthOverMonth(list, '2026-11', '2026-11-24');
  assert.equal(r.delta, 0);
});

console.log('過去的月份（已過完）');
test('整月比整月，標「較上月」', () => {
  const list = [exp('2026-09-10', 2000), exp('2026-09-29', 2000), exp('2026-10-10', 1000)];
  const r = lifeMonthOverMonth(list, '2026-10', '2026-11-24');
  assert.equal(r.label, '較上月');
  assert.equal(r.delta, -3000);
  assert.equal(r.pct, 75);
  assert.equal(r.up, false);
  assert.equal(r.range, null);
});
test('跨年：1 月比前一年 12 月', () => {
  const list = [exp('2025-12-15', 1000), exp('2026-01-15', 1200)];
  const r = lifeMonthOverMonth(list, '2026-01', '2026-11-24');
  assert.equal(r.delta, 200);
  assert.equal(r.pct, 20);
});

console.log('不顯示的情況');
test('上月（同期）沒有花費 → null（沒得比）', () => {
  const list = [exp('2026-10-28', 5000), exp('2026-11-03', 1000)];
  assert.equal(lifeMonthOverMonth(list, '2026-11', '2026-11-24'), null);
});
test('未來的月份 → null', () => {
  assert.equal(lifeMonthOverMonth([exp('2026-11-01', 100), exp('2026-12-01', 100)], '2026-12', '2026-11-24'), null);
});
test('資料是空的或怪的也不會壞', () => {
  assert.equal(lifeMonthOverMonth(null, '2026-11', '2026-11-24'), null);
  assert.equal(lifeMonthOverMonth([{ type: 'expense' }, exp('2026-10-01', 'abc')], '2026-11', '2026-11-24'), null);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed) { console.log('有測試失敗 ❌'); process.exit(1); }
console.log('全部通過 ✅');
