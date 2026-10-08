/**
 * 零依賴測試：node src/lib/projectSpend.test.mjs
 * 驗證專案支出依 projectExpenses 彙總（按年 / 按月）與年份回落。
 */
import assert from 'node:assert';
import { sumProjectExpenses, projectExpensesByMonth, projectExpenseYears, nearestYear } from './projectSpend.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

const projects = [{ id: 'p1', name: '日本旅行' }, { id: 'p2', name: '裝潢' }];
const exps = [
  { id: 'a', projectId: 'p1', amount: 12000, date: '2026-03-02' },
  { id: 'b', projectId: 'p1', amount: '3000', date: '2026-03-20' },
  { id: 'c', projectId: 'p2', amount: 50000, date: '2026-07-01' },
  { id: 'd', projectId: 'p2', amount: 800, date: '2025-12-31' },
  { id: 'e', projectId: 'gone', amount: 99999, date: '2026-03-05' }, // 已刪專案的孤兒明細
  { id: 'f', projectId: 'p1', amount: 'x', date: '2026-03-09' },    // 非數字金額
];

console.log('\n[sumProjectExpenses]');
test('按年加總（排除孤兒、非數字）', () => assert.equal(sumProjectExpenses(projects, exps, 2026), 65000));
test('按月加總', () => assert.equal(sumProjectExpenses(projects, exps, '2026-03'), 15000));
test('跨年不混入', () => assert.equal(sumProjectExpenses(projects, exps, '2025'), 800));
test('空資料為 0', () => {
  assert.equal(sumProjectExpenses([], [], 2026), 0);
  assert.equal(sumProjectExpenses(projects, undefined, 2026), 0);
});
test('不讀 projects[].expenses（舊錯誤來源）', () =>
  assert.equal(sumProjectExpenses([{ id: 'p9', expenses: [{ amount: 5, date: '2026-01-01' }] }], [], 2026), 0));

console.log('\n[projectExpensesByMonth]');
test('12 個月分桶', () => {
  const m = projectExpensesByMonth(projects, exps, 2026);
  assert.equal(m.length, 12);
  assert.equal(m[2], 15000);
  assert.equal(m[6], 50000);
  assert.equal(m.reduce((a, b) => a + b, 0), 65000);
});

console.log('\n[projectExpenseYears]');
test('列出年份（排除孤兒）', () => assert.deepEqual(projectExpenseYears(projects, exps).sort(), ['2025', '2026']));

console.log('\n[nearestYear]');
test('在清單內維持不變', () => assert.equal(nearestYear(['2026', '2024'], '2024'), '2024'));
test('不在清單落到最接近', () => assert.equal(nearestYear(['2026', '2022'], '2023'), '2022'));
test('等距取較新', () => assert.equal(nearestYear(['2026', '2022'], '2024'), '2026'));
test('空清單回 fallback', () => assert.equal(nearestYear([], '2023', '2026'), '2026'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
