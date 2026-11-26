/**
 * 零依賴測試：node src/lib/tripFx.test.mjs
 * 旅程的舊明細換算：Apple Pay 捷徑把「¥3,200」記成 $3,200，要找出來、依當天匯率換成台幣，並能復原。
 */
import assert from 'node:assert';
import {
  unconvertedTripEntries, planFxConversion, fxRestorePatches, FX_CONVERT_MAX, confirmsTwdOnEdit,
} from './tripFx.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

const tokyo = { id: 't_tokyo', name: '東京', startDate: '2026-11-14', endDate: '2026-11-22', currency: 'JPY' };
const home = { id: 't_home', name: '墾丁', startDate: '2026-12-01', endDate: '2026-12-03', currency: 'TWD' };
const trips = [tokyo, home];

const live = (id, date, amount, extra = {}) => ({ id: 'live_' + id, live: true, type: 'expense', date, amount, note: '店' + id, ...extra });
const manual = (id, date, amount, extra = {}) => ({ id, type: 'expense', date, amount, note: '手記' + id, ...extra });

console.log('找出還沒標幣別的明細');
test('旅程期間的 Apple Pay 列 → 預設勾選', () => {
  const r = unconvertedTripEntries(tokyo, [live('a', '2026-11-15', 3200)], trips);
  assert.equal(r.length, 1);
  assert.equal(r[0].suggested, true);
  assert.equal(r[0].code, 'JPY');
  assert.equal(r[0].original, 3200);
});
test('手記列也列出來但不預設勾（可能真的是台幣）', () => {
  const r = unconvertedTripEntries(tokyo, [manual('m1', '2026-11-16', 500)], trips);
  assert.equal(r.length, 1);
  assert.equal(r[0].suggested, false);
});
test('已標幣別的（外幣或台幣）不列', () => {
  const r = unconvertedTripEntries(tokyo, [
    manual('m1', '2026-11-16', 680, { currency: 'JPY', originalAmount: 3200, fxRate: 0.2125 }),
  ], trips);
  assert.equal(r.length, 0);
});
test('刷卡帳單列（gmail_）本來就是台幣 → 不列', () => {
  const r = unconvertedTripEntries(tokyo, [{ id: 'gmail_x', type: 'expense', date: '2026-11-15', amount: 680 }], trips);
  assert.equal(r.length, 0);
});
test('收入、0 元交通感應、旅程外日期都不列', () => {
  const r = unconvertedTripEntries(tokyo, [
    live('inc', '2026-11-15', 3000, { type: 'income' }),
    live('tap', '2026-11-15', 0, { transit: true }),
    live('out', '2026-11-25', 1200),
  ], trips);
  assert.equal(r.length, 0);
});
test('行前指定這趟的 Apple Pay 列 → 列出但不預設勾（在台灣刷的多半是台幣）', () => {
  const r = unconvertedTripEntries(tokyo, [live('pre', '2026-11-01', 8000, { tripId: 't_tokyo' })], trips);
  assert.equal(r.length, 1);
  assert.equal(r[0].suggested, false);
});
test('手動排除旅程（tripId none）→ 不列', () => {
  const r = unconvertedTripEntries(tokyo, [live('x', '2026-11-15', 999, { tripId: 'none' })], trips);
  assert.equal(r.length, 0);
});
test('例外商家且沒標幣別的 Apple Pay 列：傳 ctx 時不列出；不傳 ctx 時照舊列出', () => {
  const row = live('711', '2026-11-15', 85, { note: '7-ELEVEN' });
  const ctx = { exclude: { '7-11': { on: true, at: 1 } } };
  assert.equal(unconvertedTripEntries(tokyo, [row], trips, ctx).length, 0);
  assert.equal(unconvertedTripEntries(tokyo, [row], trips).length, 1);
});
test('台幣旅程 → 什麼都不列', () => {
  assert.equal(unconvertedTripEntries(home, [live('a', '2026-12-02', 300)], trips).length, 0);
});
test('後端抓不到匯率先記下的外幣列（fxPending）→ 預設勾，用它自己的幣別與原幣', () => {
  const r = unconvertedTripEntries(tokyo, [
    live('p', '2026-11-17', 0, { currency: 'JPY', originalAmount: 1500, fxPending: true }),
  ], trips);
  assert.equal(r.length, 1);
  assert.equal(r[0].suggested, true);
  assert.equal(r[0].original, 1500);
});
test('依日期排序（舊到新）', () => {
  const r = unconvertedTripEntries(tokyo, [live('b', '2026-11-18', 1), live('a', '2026-11-15', 1)], trips);
  assert.deepEqual(r.map(x => x.entry.date), ['2026-11-15', '2026-11-18']);
});

