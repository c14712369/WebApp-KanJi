/**
 * 零依賴測試：node src/lib/trips.test.mjs
 * 旅程：哪天屬於哪趟、明細歸屬（依日期自動／手動指定／手動排除）、彙總、日期顯示、狀態、驗證。
 */
import assert from 'node:assert';
import {
  tripForDate, entryTripId, summarizeTrip, tripDays, formatTripRange,
  tripStatus, sortTrips, validateTrip, sheetTripDefault, tripIdToSave,
  splitMonthSpend, matchesCatFilter, tripFilterId, groupTripEntries,
  tripPendingId, pendingEntries, getTripContext,
} from './trips.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

const tokyo = { id: 't_tokyo', name: '東京', startDate: '2026-11-14', endDate: '2026-11-22', currency: 'JPY' };
const seoul = { id: 't_seoul', name: '首爾', startDate: '2026-12-28', endDate: '2027-01-02', currency: 'KRW' };
const trips = [tokyo, seoul];

console.log('哪天屬於哪趟');
test('起訖日當天都算', () => {
  assert.equal(tripForDate(trips, '2026-11-14')?.id, 't_tokyo');
  assert.equal(tripForDate(trips, '2026-11-22')?.id, 't_tokyo');
});
test('範圍外 → null', () => {
  assert.equal(tripForDate(trips, '2026-11-13'), null);
  assert.equal(tripForDate(trips, '2026-11-23'), null);
  assert.equal(tripForDate([], '2026-11-15'), null);
});
test('跨年旅程', () => {
  assert.equal(tripForDate(trips, '2027-01-01')?.id, 't_seoul');
});
test('重疊時取較晚出發的那趟', () => {
  const side = { id: 't_side', name: '箱根', startDate: '2026-11-18', endDate: '2026-11-19', currency: 'JPY' };
  assert.equal(tripForDate([tokyo, side], '2026-11-18')?.id, 't_side');
});

console.log('明細歸屬');
test('沒指定 → 依日期自動歸入', () => {
  assert.equal(entryTripId({ date: '2026-11-15' }, trips), 't_tokyo');
  assert.equal(entryTripId({ date: '2026-10-01' }, trips), null);
});
test('手動指定（出發前先付的住宿）→ 跟著指定', () => {
  assert.equal(entryTripId({ date: '2026-10-01', tripId: 't_tokyo' }, trips), 't_tokyo');
});
test('手動排除（旅途中付的家裡帳單）→ 不算', () => {
  assert.equal(entryTripId({ date: '2026-11-15', tripId: 'none' }, trips), null);
});
test('指定的旅程被刪掉 → 退回依日期', () => {
  assert.equal(entryTripId({ date: '2026-11-15', tripId: 't_gone' }, trips), 't_tokyo');
  assert.equal(entryTripId({ date: '2026-10-01', tripId: 't_gone' }, trips), null);
});

