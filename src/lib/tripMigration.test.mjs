/**
 * 零依賴測試：node src/lib/tripMigration.test.mjs
 * 旅程規則 v2 一次性移轉：保留舊規則歸入旅程、新規則會掉出去的帳單列。
 */
import assert from 'node:assert';
import { summarizeTrip, getTripContext } from './trips.js';
import {
  legacyEntryTripId,
  planTripMigration,
  TRIP_MIGRATION_FLAG,
  TRIP_MIGRATION_SNAPSHOT,
  TRIP_MIGRATION_MAX,
} from './tripMigration.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

console.log('旅程規則改版一次性移轉');

const T = [{ id: 't_tokyo', name: '東京賞楓', startDate: '2026-11-14', endDate: '2026-11-22', currency: 'JPY' }];
const rows = [
  { id: 'm1', type: 'expense', amount: 500, date: '2026-11-15' },                    // 手動：新規則仍歸入 → 不動
  { id: 'live_1', live: true, type: 'expense', amount: 680, date: '2026-11-16' },      // 即時列 → 不動
  { id: 'gmail_t', type: 'expense', amount: 300, date: '2026-11-17' },                // 台幣帳單列：舊歸入、新不歸 → 移轉
  { id: 'gmail_j', type: 'expense', amount: 900, currency: 'JPY', date: '2026-11-18' },// 日圓帳單列 → 不動
  { id: 'gmail_n', type: 'expense', amount: 50, tripId: 'none', date: '2026-11-18' },  // 已排除 → 不動
  { id: 'gmail_i', type: 'income', amount: 9, date: '2026-11-18' },                   // 收入 → 不動
];

test('只移轉舊歸入、新不歸入的列', () => {
  assert.deepEqual(planTripMigration(rows, T, {}), [{ id: 'gmail_t', tripId: 't_tokyo' }]);
});

test('移轉前後東京賞楓總額與筆數不變', () => {
  const before = rows.filter(e => e.type !== 'income' && legacyEntryTripId(e, T) === 't_tokyo');
  const plan = new Map(planTripMigration(rows, T, {}).map(p => [p.id, p.tripId]));
  const after = rows.map(e => plan.has(e.id) ? { ...e, tripId: plan.get(e.id) } : e);
  const s = summarizeTrip(T[0], after, T, [], {});
  assert.equal(s.total, before.reduce((a, e) => a + e.amount, 0));
  assert.equal(s.count, before.length);
});

test('冪等：套用後再算一次是 0 筆', () => {
  const after = rows.map(e => e.id === 'gmail_t' ? { ...e, tripId: 't_tokyo' } : e);
  assert.deepEqual(planTripMigration(after, T, {}), []);
});

test('服務費列跟著被移轉的交易：計畫裡兩筆都有，且套用後總額不變', () => {
  const r = [
    { id: 'gmail_t', type: 'expense', amount: 300, date: '2026-11-17' },
    { id: 'gmail_ft', type: 'expense', amount: 5, date: '2026-11-17', feeOf: 'gmail_t' },
  ];
  const ctx = getTripContext(r, {});
  const plan = planTripMigration(r, T, ctx);
  assert.deepEqual(plan.map(p => p.id).sort(), ['gmail_ft', 'gmail_t']);
  const byId = new Map(plan.map(p => [p.id, p.tripId]));
  const after = r.map(e => byId.has(e.id) ? { ...e, tripId: byId.get(e.id) } : e);
  const s = summarizeTrip(T[0], after, T, [], getTripContext(after, {}));
  assert.equal(s.total, 305);
  assert.equal(s.count, 2);
});

test('tripId 指向已刪除旅程的帳單列：舊規則靠日期歸入 → 要移轉到現在的旅程', () => {
  assert.deepEqual(
    planTripMigration([{ id: 'gmail_g', type: 'expense', amount: 10, date: '2026-11-17', tripId: 't_gone' }], T, {}),
    [{ id: 'gmail_g', tripId: 't_tokyo' }],
  );
});

test('tripId 指向存在的旅程、或是 none 的列不動', () => {
  assert.deepEqual(planTripMigration([
    { id: 'gmail_a', type: 'expense', amount: 10, date: '2026-11-17', tripId: 't_tokyo' },
    { id: 'gmail_b', type: 'expense', amount: 10, date: '2026-11-17', tripId: 'none' },
  ], T, {}), []);
});

test('例外商家的列不移轉', () => {
  const r = [{ id: 'live_7', live: true, type: 'expense', amount: 85, date: '2026-11-17', note: '7-ELEVEN' }];
  // live 列新規則本來就歸旅程；改用手動列確認例外被跳過
  const m = [{ id: 'm7', type: 'expense', amount: 85, date: '2026-11-17', note: '7-ELEVEN' }];
  const g = [{ id: 'gmail_7', type: 'expense', amount: 85, date: '2026-11-17', note: '7-ELEVEN' }];
  assert.deepEqual(planTripMigration(m, T, { exclude: { '7-11': { on: true, at: 1 } } }), []);
  assert.deepEqual(planTripMigration(g, T, { exclude: { '7-11': { on: true, at: 1 } } }), []);
  assert.deepEqual(planTripMigration(r, T, {}), []);
});

test('常數與 legacyEntryTripId 邊界', () => {
  assert.equal(TRIP_MIGRATION_FLAG, 'sub_mgr_trip_rules_v2');
  assert.equal(TRIP_MIGRATION_SNAPSHOT, 'sub_mgr_trip_rules_v2_snapshot');
  assert.equal(TRIP_MIGRATION_MAX, 200);
  assert.equal(legacyEntryTripId({ date: '2026-10-01', tripId: 't_tokyo' }, T), 't_tokyo');
  assert.equal(legacyEntryTripId({ date: '2026-11-17', tripId: 'none' }, T), null);
  assert.equal(legacyEntryTripId({ date: '2026-10-01' }, T), null);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
