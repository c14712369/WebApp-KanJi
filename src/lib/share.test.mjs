/**
 * 零依賴測試：node src/lib/share.test.mjs
 * 幫大家付（均分 N 人／自填我的份）：有效花費 spendOf、標籤、patch、批次套用候選。
 */
import assert from 'node:assert';
import { spendOf, isShared, shareLabel, sharePatch } from './share.js';
import { bulkShareTargets } from './shareBulk.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

const T = [{ id: 't_th', name: '泰國', startDate: '2026-10-14', endDate: '2026-10-19', currency: 'THB', groupSize: 6 }];

console.log('spendOf：有效花費');
test('均分 ÷6', () => assert.equal(spendOf({ type: 'expense', amount: 8950, splitN: 6 }), 8950 / 6));
test('自填 0', () => assert.equal(spendOf({ type: 'expense', amount: 166, myShare: 0 }), 0));
test('一般消費＝全額', () => assert.equal(spendOf({ type: 'expense', amount: 120 }), 120));
test('收入不套分攤', () => assert.equal(spendOf({ type: 'income', amount: 500, splitN: 2, myShare: 100 }), 500));
test('服務費跟著交易比例', () => {
  const g = { id: 'gmail_g', type: 'expense', amount: 166, myShare: 0 };
  const f = { id: 'gmail_f', type: 'expense', amount: 3, feeOf: 'gmail_g' };
  const k = { id: 'gmail_k', type: 'expense', amount: 600, splitN: 6 };
  const fk = { id: 'gmail_fk', type: 'expense', amount: 12, feeOf: 'gmail_k' };
  const byId = new Map([g, f, k, fk].map(e => [e.id, e]));
  assert.equal(spendOf(f, { byId }), 0);
  assert.equal(spendOf(fk, { byId }), 2);
  assert.equal(spendOf(fk), 12);   // 沒有 byId 時全額
});
test('服務費指向 amount 為 0 的交易 → 0（不除以 0）', () => {
  const z = { id: 'gmail_z', type: 'expense', amount: 0, splitN: 2 };
  const fz = { id: 'gmail_fz', type: 'expense', amount: 5, feeOf: 'gmail_z' };
  const byId = new Map([[z.id, z], [fz.id, fz]]);
  assert.equal(spendOf(fz, { byId }), 0);
});
test('服務費指向服務費或不存在 → 全額、不當機', () => {
  const a = { id: 'gmail_a', type: 'expense', amount: 10, feeOf: 'gmail_missing' };
  const b = { id: 'gmail_b', type: 'expense', amount: 10, feeOf: 'gmail_a' };
  const byId = new Map([[a.id, a], [b.id, b]]);
  assert.equal(spendOf(a, { byId }), 10);
  assert.equal(spendOf(b, { byId }), 10);
});
test('換算後均分跟著變；自填不變', () => {
  assert.equal(spendOf({ type: 'expense', amount: 1200, splitN: 6 }), 200);
  assert.equal(spendOf({ type: 'expense', amount: 1200, myShare: 320 }), 320);
});
test('空值與 splitN < 2 防禦', () => {
  assert.equal(spendOf(null), 0);
  assert.equal(spendOf({ type: 'expense', amount: 100, splitN: 1 }), 100);
});