console.log('彙總');
const cats = [
  { id: 'lc_food', name: '飲食', color: '#C17B2E' },
  { id: 'lc_stay', name: '住宿', color: '#4A6CB3' },
];
const entries = [
  { id: 'a', type: 'expense', amount: 9000, categoryId: 'lc_stay', date: '2026-10-02', tripId: 't_tokyo' },
  { id: 'b', type: 'expense', amount: 2062, categoryId: 'lc_food', date: '2026-11-15', currency: 'JPY', originalAmount: 10000, fxRate: 0.2062 },
  { id: 'c', type: 'expense', amount: 1031, categoryId: 'lc_food', date: '2026-11-16', currency: 'JPY', originalAmount: 5000, fxRate: 0.2062 },
  { id: 'd', type: 'expense', amount: 300, categoryId: 'lc_food', date: '2026-11-16' },
  { id: 'e', type: 'income', amount: 50000, categoryId: 'lc_inc_salary', date: '2026-11-17' },
  { id: 'f', type: 'expense', amount: 999, categoryId: 'lc_food', date: '2026-11-18', tripId: 'none' },
  { id: 'g', type: 'expense', amount: 500, categoryId: 'lc_food', date: '2026-11-30' },
];
test('只算支出：手動指定＋日期內，排除收入與手動排除', () => {
  const s = summarizeTrip(tokyo, entries, trips, cats);
  assert.equal(s.total, 9000 + 2062 + 1031 + 300);
  assert.equal(s.count, 4);
  assert.deepEqual(s.entries.map(e => e.id), ['c', 'd', 'b', 'a']); // 新到舊
});
test('同一天依金額由大到小（不看記錄順序、不看分類）', () => {
  const day = [
    { id: 'small', type: 'expense', amount: 150, categoryId: 'lc_food', date: '2026-11-19' },
    { id: 'big', type: 'expense', amount: 1915, categoryId: 'lc_stay', date: '2026-11-19' },
    { id: 'mid', type: 'expense', amount: 497, categoryId: 'lc_food', date: '2026-11-19' },
    { id: 'next', type: 'expense', amount: 50, categoryId: 'lc_food', date: '2026-11-20' },
  ];
  assert.deepEqual(summarizeTrip(tokyo, day, trips, cats).entries.map(e => e.id), ['next', 'big', 'mid', 'small']);
});
test('同日同金額 → 依 id，順序固定不跳動', () => {
  const tie = [
    { id: 'b2', type: 'expense', amount: 100, categoryId: 'lc_food', date: '2026-11-19' },
    { id: 'a1', type: 'expense', amount: 100, categoryId: 'lc_food', date: '2026-11-19' },
  ];
  assert.deepEqual(summarizeTrip(tokyo, tie, trips, cats).entries.map(e => e.id), ['a1', 'b2']);
});
test('日均以旅程天數算', () => {
  const s = summarizeTrip(tokyo, entries, trips, cats);
  assert.equal(s.days, 9);
  assert.equal(s.perDay, Math.round(12393 / 9));
});
test('分類由大到小，含占比', () => {
  const s = summarizeTrip(tokyo, entries, trips, cats);
  assert.deepEqual(s.byCategory.map(c => [c.name, c.amount, c.pct]), [['住宿', 9000, 73], ['飲食', 3393, 27]]);
});
test('外幣原幣小計', () => {
  const s = summarizeTrip(tokyo, entries, trips, cats);
  assert.deepEqual(s.foreign, [{ code: 'JPY', original: 15000, twd: 3093 }]);
});
test('分類被刪掉 → 歸到「未分類」', () => {
  const s = summarizeTrip(tokyo, [{ id: 'x', type: 'expense', amount: 100, categoryId: 'gone', date: '2026-11-15' }], trips, cats);
  assert.equal(s.byCategory[0].name, '未分類');
});
test('沒有明細 → 全 0', () => {
  const s = summarizeTrip(seoul, entries, trips, cats);
  assert.equal(s.total, 0);
  assert.equal(s.perDay, 0);
  assert.deepEqual(s.byCategory, []);
});

console.log('日期與狀態');
test('天數含頭尾', () => {
  assert.equal(tripDays(tokyo), 9);
  assert.equal(tripDays(seoul), 6);
  assert.equal(tripDays({ startDate: '2026-11-14', endDate: '2026-11-14' }), 1);
});
test('同年只寫月/日，跨年寫年份', () => {
  assert.equal(formatTripRange(tokyo), '11/14–11/22');
  assert.equal(formatTripRange(seoul), '2026/12/28–2027/1/2');
});
test('進行中／還有幾天／已結束', () => {
  assert.deepEqual(tripStatus(tokyo, '2026-11-20'), { kind: 'ongoing', day: 7 });
  assert.deepEqual(tripStatus(seoul, '2026-12-25'), { kind: 'upcoming', daysUntil: 3 });
  assert.deepEqual(tripStatus(tokyo, '2026-11-24'), { kind: 'past' });
});
test('排序：出發日新到舊', () => {
  assert.deepEqual(sortTrips([tokyo, seoul]).map(t => t.id), ['t_seoul', 't_tokyo']);
});

