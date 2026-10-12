/**
 * 零依賴測試：node src/lib/wealthPlan.test.mjs
 * 驗證持股比重、貸款月付、人生目標規劃（買車/買房/退休）回推每月要存多少。
 */
import assert from 'node:assert';
import { holdingAllocation, loanPayment, retirementNeed, simulatePlan, solveMonthlyBudget } from './wealthPlan.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
};
const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('比重：依市值算百分比、大到小排序', () => {
  const r = holdingAllocation([
    { id: 'a', symbol: 'A', shares: 10, lastPrice: 10 },   // 100
    { id: 'b', symbol: 'B', shares: 3,  lastPrice: 100 },  // 300
  ]);
  assert.deepStrictEqual(r.map(x => x.id), ['b', 'a']);
  near(r[0].pct, 75, 0.001); near(r[1].pct, 25, 0.001);
});
test('比重：沒股價的不列入', () => {
  const r = holdingAllocation([{ id: 'a', shares: 10, lastPrice: 10 }, { id: 'b', shares: 5, lastPrice: null }]);
  assert.deepStrictEqual(r.map(x => x.id), ['a']);
});
test('比重：全部沒市值 → 空陣列', () => {
  assert.deepStrictEqual(holdingAllocation([{ id: 'a', shares: 1, lastPrice: 0 }]), []);
});

test('貸款月付：本息平均攤還（1,000 萬、2%、30 年 ≈ 36,962）', () => {
  near(loanPayment(10_000_000, 2, 30), 36_961.6, 1);
});
test('貸款月付：利率 0 → 本金平均', () => {
  near(loanPayment(1_200_000, 0, 10), 10_000, 0.001);
});
test('貸款月付：沒貸款 → 0', () => {
  assert.strictEqual(loanPayment(0, 2, 30), 0);
});

const base = { inv0: 0, cash0: 0, invRate: 0, cashRate: 0, invShare: 0.5, goals: [], retire: null };

test('退休金：無通膨無報酬 → 每月缺口 × 月數', () => {
  // 30 歲 → 60 退休 → 活到 80；每月花 3 萬、勞保勞退 1 萬 → 缺 2 萬 × 240 月
  const need = retirementNeed({ age: 30, retireAge: 60, lifeAge: 80, monthlySpend: 30_000, pension: 10_000, inflation: 0, postReturn: 0 }, []);
  near(need, 20_000 * 240, 0.01);
});
test('退休金：有通膨 → 比沒通膨多', () => {
  const r = { age: 30, retireAge: 60, lifeAge: 80, monthlySpend: 30_000, pension: 0, postReturn: 0 };
  assert.ok(retirementNeed({ ...r, inflation: 2 }, []) > retirementNeed({ ...r, inflation: 0 }, []));
});

test('單一目標無貸款：0 報酬下每月要存 = 現金 ÷ 月數', () => {
  const p = { ...base, goals: [{ id: 'g', name: '車', years: 5, cash: 600_000, loan: 0, loanRate: 0, loanYears: 0 }] };
  near(solveMonthlyBudget(p).budget, 10_000, 1);
});
test('現有資產已夠 → 每月 0', () => {
  const p = { ...base, cash0: 1_000_000, goals: [{ id: 'g', name: '車', years: 5, cash: 500_000, loan: 0, loanRate: 0, loanYears: 0 }] };
  assert.strictEqual(solveMonthlyBudget(p).budget, 0);
});
test('貸款從每月預算扣：要存的錢剛好夠付頭期與之後的月付', () => {
  // 1 年後頭期 12 萬 + 貸 12 萬（0 利率、1 年），之後無目標
  // 月預算 B：前 12 月存 12B ≥ 12 萬 → B ≥ 1 萬；之後 12 月要付 1 萬/月 → B ≥ 1 萬
  const p = { ...base, goals: [{ id: 'g', name: '車', years: 1, cash: 120_000, loan: 120_000, loanRate: 0, loanYears: 1 }] };
  near(solveMonthlyBudget(p).budget, 10_000, 1);
});
test('解出的預算照跑模擬：每個目標都付得出、退休時剛好夠', () => {
  const p = {
    inv0: 640_000, cash0: 300_000, invRate: 7, cashRate: 1.5, invShare: 0.6,
    goals: [
      { id: 'car',   name: '買車', years: 5,  cash: 500_000,   loan: 1_500_000,  loanRate: 3,   loanYears: 5 },
      { id: 'house', name: '買房', years: 10, cash: 3_000_000, loan: 17_000_000, loanRate: 2.2, loanYears: 30 },
    ],
    retire: { age: 30, retireAge: 65, lifeAge: 85, monthlySpend: 40_000, pension: 20_000, inflation: 2, postReturn: 3 },
  };
  const { budget } = solveMonthlyBudget(p);
  const ok  = simulatePlan({ ...p, budget });
  const bad = simulatePlan({ ...p, budget: budget - 200 });
  assert.ok(ok.ok, '算出的預算應可行');
  assert.ok(!bad.ok, '少 200 元應不可行（代表解是最小值）');
  near(ok.atRetire, ok.need, ok.need * 0.01 + 50_000);
});
test('付不出頭期 → 記下失敗的目標', () => {
  const p = { ...base, budget: 0, goals: [{ id: 'g', name: '車', years: 1, cash: 100, loan: 0, loanRate: 0, loanYears: 0 }] };
  const r = simulatePlan(p);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.failGoal, 'g');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
