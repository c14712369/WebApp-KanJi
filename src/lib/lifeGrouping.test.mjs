/**
 * 零依賴測試：node src/lib/lifeGrouping.test.mjs
 * 驗證「依日期分組」與「分頁時整天不切斷」邏輯。
 */
import assert from 'node:assert';
import { groupEntriesByDay, paginateGroups } from './lifeGrouping.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

// 已過濾+排序好的明細（date-desc）
const sample = [
  { id: 'a', date: '2026-05-02', amount: 75, type: 'expense' },
  { id: 'b', date: '2026-05-01', amount: 989, type: 'expense' },
  { id: 'c', date: '2026-05-01', amount: 15, type: 'expense' },
  { id: 'd', date: '2026-05-01', amount: 89, type: 'expense' },
  { id: 'e', date: '2026-05-01', amount: 85, type: 'expense' },
];

console.log('\n[groupEntriesByDay]');
test('依日期分組，保留輸入排序', () => {
  const g = groupEntriesByDay(sample);
  assert.deepEqual(g.map(x => x.date), ['2026-05-02', '2026-05-01']);
});
test('5/1 一組含四筆', () => {
  const g = groupEntriesByDay(sample);
  assert.equal(g[1].entries.length, 4);
});
test('每組計算當日支出合計', () => {
  const g = groupEntriesByDay(sample);
  assert.equal(g[1].total, 989 + 15 + 89 + 85);
});
test('收入不計入支出合計', () => {
  const g = groupEntriesByDay([
    { id: 'x', date: '2026-05-01', amount: 100, type: 'expense' },
    { id: 'y', date: '2026-05-01', amount: 48000, type: 'income' },
  ]);
  assert.equal(g[0].total, 100);
  assert.equal(g[0].entries.length, 2); // 收入仍列出
});

console.log('\n[paginateGroups — 整天不切斷]');
test('同一天四筆不會被分頁切開（targetSize=3 仍整組留同頁）', () => {
  const groups = groupEntriesByDay(sample); // [05-02(1), 05-01(4)]
  // targetSize=3：05-02(1筆) 一頁；05-01(4筆) 超過 3 但不可拆 → 整組獨立一頁
  const p1 = paginateGroups(groups, 1, 3);
  const p2 = paginateGroups(groups, 2, 3);
  assert.deepEqual(p1.pageGroups.map(g => g.date), ['2026-05-02']);
  assert.deepEqual(p2.pageGroups.map(g => g.date), ['2026-05-01']);
  assert.equal(p2.pageGroups[0].entries.length, 4); // 四筆完整在同一頁
  assert.equal(p1.totalPages, 2);
});
test('多天湊滿 targetSize 才換頁', () => {
  const groups = [
    { date: 'd1', entries: [{}, {}], total: 0 },
    { date: 'd2', entries: [{}, {}], total: 0 },
    { date: 'd3', entries: [{}], total: 0 },
  ];
  // targetSize=4：d1(2)+d2(2)=4 第一頁；d3 第二頁
  const p1 = paginateGroups(groups, 1, 4);
  assert.deepEqual(p1.pageGroups.map(g => g.date), ['d1', 'd2']);
  assert.equal(p1.totalPages, 2);
});
test('page 超出範圍回空陣列', () => {
  const groups = groupEntriesByDay(sample);
  assert.deepEqual(paginateGroups(groups, 99, 20).pageGroups, []);
});
test('空輸入安全', () => {
  assert.deepEqual(groupEntriesByDay([]), []);
  assert.equal(paginateGroups([], 1, 20).totalPages, 1);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
