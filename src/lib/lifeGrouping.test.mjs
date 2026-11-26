/**
 * 零依賴測試：node src/lib/lifeGrouping.test.mjs
 * 驗證「依日期分組」與「分頁時整天不切斷」邏輯。
 */
import assert from 'node:assert';
import { groupEntriesByDay, paginateGroups, findEntryPage, noteGroupKey, sortEntries, buildMonthCalendar, calendarFocusRow, noteDisplayMap, collapseTripEntries } from './lifeGrouping.js';

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

console.log('\n[findEntryPage — 存檔後跳到那筆所在頁]');
test('找出某筆明細在第幾頁（與 paginateGroups 同規則）', () => {
  const groups = [
    { date: 'd1', entries: [{ id: 'a' }, { id: 'b' }], total: 0 },
    { date: 'd2', entries: [{ id: 'c' }, { id: 'd' }], total: 0 },
    { date: 'd3', entries: [{ id: 'e' }], total: 0 },
  ];
  assert.equal(findEntryPage(groups, 'a', 4), 1);
  assert.equal(findEntryPage(groups, 'd', 4), 1);
  assert.equal(findEntryPage(groups, 'e', 4), 2);
});
test('找不到（被篩選掉或在別的月份）回 null', () => {
  assert.equal(findEntryPage(groupEntriesByDay(sample), 'zzz', 20), null);
  assert.equal(findEntryPage([], 'a', 20), null);
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

console.log('\n[buildMonthCalendar — 月曆資料與記帳紅綠點]');
test('計算當月天數與前置補齊（2026-10 有 31 天，1 號是週四 paddingDays=4）', () => {
  const cal = buildMonthCalendar('2026-10', []);
  assert.equal(cal.paddingDays, 4);
  assert.equal(cal.days.length, 31);
  assert.equal(cal.days[0].date, '2026-10-01');
  assert.equal(cal.days[30].date, '2026-10-31');
  assert.equal(cal.days[0].hasExpense, false);
  assert.equal(cal.days[0].hasIncome, false);
});

test('閏年計算（2024-02 有 29 天，2026-02 有 28 天）', () => {
  const leap = buildMonthCalendar('2024-02', []);
  assert.equal(leap.days.length, 29);
  const nonLeap = buildMonthCalendar('2026-02', []);
  assert.equal(nonLeap.days.length, 28);
});

test('標記支出紅點與合計金額', () => {
  const entries = [
    { id: '1', date: '2026-10-15', amount: 350, type: 'expense' },
    { id: '2', date: '2026-10-15', amount: 50, type: 'expense' },
  ];
  const cal = buildMonthCalendar('2026-10', entries);
  const day15 = cal.days[14];
  assert.equal(day15.hasExpense, true);
  assert.equal(day15.totalExpense, 400);
  assert.equal(day15.hasIncome, false);
});

test('標記收入綠點並排除信用卡回饋金折抵（_linkedExpenseId 不觸發假綠點）', () => {
  const entries = [
    { id: '1', date: '2026-10-20', amount: 50000, type: 'income' },
    { id: '2', date: '2026-10-21', amount: 15, type: 'income', _linkedExpenseId: 'exp-123' }, // 回饋折抵
  ];
  const cal = buildMonthCalendar('2026-10', entries);
  const day20 = cal.days[19];
  const day21 = cal.days[20];
  assert.equal(day20.hasIncome, true);
  assert.equal(day20.totalIncome, 50000);
  assert.equal(day21.hasIncome, false); // 排除回饋金！
  assert.equal(day21.totalIncome, 0);
});

test('同一天同時有支出與真實收入', () => {
  const entries = [
    { id: '1', date: '2026-10-05', amount: 200, type: 'expense' },
    { id: '2', date: '2026-10-05', amount: 3000, type: 'income' },
  ];
  const cal = buildMonthCalendar('2026-10', entries);
  const day5 = cal.days[4];
  assert.equal(day5.hasExpense, true);
  assert.equal(day5.hasIncome, true);
  assert.equal(day5.totalExpense, 200);
  assert.equal(day5.totalIncome, 3000);
});

test('空輸入或格式錯誤安全回退', () => {
  assert.deepEqual(buildMonthCalendar('', []), { paddingDays: 0, days: [] });
  assert.deepEqual(buildMonthCalendar(null, null), { paddingDays: 0, days: [] });
});

console.log('\n[groupEntriesByDay — 收入另計，只有收入的日子不再顯示「合計 $0」]');
test('支出與收入分開加總', () => {
  const g = groupEntriesByDay([
    { id: 's', date: '2026-11-13', amount: 54000, type: 'income' },
    { id: 'x', date: '2026-11-12', amount: 104, type: 'expense' },
    { id: 'y', date: '2026-11-12', amount: 3000, type: 'income' },
  ]);
  assert.equal(g[0].total, 0);
  assert.equal(g[0].incomeTotal, 54000);
  assert.equal(g[1].total, 104);
  assert.equal(g[1].incomeTotal, 3000);
});
test('分別計算支出筆數與收入筆數（只有 1 筆時日期列不顯示合計，避免和那筆金額重複）', () => {
  const g = groupEntriesByDay([
    { id: 'a', date: '2026-11-12', amount: 104, type: 'expense' },
    { id: 'b', date: '2026-11-12', amount: 59, type: 'expense' },
    { id: 'c', date: '2026-11-12', amount: 3000, type: 'income' },
    { id: 'd', date: '2026-11-11', amount: 59, type: 'expense' },
  ]);
  assert.equal(g[0].expenseCount, 2);
  assert.equal(g[0].incomeCount, 1);
  assert.equal(g[1].expenseCount, 1);
  assert.equal(g[1].incomeCount, 0);
});

console.log('\n[noteDisplayMap — 同一家店大小寫不同時統一顯示（只改顯示，不動資料）]');
test('大小寫混用 → 統一用非全大寫的寫法', () => {
  const m = noteDisplayMap([
    { note: '7-ELEVEN' }, { note: '7-ELEVEN' }, { note: '7-Eleven' }, { note: '7-eleven ' },
  ]);
  assert.equal(m.get('7-eleven'), '7-Eleven');
});
test('只有一種寫法 → 原樣（IKEA 不會被改成 Ikea）', () => {
  const m = noteDisplayMap([{ note: 'IKEA' }, { note: 'IKEA' }]);
  assert.equal(m.get('ikea'), 'IKEA');
});
test('都是非全大寫時取出現最多次的', () => {
  const m = noteDisplayMap([{ note: 'Uber Eats' }, { note: 'uber eats' }, { note: 'Uber Eats' }]);
  assert.equal(m.get('uber eats'), 'Uber Eats');
});
test('空備註與非陣列安全', () => {
  assert.equal(noteDisplayMap([{ note: '' }, {}]).size, 0);
  assert.equal(noteDisplayMap(null).size, 0);
});

console.log('\n[calendarFocusRow — 月曆收合成單週時要顯示哪一列]');
// 2026-10：1 號週四（padding 4）、31 天 → 共 5 列
const oct = buildMonthCalendar('2026-10', []);
test('總列數 = ceil((前置空格 + 天數) / 7)', () => {
  assert.equal(calendarFocusRow(oct, '2026-10-01').rows, 5);
  // 2026-08：1 號週六（padding 6）+ 31 天 = 37 → 6 列
  assert.equal(calendarFocusRow(buildMonthCalendar('2026-08', []), null).rows, 6);
});
test('焦點日期所在列（0 起算）', () => {
  assert.equal(calendarFocusRow(oct, '2026-10-01').row, 0);
  assert.equal(calendarFocusRow(oct, '2026-10-03').row, 0); // 週六，第一列最後一格
  assert.equal(calendarFocusRow(oct, '2026-10-04').row, 1); // 週日換列
  assert.equal(calendarFocusRow(oct, '2026-10-31').row, 4);
});
test('焦點不在本月或為空 → 第一列', () => {
  assert.equal(calendarFocusRow(oct, null).row, 0);
  assert.equal(calendarFocusRow(oct, '2026-11-15').row, 0);
});
test('空月曆安全回退', () => {
  assert.deepEqual(calendarFocusRow({ paddingDays: 0, days: [] }, null), { rows: 1, row: 0 });
});

console.log('\n[collapseTripEntries — 日常清單把旅程明細收成一行]');
const T = [{ id: 't_tn', name: '台南小旅行', startDate: '2026-12-05', endDate: '2026-12-07', currency: 'TWD' }];
const E = [
  { id: 'm1', type: 'expense', amount: 300, date: '2026-12-06' },
  { id: 'live_1', live: true, type: 'expense', amount: 85, date: '2026-12-06' },
  { id: 'gmail_t', type: 'expense', amount: 599, date: '2026-12-06', note: '[台新] 台灣大哥大' },
  { id: 'm2', type: 'expense', amount: 1200, date: '2026-12-07' },
  { id: 'i1', type: 'income', amount: 50, date: '2026-12-06' },
];
test('同一天的旅程明細收成一行，金額是加總', () => {
  const out = collapseTripEntries(E, T, {});
  const d6 = out.find(e => e.id === 'tripday_t_tn_2026-12-06');
  assert.equal(d6.amount, 385); assert.equal(d6.count, 2); assert.equal(d6._tripDay, true);
  assert.ok(out.find(e => e.id === 'tripday_t_tn_2026-12-07'));
});
test('待確認的帳單列與收入照常顯示', () => {
  const ids = collapseTripEntries(E, T, {}).map(e => e.id);
  assert.ok(ids.includes('gmail_t')); assert.ok(ids.includes('i1'));
  assert.ok(!ids.includes('m1')); assert.ok(!ids.includes('live_1'));
});
test('當日小計不變', () => {
  const sum = (arr) => arr.filter(e => e.date === '2026-12-06' && e.type !== 'income').reduce((a, e) => a + e.amount, 0);
  assert.equal(sum(collapseTripEntries(E, T, {})), sum(E));
});
test('收合後再分組，合成列在第一筆原本的位置', () => {
  const g = groupEntriesByDay(collapseTripEntries(E, T, {})).find(x => x.date === '2026-12-06');
  assert.equal(g.entries[0].id, 'tripday_t_tn_2026-12-06');
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
