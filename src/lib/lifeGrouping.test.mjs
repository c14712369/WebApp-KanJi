/**
 * 零依賴測試：node src/lib/lifeGrouping.test.mjs
 * 驗證「依日期分組」與「分頁時整天不切斷」邏輯。
 */
import assert from 'node:assert';
import { groupEntriesByDay, paginateGroups, noteGroupKey, sortEntries } from './lifeGrouping.js';

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

console.log('\n[noteGroupKey — 備註分群鍵]');
test('取備註第一個詞', () => {
  assert.equal(noteGroupKey('伴手禮 小老闆'), '伴手禮');
});
test('全形空白也當分隔', () => {
  assert.equal(noteGroupKey('伴手禮　芒果乾'), '伴手禮');
});
test('忽略開頭的 [卡名] 標籤、不分大小寫', () => {
  assert.equal(noteGroupKey('[台新 Richart] 7-ELEVEN 台北門市'), '7-eleven');
});
test('空備註回空字串', () => {
  assert.equal(noteGroupKey(''), '');
  assert.equal(noteGroupKey(undefined), '');
});

console.log('\n[sortEntries — 同日同分類：備註相同的黏在一起，依金額排]');
const trip = [
  ['冰沙', 100], ['伴手禮 芒果乾', 555], ['午餐', 210], ['費南雪', 520], ['精油按摩', 2000],
  ['鄭王廟', 200], ['費南雪', 620], ['大皇宮 門票', 500], ['伴手禮 小老闆', 1712],
].map(([note, amount], i) => ({ id: 'e' + i, date: '2026-10-17', type: 'expense', categoryId: 'travel', note, amount }));
test('同備註群組相鄰，群組依最大金額由大到小，群內也由大到小', () => {
  const out = sortEntries(trip, { catOrder: { travel: 0 } });
  assert.deepEqual(out.map(e => `${e.note} ${e.amount}`), [
    '精油按摩 2000', '伴手禮 小老闆 1712', '伴手禮 芒果乾 555', '費南雪 620', '費南雪 520',
    '大皇宮 門票 500', '午餐 210', '鄭王廟 200', '冰沙 100',
  ]);
});
test('不同分類不混群：先依分類順序，再各自分群', () => {
  const out = sortEntries([
    { id: 'a', date: '2026-10-17', type: 'expense', categoryId: 'food', note: '午餐', amount: 900 },
    { id: 'b', date: '2026-10-17', type: 'expense', categoryId: 'travel', note: '午餐', amount: 100 },
    { id: 'c', date: '2026-10-17', type: 'expense', categoryId: 'travel', note: '門票', amount: 300 },
  ], { catOrder: { travel: 0, food: 1 } });
  assert.deepEqual(out.map(e => e.id), ['c', 'b', 'a']);
});
test('同一天收入在支出前', () => {
  const out = sortEntries([
    { id: 'x', date: '2026-10-17', type: 'expense', categoryId: 'food', note: '', amount: 999 },
    { id: 'y', date: '2026-10-17', type: 'income', categoryId: 'salary', note: '', amount: 1 },
  ], { catOrder: { salary: 0, food: 1 } });
  assert.deepEqual(out.map(e => e.id), ['y', 'x']);
});
test('日期依 dir 排序（asc / desc），同日規則不變', () => {
  const rows = [
    { id: 'p', date: '2026-10-01', type: 'expense', categoryId: 't', note: 'a', amount: 1 },
    { id: 'q', date: '2026-10-02', type: 'expense', categoryId: 't', note: 'a', amount: 1 },
  ];
  assert.deepEqual(sortEntries(rows, { catOrder: {}, dir: 'desc' }).map(e => e.id), ['q', 'p']);
  assert.deepEqual(sortEntries(rows, { catOrder: {}, dir: 'asc' }).map(e => e.id), ['p', 'q']);
});
test('不改動輸入陣列', () => {
  const copy = trip.map(e => e.id);
  sortEntries(trip, { catOrder: { travel: 0 } });
  assert.deepEqual(trip.map(e => e.id), copy);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