console.log('驗證');
test('名稱必填、回程不能早於出發', () => {
  assert.deepEqual(validateTrip({ name: ' ', startDate: '2026-11-14', endDate: '2026-11-13' }), {
    name: '請輸入旅程名稱', endDate: '回程不能早於出發日',
  });
  assert.deepEqual(validateTrip({ name: '東京', startDate: '2026-11-14', endDate: '2026-11-14' }), {});
});
test('日期必填', () => {
  assert.deepEqual(validateTrip({ name: '東京', startDate: '', endDate: '' }), {
    startDate: '請選擇出發日', endDate: '請選擇回程日',
  });
});

console.log('記一筆抽屜');
test('新增：日期在旅程內 → 預設該旅程，否則 none', () => {
  assert.equal(sheetTripDefault(trips, '2026-11-15', null), 't_tokyo');
  assert.equal(sheetTripDefault(trips, '2026-10-01', null), 'none');
});
test('編輯：照該筆的歸屬（含依日期自動、手動排除）', () => {
  assert.equal(sheetTripDefault(trips, '2026-11-15', { id: 'x', date: '2026-11-15' }), 't_tokyo');
  assert.equal(sheetTripDefault(trips, '2026-11-15', { id: 'x', date: '2026-11-15', tripId: 'none' }), 'none');
  assert.equal(sheetTripDefault(trips, '2026-10-01', { id: 'x', date: '2026-10-01', tripId: 't_tokyo' }), 't_tokyo');
});
test('存檔：選旅程存 id；選 none 但日期在旅程內 → 存 none（排除）；否則不存', () => {
  assert.equal(tripIdToSave('t_tokyo', trips, '2026-10-01'), 't_tokyo');
  assert.equal(tripIdToSave('none', trips, '2026-11-15'), 'none');
  assert.equal(tripIdToSave('none', trips, '2026-10-01'), undefined);
});

console.log('每月統計：日常與旅程拆開');
const monthCats = [
  { id: 'lc_food', name: '飲食', color: '#C17B2E', icon: 'Utensils' },
  { id: 'lc_trans', name: '交通', color: '#2A6475' },
  { id: 'lc_stay', name: '住宿', color: '#4A6CB3' },
];
const nov = [
  { id: 'n1', type: 'expense', amount: 200, categoryId: 'lc_food', date: '2026-11-03' },
  { id: 'n2', type: 'expense', amount: 2062, categoryId: 'lc_food', date: '2026-11-15', currency: 'JPY', originalAmount: 10000 },
  { id: 'n3', type: 'expense', amount: 619, categoryId: 'lc_trans', date: '2026-11-16' },
  { id: 'n4', type: 'expense', amount: 899, categoryId: 'lc_trans', date: '2026-11-18', tripId: 'none' },
  { id: 'n5', type: 'income', amount: 52000, categoryId: 'lc_inc_salary', date: '2026-11-15' },
  { id: 'n6', type: 'expense', amount: 50, categoryId: 'gone', date: '2026-11-25' },
  { id: 'o1', type: 'expense', amount: 9000, categoryId: 'lc_stay', date: '2026-10-02', tripId: 't_tokyo' },
];
test('日常各分類不含旅程的支出（照分類原順序，只列有花的）', () => {
  const r = splitMonthSpend(nov, trips, '2026-11', monthCats);
  assert.deepEqual(r.daily.map(c => [c.id, c.amount]), [['lc_food', 200], ['lc_trans', 899]]);
  assert.equal(r.uncategorized, 50);
  assert.equal(r.dailyTotal, 200 + 899 + 50);
});
test('旅程合成一行，只算當月日期的支出（10 月先付的住宿算在 10 月）', () => {
  const r = splitMonthSpend(nov, trips, '2026-11', monthCats);
  assert.deepEqual(r.trips, [{ id: 't_tokyo', name: '東京', amount: 2062 + 619 }]);
  assert.equal(r.tripTotal, 2681);
  const oct = splitMonthSpend(nov, trips, '2026-10', monthCats);
  assert.deepEqual(oct.trips, [{ id: 't_tokyo', name: '東京', amount: 9000 }]);
  assert.equal(oct.dailyTotal, 0);
});
test('日常＋旅程 = 當月全部支出', () => {
  const r = splitMonthSpend(nov, trips, '2026-11', monthCats);
  const all = nov.filter(e => e.type !== 'income' && e.date.startsWith('2026-11')).reduce((s, e) => s + e.amount, 0);
  assert.equal(r.dailyTotal + r.tripTotal, all);
});

