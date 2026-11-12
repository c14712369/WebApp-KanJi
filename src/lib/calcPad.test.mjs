/**
 * 零依賴測試：node src/lib/calcPad.test.mjs
 * 記一筆抽屜的數字鍵盤：按鍵 → 算式字串、算式求值（先乘除後加減）、顯示格式。
 */
import assert from 'node:assert';
import { pressKey, evaluateExpr, hasOperator, formatExpr, exprFromAmount } from './calcPad.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};
const type = (keys, start = '') => keys.reduce((expr, k) => pressKey(expr, k), start);

console.log('\n[pressKey — 按鍵組成算式]');
test('數字依序接上', () => {
  assert.equal(type(['1', '2', '0']), '120');
});
test('開頭的 0 會被下一個數字取代，不會出現 007', () => {
  assert.equal(type(['0', '0', '7']), '7');
});
test('小數點：空白時補 0、同一個數字只能有一個點', () => {
  assert.equal(type(['.', '5']), '0.5');
  assert.equal(type(['1', '.', '.', '2']), '1.2');
});
test('小數最多 2 位', () => {
  assert.equal(type(['1', '.', '2', '3', '4']), '1.23');
});
test('運算子：開頭不能按、連按會換掉前一個', () => {
  assert.equal(type(['+']), '');
  assert.equal(type(['5', '+', '×']), '5×');
});
test('運算子接在小數點後面時，先去掉多餘的點', () => {
  assert.equal(type(['5', '.', '+']), '5+');
});
test('第二個數字也遵守開頭 0 規則', () => {
  assert.equal(type(['5', '+', '0', '3']), '5+3');
});
test('⌫ 刪最後一個字元，C 清空', () => {
  assert.equal(type(['1', '2', '+', '⌫']), '12');
  assert.equal(type(['1', '2', 'C']), '');
});
test('單一數字最多 9 位整數，避免誤按爆量', () => {
  assert.equal(type(Array(12).fill('9')), '999999999');
});

console.log('\n[evaluateExpr — 求值]');
test('單一數字', () => {
  assert.equal(evaluateExpr('120'), 120);
});
test('加減', () => {
  assert.equal(evaluateExpr('120+35'), 155);
  assert.equal(evaluateExpr('100−30'), 70);
});
test('先乘除後加減', () => {
  assert.equal(evaluateExpr('100+20×3'), 160);
  assert.equal(evaluateExpr('90÷3−5'), 25);
});
test('結尾掛著運算子時忽略它', () => {
  assert.equal(evaluateExpr('120+'), 120);
});
test('除以 0 回傳 0（不讓 Infinity 存進資料）', () => {
  assert.equal(evaluateExpr('5÷0'), 0);
});
test('浮點誤差四捨五入到 2 位', () => {
  assert.equal(evaluateExpr('0.1+0.2'), 0.3);
});
test('空白回 0', () => {
  assert.equal(evaluateExpr(''), 0);
});

console.log('\n[hasOperator / formatExpr / exprFromAmount]');
test('判斷有沒有運算子', () => {
  assert.equal(hasOperator('120'), false);
  assert.equal(hasOperator('120+35'), true);
});
test('顯示時運算子兩側加空白、數字加千分位', () => {
  assert.equal(formatExpr('1200+35'), '1,200 + 35');
  assert.equal(formatExpr('1234.5'), '1,234.5');
});
test('既有金額轉成算式（編輯時帶入）', () => {
  assert.equal(exprFromAmount(185), '185');
  assert.equal(exprFromAmount(0), '');
  assert.equal(exprFromAmount(undefined), '');
  assert.equal(exprFromAmount('12.5'), '12.5');
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