console.log('換算計畫');
const items = unconvertedTripEntries(tokyo, [live('a', '2026-11-15', 3200), live('b', '2026-11-16', 1500)], trips);
test('依各自日期的匯率換成整數台幣，原幣與匯率都留下', () => {
  const plan = planFxConversion(items, { '2026-11-15': 0.2125, '2026-11-16': 0.2133 });
  assert.deepEqual(plan.missingDates, []);
  assert.equal(plan.patches.length, 2);
  const a = plan.patches.find(p => p.id === 'live_a').patch;
  assert.equal(a.amount, 680);
  assert.equal(a.currency, 'JPY');
  assert.equal(a.originalAmount, 3200);
  assert.equal(a.fxRate, 0.2125);
});
test('有一天抓不到匯率 → 列出缺的日期，一筆都不換（不拿猜的匯率）', () => {
  const plan = planFxConversion(items, { '2026-11-15': 0.2125 });
  assert.deepEqual(plan.missingDates, ['2026-11-16']);
  assert.equal(plan.patches.length, 0);
});
test('同一天不同幣別 → 用「幣別|日期」各自的匯率', () => {
  const mixed = [
    { entry: live('j', '2026-11-15', 1000), code: 'JPY', original: 1000 },
    { entry: live('k', '2026-11-15', 10000, { currency: 'KRW', originalAmount: 10000, fxPending: true }), code: 'KRW', original: 10000 },
  ];
  const plan = planFxConversion(mixed, { 'JPY|2026-11-15': 0.2, 'KRW|2026-11-15': 0.023 });
  assert.equal(plan.patches.find(p => p.id === 'live_j').patch.amount, 200);
  assert.equal(plan.patches.find(p => p.id === 'live_k').patch.amount, 230);
});
test('fxPending 換完要清掉記號', () => {
  const pend = unconvertedTripEntries(tokyo, [
    live('p', '2026-11-17', 0, { currency: 'JPY', originalAmount: 1500, fxPending: true }),
  ], trips);
  const p = planFxConversion(pend, { '2026-11-17': 0.2 }).patches[0].patch;
  assert.equal(p.amount, 300);
  assert.equal(p.fxPending, undefined);
  assert.ok('fxPending' in p, '要明確寫 undefined 才會覆蓋掉舊欄位');
});
test('預設勾了但使用者取消的 → 標成確認台幣（currency TWD），之後不再提醒', () => {
  const plan = planFxConversion([items[0]], { '2026-11-15': 0.2125 }, { confirmTwd: [items[1]] });
  assert.equal(plan.patches.length, 2);
  assert.deepEqual(plan.patches.find(p => p.id === 'live_b').patch, { currency: 'TWD' });
  const again = unconvertedTripEntries(tokyo, [live('b', '2026-11-16', 1500, { currency: 'TWD' })], trips);
  assert.equal(again.length, 0);
});
test('確認台幣不包含 fxPending 列（它一定是外幣）', () => {
  const pend = unconvertedTripEntries(tokyo, [
    live('p', '2026-11-17', 0, { currency: 'JPY', originalAmount: 1500, fxPending: true }),
  ], trips);
  const plan = planFxConversion([], {}, { confirmTwd: pend });
  assert.equal(plan.patches.length, 0);
});
test(`超過 ${FX_CONVERT_MAX} 筆 → 標記 tooMany，不產生修改`, () => {
  const many = Array.from({ length: FX_CONVERT_MAX + 1 }, (_, i) => ({ entry: live('n' + i, '2026-11-15', 100), code: 'JPY', original: 100 }));
  const plan = planFxConversion(many, { '2026-11-15': 0.2 });
  assert.equal(plan.tooMany, true);
  assert.equal(plan.patches.length, 0);
});

console.log('編輯時確認台幣');
test('Apple Pay 列在台幣下改了金額（代刷、自己只付 $320）→ 確認是台幣', () => {
  assert.equal(confirmsTwdOnEdit(live('d', '2026-11-19', 1500), 320, 'TWD'), true);
});
test('確認後就不再列入換算提醒', () => {
  const after = live('d', '2026-11-19', 320, { currency: 'TWD' });
  assert.equal(unconvertedTripEntries(tokyo, [after], trips).length, 0);
});
test('只改分類、金額沒動 → 不算確認（可能沒注意到幣別）', () => {
  assert.equal(confirmsTwdOnEdit(live('d', '2026-11-19', 1500), 1500, 'TWD'), false);
});
test('改成外幣存檔 → 不需要標台幣', () => {
  assert.equal(confirmsTwdOnEdit(live('d', '2026-11-19', 1500), 1500, 'JPY'), false);
});
test('手記列、新增的明細 → 不標（本來就不會被提醒）', () => {
  assert.equal(confirmsTwdOnEdit(manual('m', '2026-11-19', 500), 300, 'TWD'), false);
  assert.equal(confirmsTwdOnEdit(null, 300, 'TWD'), false);
});

console.log('復原');
test('復原把金額、幣別欄位改回換算前（原本沒有的欄位清成 undefined）', () => {
  const before = [live('a', '2026-11-15', 3200)];
  const back = fxRestorePatches(before);
  assert.equal(back.length, 1);
  assert.equal(back[0].id, 'live_a');
  assert.equal(back[0].patch.amount, 3200);
  assert.equal(back[0].patch.currency, undefined);
  assert.ok('currency' in back[0].patch && 'fxRate' in back[0].patch && 'originalAmount' in back[0].patch);
});
test('fxPending 列復原後記號也回來', () => {
  const back = fxRestorePatches([live('p', '2026-11-17', 0, { currency: 'JPY', originalAmount: 1500, fxPending: true })]);
  assert.equal(back[0].patch.fxPending, true);
  assert.equal(back[0].patch.currency, 'JPY');
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed) { console.log('有測試失敗 ❌'); process.exit(1); }
console.log('全部通過 ✅');