console.log('分類／旅程篩選');
test('點分類 → 只看日常的該分類（金額才對得上）', () => {
  const ids = nov.filter(e => matchesCatFilter(e, 'lc_food', trips)).map(e => e.id);
  assert.deepEqual(ids, ['n1']);
});
test('點旅程 → 只看該趟', () => {
  const ids = nov.filter(e => matchesCatFilter(e, tripFilterId('t_tokyo'), trips)).map(e => e.id);
  assert.deepEqual(ids, ['n2', 'n3', 'o1']);
});
test('收入不受分類篩選的旅程排除影響', () => {
  assert.equal(matchesCatFilter({ type: 'income', categoryId: 'lc_inc_salary', date: '2026-11-15' }, 'lc_inc_salary', trips), true);
});

console.log('旅程明細：分類篩選＋依日分組');
const tCats = [{ id: 'lc_food', name: '飲食' }, { id: 'lc_stay', name: '住宿' }];
const tEntries = [
  { id: 'a', date: '2026-11-16', amount: 300, categoryId: 'lc_food' },
  { id: 'b', date: '2026-11-16', amount: 5000, categoryId: 'lc_stay' },
  { id: 'c', date: '2026-11-15', amount: 200, categoryId: 'lc_food' },
  { id: 'd', date: '2026-11-15', amount: 90, categoryId: 'gone' },
];
test('不篩選 → 全部，依日分組（新到舊）並算當日小計', () => {
  const g = groupTripEntries(tEntries, null, tCats);
  assert.deepEqual(g.map(x => x.date), ['2026-11-16', '2026-11-15']);
  assert.deepEqual(g.map(x => x.sum), [5300, 290]);
});
test('篩飲食 → 只剩飲食，小計跟著變', () => {
  const g = groupTripEntries(tEntries, 'lc_food', tCats);
  assert.deepEqual(g.flatMap(x => x.items.map(e => e.id)), ['a', 'c']);
  assert.deepEqual(g.map(x => x.sum), [300, 200]);
});
test('分類已刪除的明細 → 歸在「未分類」（__none，同 summarizeTrip）', () => {
  const g = groupTripEntries(tEntries, '__none', tCats);
  assert.deepEqual(g.flatMap(x => x.items.map(e => e.id)), ['d']);
});

