/**
 * 零依賴測試：node src/lib/autoCategory.test.mjs
 * 驗證：即時列同步合併、分類學習規則、本月花費速度估算。
 */
import assert from 'node:assert';
import { isImportedId, mergeLifeExpenses, mergeMerchantRules } from './syncMerge.js';
import { merchantKey, learnCategory } from './merchantRules.js';
import { computeSpendPace } from './spendPace.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

console.log('\n[即時列同步]');
test('live_ 前綴也是匯入列（雲端為準）', () => { assert.equal(isImportedId('live_abc'), true); });
test('使用者改過分類（_catLocked）的匯入列，合併時保留本地分類', () => {
  const local = [{ id: 'gmail_1', categoryId: 'lc_food', _catLocked: true, amount: 50 }];
  const cloud = [{ id: 'gmail_1', categoryId: 'lc_other', amount: 50 }];
  const out = mergeLifeExpenses(local, cloud);
  assert.equal(out.length, 1);
  assert.equal(out[0].categoryId, 'lc_food');
  assert.equal(out[0]._catLocked, true);
});
test('雲端已刪除（被帳單取代）的即時列，本地也移除', () => {
  const local = [{ id: 'live_1', amount: 50 }, { id: 'gmail_s', amount: 50 }];
  const cloud = [{ id: 'gmail_s', amount: 50 }];
  assert.deepEqual(mergeLifeExpenses(local, cloud).map(e => e.id), ['gmail_s']);
});
test('學習規則合併：聯集、本地優先', () => {
  assert.deepEqual(mergeMerchantRules({ a: '1', b: '2' }, { b: 'x', c: '3' }), { a: '1', b: '2', c: '3' });
  assert.deepEqual(mergeMerchantRules(undefined, { c: '3' }), { c: '3' });
});

console.log('\n[學習規則]');
test('merchantKey 去銀行標籤、支付前綴、分店尾巴', () => {
  assert.equal(merchantKey('[玉山] 全家 板橋店'), merchantKey('全家-信義店'));
  assert.equal(merchantKey('連加*UBER EATS'), 'ubereats');
  assert.equal(merchantKey('全家板橋店'), '全家板橋店'); // 沒分隔符不亂砍
});
test('learnCategory：記規則、鎖定該筆、同店其他「其他」匯入列一起改', () => {
  const rows = [
    { id: 'gmail_1', note: '[玉山] 路易莎 板橋店', categoryId: 'lc_other', type: 'expense' },
    { id: 'gmail_2', note: '[台新] 路易莎 信義店', categoryId: 'lc_other', type: 'expense' },
    { id: 'gmail_3', note: '[台新] 路易莎 信義店', categoryId: 'lc_ent', type: 'expense' },   // 已有非其他分類，不動
    { id: 'manual', note: '路易莎', categoryId: 'lc_other', type: 'expense' },                // 手動列不動
  ];
  const { rows: out, rules, affected } = learnCategory(rows, {}, 'gmail_1', 'lc_food', 'lc_other');
  assert.equal(rules[merchantKey('路易莎')], 'lc_food');
  assert.deepEqual(out.map(r => r.categoryId), ['lc_food', 'lc_food', 'lc_ent', 'lc_other']);
  assert.equal(out[0]._catLocked, true);
  assert.equal(affected, 1);
  assert.equal(rows[1].categoryId, 'lc_other', '不可改到原陣列');
});
test('learnCategory：手動列不產生規則', () => {
  const { rules } = learnCategory([{ id: 'm', note: 'x', categoryId: 'a' }], {}, 'm', 'b', 'o');
  assert.deepEqual(rules, {});
});

console.log('\n[本月花費速度]');
// 基準月 2026-09，今天 9/10（第 10 天，共 30 天）
const hist = [];
for (const ym of ['2026-05', '2026-06', '2026-07']) {                    // m-2..m-4 平均：每月刷卡 3000
  hist.push({ id: 'gmail_' + ym, date: ym + '-15', amount: 3000, type: 'expense' });
}
hist.push({ id: 'gmail_aug', date: '2026-08-15', amount: 99999, type: 'expense' }); // m-1 可能不完整，不採用
test('預估未入帳 = 歷史日均刷卡 × 已過天數 − 本月已入帳刷卡', () => {
  const rows = [...hist, { id: 'live_1', date: '2026-09-03', amount: 400, type: 'expense' }, { id: 'm1', date: '2026-09-02', amount: 200, type: 'expense' }];
  const p = computeSpendPace({ rows, ym: '2026-09', today: '2026-09-10', income: 30000, spent: 600, fixed: 5000 });
  assert.equal(p.isCurrentMonth, true);
  assert.equal(p.unbilledEstimate, 600);   // 3000/30*10 = 1000 − 400
  assert.equal(p.daysLeft, 21);            // 含今天
  assert.equal(p.remain, 30000 - 600 - 5000 - 600);
  assert.equal(p.dailyAllowance, Math.floor(p.remain / 21));
});
test('燈號：花費比例遠超時間進度 → tight / over', () => {
  const ok = computeSpendPace({ rows: [], ym: '2026-09', today: '2026-09-15', income: 30000, spent: 12000, fixed: 0 });
  assert.equal(ok.status, 'ok');
  const tight = computeSpendPace({ rows: [], ym: '2026-09', today: '2026-09-10', income: 30000, spent: 18000, fixed: 0 });
  assert.equal(tight.status, 'tight');
  const over = computeSpendPace({ rows: [], ym: '2026-09', today: '2026-09-10', income: 30000, spent: 31000, fixed: 0 });
  assert.equal(over.status, 'over');
  assert.equal(over.dailyAllowance, 0);
});
test('非本月：不估未入帳、不算每日可花', () => {
  const p = computeSpendPace({ rows: hist, ym: '2026-08', today: '2026-09-10', income: 30000, spent: 1000, fixed: 0 });
  assert.equal(p.isCurrentMonth, false);
  assert.equal(p.unbilledEstimate, 0);
  assert.equal(p.dailyAllowance, null);
});
test('沒有歷史刷卡資料 → 估算 0，不報錯', () => {
  const p = computeSpendPace({ rows: [], ym: '2026-09', today: '2026-09-10', income: 0, spent: 0, fixed: 0 });
  assert.equal(p.unbilledEstimate, 0);
  assert.equal(p.status, 'none');
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed) { console.log('有測試失敗 ❌'); process.exit(1); } else console.log('全部通過 ✅');