console.log('isShared / shareLabel / sharePatch');
test('isShared 判斷', () => {
  assert.equal(isShared({ type: 'expense', amount: 166, myShare: 0 }), true);
  assert.equal(isShared({ type: 'expense', amount: 8950, splitN: 6 }), true);
  assert.equal(isShared({ type: 'expense', amount: 166, splitN: 1 }), false);
  assert.equal(isShared({ type: 'expense', amount: 166 }), false);
  assert.equal(isShared({ type: 'income', amount: 500, splitN: 2 }), false);
  assert.equal(isShared(null), false);
});
test('標籤', () => {
  assert.equal(shareLabel({ amount: 8950, splitN: 6 }), '幫大家付 $8,950 ÷ 6');
  assert.equal(shareLabel({ amount: 166, myShare: 0 }), '幫大家付 $166 · 我的份');
  assert.equal(shareLabel({ amount: 166 }), '');
  assert.equal(shareLabel({ type: 'income', amount: 8950, splitN: 6 }), '');
});
test('sharePatch 互斥', () => {
  assert.deepEqual(sharePatch('split', { n: 6 }), { splitN: 6, myShare: undefined });
  assert.deepEqual(sharePatch('fixed', { myShare: 320 }), { myShare: 320, splitN: undefined });
  assert.deepEqual(sharePatch('fixed', { myShare: 0 }), { myShare: 0, splitN: undefined });
  assert.deepEqual(sharePatch('fixed', { myShare: -5 }), { myShare: 0, splitN: undefined });
  assert.deepEqual(sharePatch('none', {}), { splitN: undefined, myShare: undefined });
  assert.equal(sharePatch('split', { n: 1 }).splitN, 2);
  assert.equal(sharePatch('split', { n: 3.6 }).splitN, 4);
});

console.log('bulkShareTargets：批次套用');
test('批次套用：同一趟同一家、還沒設過、不含服務費與自己', () => {
  const es = [
    { id: 'gmail_1', type: 'expense', amount: 166, date: '2026-10-15', note: '[台新] WWW.GRAB.COMBANGKO', tripId: 't_th', myShare: 0 },
    { id: 'gmail_2', type: 'expense', amount: 144, date: '2026-10-15', note: '[台新] WWW.GRAB.COMBANGKO', tripId: 't_th' },
    { id: 'gmail_3', type: 'expense', amount: 3206, date: '2026-10-16', note: '[台新] WWW.GRAB.COMBANGKO', tripId: 't_th' },
    { id: 'gmail_4', type: 'expense', amount: 3, date: '2026-10-15', note: '[台新] 國外交易服務費', tripId: 't_th', feeOf: 'gmail_2' },
    { id: 'gmail_5', type: 'expense', amount: 75, date: '2026-10-25', note: '[台新] WWW.GRAB.COMBANGKO' },
    { id: 'gmail_6', type: 'expense', amount: 50, date: '2026-10-16', note: '[台新] WWW.GRAB.COMBANGKO', tripId: 't_th', splitN: 3 },
  ];
  assert.deepEqual(bulkShareTargets(es[0], es, T).map(e => e.id), ['gmail_2', 'gmail_3']);
});
test('無旅程、無店名、或收入不觸發批次套用', () => {
  const daily = { id: 'm1', type: 'expense', amount: 100, date: '2026-10-25', note: 'Grab', myShare: 50 };
  const other = { id: 'm2', type: 'expense', amount: 100, date: '2026-10-26', note: 'Grab' };
  assert.deepEqual(bulkShareTargets(daily, [daily, other], T), []);

  const noNote = { id: 'm3', type: 'expense', amount: 100, date: '2026-10-15', note: '', tripId: 't_th', splitN: 2 };
  const noNote2 = { id: 'm4', type: 'expense', amount: 100, date: '2026-10-15', note: '', tripId: 't_th' };
  assert.deepEqual(bulkShareTargets(noNote, [noNote, noNote2], T), []);

  const inc = { id: 'i1', type: 'income', amount: 100, date: '2026-10-15', note: 'Grab', tripId: 't_th' };
  assert.deepEqual(bulkShareTargets(inc, [inc, other], T), []);
});
test('note 含「國外交易服務費」即使沒 feeOf 也排除', () => {
  const base = { id: 'g1', type: 'expense', amount: 166, date: '2026-10-15', note: '國外交易服務費', tripId: 't_th', splitN: 2 };
  const feeLike = { id: 'g2', type: 'expense', amount: 3, date: '2026-10-15', note: '國外交易服務費', tripId: 't_th' };
  assert.deepEqual(bulkShareTargets(base, [base, feeLike], T), []);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