console.log('歸屬規則 v2：看來源');
const T = [
  { id: 't_tainan', name: '台南小旅行', startDate: '2026-12-05', endDate: '2026-12-07', currency: 'TWD' },
  { id: 't_tokyo',  name: '東京賞楓',   startDate: '2026-11-14', endDate: '2026-11-22', currency: 'JPY' },
];
const ex = { '7-11': { on: true, at: 1 } };
const X = (o) => ({ type: 'expense', amount: 100, ...o });
test('規則 5：手動列看日期', () => assert.equal(entryTripId(X({ id: 'm1', date: '2026-12-06' }), T), 't_tainan'));
test('規則 6：Apple Pay 台幣列看日期', () => assert.equal(entryTripId(X({ id: 'live_1', live: true, date: '2026-12-06' }), T), 't_tainan'));
test('規則 6：Uber 收據（gmail_ 但 live）', () => assert.equal(entryTripId(X({ id: 'gmail_u', live: true, date: '2026-12-06' }), T), 't_tainan'));
test('規則 6：從即時列換成的帳單列', () => assert.equal(entryTripId(X({ id: 'gmail_s', fromLive: true, date: '2026-12-06' }), T), 't_tainan'));
test('規則 7：日圓帳單列進東京', () => assert.equal(entryTripId(X({ id: 'gmail_j', currency: 'JPY', date: '2026-11-16' }), T), 't_tokyo'));
test('規則 9：美金訂閱在東京期間 → 日常＋待確認', () => {
  const e = X({ id: 'gmail_c', currency: 'USD', date: '2026-11-16', note: '[台新] CLAUDE.AI SUBSCRIPTION' });
  assert.equal(entryTripId(e, T), null); assert.equal(tripPendingId(e, T), 't_tokyo');
});
test('規則 9：台幣帳單列在台南期間 → 日常＋待確認', () => {
  const e = X({ id: 'gmail_t', date: '2026-12-06', note: '[台新] 台灣大哥大' });
  assert.equal(entryTripId(e, T), null); assert.equal(tripPendingId(e, T), 't_tainan');
});
test('規則 8：服務費跟著日圓交易進東京；美金交易的服務費不算', () => {
  const j = X({ id: 'gmail_j', currency: 'JPY', date: '2026-11-16' });
  const fj = X({ id: 'gmail_fj', note: '[台新] 國外交易服務費－680.00', feeOf: 'gmail_j', date: '2026-11-16', amount: 10 });
  const c = X({ id: 'gmail_c', currency: 'USD', date: '2026-11-16' });
  const fc = X({ id: 'gmail_fc', note: '[台新] 國外交易服務費－632.00', feeOf: 'gmail_c', date: '2026-11-16', amount: 9 });
  const ctx = getTripContext([j, fj, c, fc], {});
  assert.equal(entryTripId(fj, T, ctx), 't_tokyo'); assert.equal(entryTripId(fc, T, ctx), null);
  assert.equal(entryTripId(fj, T), null);   // 沒有 byId 就不套第 8 條
});
test('規則 4：台幣 7-11 被例外，不進待確認', () => {
  const e = X({ id: 'live_7', live: true, note: '7-ELEVEN', date: '2026-12-06' });
  const ctx = { exclude: ex };
  assert.equal(entryTripId(e, T, ctx), null); assert.equal(tripPendingId(e, T, ctx), null);
});
test('規則 4：日本 7-11（日圓）不受例外影響', () => {
  assert.equal(entryTripId(X({ id: 'live_8', live: true, note: '7-ELEVEN', currency: 'JPY', date: '2026-11-16' }), T, { exclude: ex }), 't_tokyo');
});
test("規則 1：tripId 'none' 的帳單列不進待確認", () => {
  assert.equal(tripPendingId(X({ id: 'gmail_n', tripId: 'none', date: '2026-12-06' }), T), null);
});
test('收入不算旅程也不待確認', () => {
  const e = { id: 'gmail_i', type: 'income', amount: 100, date: '2026-12-06' };
  assert.equal(entryTripId(e, T), null); assert.equal(tripPendingId(e, T), null);
});
test('待確認的帳單列在每月統計算日常', () => {
  const r = splitMonthSpend([X({ id: 'gmail_t', date: '2026-12-06', categoryId: 'c1' })], T, '2026-12', [{ id: 'c1', name: '通訊' }]);
  assert.equal(r.dailyTotal, 100); assert.equal(r.tripTotal, 0);
});
test('getTripContext 參照沒變就回傳同一個物件', () => {
  const es = [], exc = {}; assert.equal(getTripContext(es, exc), getTripContext(es, exc));
});
test('從旅程記一筆：新增時照 initial.tripId 預設', () => {
  assert.equal(sheetTripDefault(T, '2026-10-01', { type: 'expense', tripId: 't_tokyo' }), 't_tokyo');
});
test('pendingEntries 只列台南期間的台幣帳單列，新到舊', () => {
  const es = [
    { id: 'gmail_a', type: 'expense', amount: 599, date: '2026-12-05' },
    { id: 'gmail_b', type: 'expense', amount: 85, date: '2026-12-06' },
    { id: 'gmail_c', type: 'expense', amount: 85, date: '2026-12-06', tripId: 'none' },
    { id: 'live_d', live: true, type: 'expense', amount: 85, date: '2026-12-06' },
  ];
  assert.deepEqual(pendingEntries(T[0], es, T).map(e => e.id), ['gmail_b', 'gmail_a']);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
