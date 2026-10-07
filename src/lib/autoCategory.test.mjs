/**
 * 零依賴測試：node src/lib/autoCategory.test.mjs
 * 驗證：即時列同步合併、分類學習規則、本月花費速度。
 */
import assert from 'node:assert';
import { isImportedId, mergeLifeExpenses, mergeMerchantRules } from './syncMerge.js';
import { merchantKey, learnCategory } from './merchantRules.js';
import { computeSpendPace } from './spendPace.js';
import { normalizeSalaryConfig, shouldApplySalaryToMonth, salaryDateForMonth, planSalaryUpdates } from './salarySchedule.js';

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
test('結餘與每日可花只扣實際支出及固定支出', () => {
  const p = computeSpendPace({ ym: '2026-09', today: '2026-09-10', income: 30000, spent: 600, fixed: 5000 });
  assert.equal(p.isCurrentMonth, true);
  assert.equal('unbilledEstimate' in p, false);
  assert.equal(p.daysLeft, 21);            // 含今天
  assert.equal(p.remain, 30000 - 600 - 5000);
  assert.equal(p.dailyAllowance, Math.floor(p.remain / 21));
});
test('燈號：花費比例遠超時間進度 → tight / over', () => {
  const ok = computeSpendPace({ ym: '2026-09', today: '2026-09-15', income: 30000, spent: 12000, fixed: 0 });
  assert.equal(ok.status, 'ok');
  const tight = computeSpendPace({ ym: '2026-09', today: '2026-09-10', income: 30000, spent: 18000, fixed: 0 });
  assert.equal(tight.status, 'tight');
  const over = computeSpendPace({ ym: '2026-09', today: '2026-09-10', income: 30000, spent: 31000, fixed: 0 });
  assert.equal(over.status, 'over');
  assert.equal(over.dailyAllowance, 0);
});
test('非本月：不算每日可花', () => {
  const p = computeSpendPace({ ym: '2026-08', today: '2026-09-10', income: 30000, spent: 1000, fixed: 0 });
  assert.equal(p.isCurrentMonth, false);
  assert.equal(p.dailyAllowance, null);
});
test('沒有收入時狀態為 none', () => {
  const p = computeSpendPace({ ym: '2026-09', today: '2026-09-10', income: 0, spent: 0, fixed: 0 });
  assert.equal(p.status, 'none');
});

console.log('\n[薪資生效月份]');
test('舊薪資設定只從目前月份開始，不回補過往月份', () => {
  const config = normalizeSalaryConfig({ amount: 52000, catId: 'lc_inc_salary', day: 5 }, '2026-10');
  assert.equal(config.effectiveFrom, '2026-10');
  assert.equal(shouldApplySalaryToMonth(config, '2026-09', '2026-10'), false);
  assert.equal(shouldApplySalaryToMonth(config, '2026-10', '2026-10'), true);
});
test('有生效月份的薪資設定只套用該月與未來月份', () => {
  const config = { amount: 52000, catId: 'lc_inc_salary', day: 5, effectiveFrom: '2026-08' };
  assert.equal(shouldApplySalaryToMonth(config, '2026-07', '2026-10'), false);
  assert.equal(shouldApplySalaryToMonth(config, '2026-08', '2026-10'), true);
  assert.equal(shouldApplySalaryToMonth(config, '2026-11', '2026-10'), true);
});
test('入帳日遇週末提前到週五', () => {
  assert.equal(salaryDateForMonth('2026-10', 5), '2026-10-05');   // 週一
  assert.equal(salaryDateForMonth('2026-09', 5), '2026-09-04');   // 9/5 週六 → 週五
  assert.equal(salaryDateForMonth('2026-07', 5), '2026-07-03');   // 7/5 週日 → 週五
});
test('改薪資只更新當月與之後的自動薪資，過往月份不動', () => {
  const prev = { amount: 50000, catId: 'lc_inc_salary', day: 5 };
  const next = { amount: 52000, catId: 'lc_inc_salary', day: 5 };
  const expenses = [
    { id: 'a', date: '2026-09-04', amount: 50000, categoryId: 'lc_inc_salary', _autoSalary: true },
    { id: 'b', date: '2026-10-05', amount: 50000, categoryId: 'lc_inc_salary', _autoSalary: true },
    { id: 'c', date: '2026-11-05', amount: 50000, categoryId: 'lc_inc_salary', _autoSalary: true },
  ];
  const plan = planSalaryUpdates(expenses, prev, next, '2026-10');
  assert.deepEqual(plan.map(p => p.id), ['b', 'c']);
  assert.deepEqual(plan[0].patch, { amount: 52000, categoryId: 'lc_inc_salary', date: '2026-10-05' });
});
test('使用者手動改過的自動薪資（_salaryManual）與一般收入不被覆蓋', () => {
  const prev = { amount: 50000, catId: 'lc_inc_salary', day: 5 };
  const next = { amount: 52000, catId: 'lc_inc_salary', day: 5 };
  const expenses = [
    { id: 'b', date: '2026-10-05', amount: 61000, categoryId: 'lc_inc_salary', _autoSalary: true, _salaryManual: true },
    { id: 'm', date: '2026-10-05', amount: 50000, categoryId: 'lc_inc_salary' },
  ];
  assert.deepEqual(planSalaryUpdates(expenses, prev, next, '2026-10'), []);
});
test('設定與當月自動薪資金額早已不一致時，儲存仍會更新當月', () => {
  // 修正前存過設定：設定已是 52000，當月明細卻停在 50000
  const prev = { amount: 52000, catId: 'lc_inc_salary', day: 5 };
  const next = { amount: 55000, catId: 'lc_inc_salary', day: 5 };
  const expenses = [
    { id: 'b', date: '2026-10-05', amount: 50000, categoryId: 'lc_inc_salary', _autoSalary: true },
  ];
  assert.deepEqual(planSalaryUpdates(expenses, prev, next, '2026-10').map(p => p.id), ['b']);
});
test('第一次設定薪資（沒有舊設定）也會更新當月既有的自動薪資', () => {
  const next = { amount: 55000, catId: 'lc_inc_salary', day: 5 };
  const expenses = [
    { id: 'b', date: '2026-10-05', amount: 50000, categoryId: 'lc_inc_salary', _autoSalary: true },
  ];
  assert.deepEqual(planSalaryUpdates(expenses, null, next, '2026-10').map(p => p.id), ['b']);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed) { console.log('有測試失敗 ❌'); process.exit(1); } else console.log('全部通過 ✅');
