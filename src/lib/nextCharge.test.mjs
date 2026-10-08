/**
 * 零依賴測試：node src/lib/nextCharge.test.mjs
 * 驗證固定支出「下次扣款日」計算。
 */
import assert from 'node:assert';
import { getNextCharge, toYmd } from './nextCharge.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
};
const d = (s) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd); };
const ymd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const next = (item, today) => { const r = getNextCharge(item, d(today)); return r && { date: ymd(r.date), daysLeft: r.daysLeft }; };

test('每月：本月扣款日未到 → 本月', () => {
  assert.deepStrictEqual(next({ cycle: 'monthly', startDate: '2023-06-15' }, '2026-10-08'), { date: '2026-10-15', daysLeft: 7 });
});
test('每月：今天就是扣款日 → 今天、0 天', () => {
  assert.deepStrictEqual(next({ cycle: 'monthly', startDate: '2023-06-08' }, '2026-10-08'), { date: '2026-10-08', daysLeft: 0 });
});
test('每月：本月已過 → 下個月', () => {
  assert.deepStrictEqual(next({ cycle: 'monthly', startDate: '2023-06-05' }, '2026-10-08'), { date: '2026-11-05', daysLeft: 28 });
});
test('每月 31 號遇小月 → 該月最後一天', () => {
  assert.deepStrictEqual(next({ cycle: 'monthly', startDate: '2026-01-31' }, '2026-11-01'), { date: '2026-11-30', daysLeft: 29 });
});
test('每年：今年已過 → 明年同日', () => {
  assert.deepStrictEqual(next({ cycle: 'yearly', startDate: '2024-03-20' }, '2026-10-08'), { date: '2027-03-20', daysLeft: 163 });
});
test('每季：以開始月份為錨點', () => {
  // 1/10 起每季 → 1/10, 4/10, 7/10, 10/10
  assert.deepStrictEqual(next({ cycle: 'quarterly', startDate: '2026-01-10' }, '2026-10-08'), { date: '2026-10-10', daysLeft: 2 });
});
test('每兩個月 / 每半年', () => {
  assert.strictEqual(next({ cycle: 'bimonthly', startDate: '2026-02-01' }, '2026-10-08').date, '2026-12-01');
  assert.strictEqual(next({ cycle: 'half-yearly', startDate: '2026-03-01' }, '2026-10-08').date, '2027-03-01');
});
test('每週：下一個同星期', () => {
  // 2026-10-01 是週四 → 下一個週四 10/08（今天）
  assert.deepStrictEqual(next({ cycle: 'weekly', startDate: '2026-10-01' }, '2026-10-08'), { date: '2026-10-08', daysLeft: 0 });
  assert.strictEqual(next({ cycle: 'weekly', startDate: '2026-10-02' }, '2026-10-08').date, '2026-10-09');
});
test('每日 → 今天', () => {
  assert.deepStrictEqual(next({ cycle: 'daily', startDate: '2026-01-01' }, '2026-10-08'), { date: '2026-10-08', daysLeft: 0 });
});
test('尚未開始 → 開始日', () => {
  assert.deepStrictEqual(next({ cycle: 'monthly', startDate: '2026-12-25' }, '2026-10-08'), { date: '2026-12-25', daysLeft: 78 });
});
test('一次性：未來 → 該日；已過 → null', () => {
  assert.strictEqual(next({ cycle: 'fixed', startDate: '2026-10-20' }, '2026-10-08').date, '2026-10-20');
  assert.strictEqual(next({ cycle: 'fixed', startDate: '2026-01-20' }, '2026-10-08'), null);
});
test('下次扣款超過結束日 → null', () => {
  assert.strictEqual(next({ cycle: 'monthly', startDate: '2023-06-05', endDate: '2026-10-31' }, '2026-10-08'), null);
});
test('結束日當天剛好扣款 → 仍算', () => {
  assert.strictEqual(next({ cycle: 'monthly', startDate: '2023-05-31', endDate: '2026-10-31' }, '2026-10-08')?.date ?? null, '2026-10-31');
});
test('沒有開始日 → null', () => {
  assert.strictEqual(next({ cycle: 'monthly' }, '2026-10-08'), null);
});

test('toYmd 用本地時間（不受 UTC 影響）', () => {
  assert.strictEqual(toYmd(new Date(2026, 9, 8, 0, 30)), '2026-10-08');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
