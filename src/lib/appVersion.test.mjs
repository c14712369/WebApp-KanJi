/**
 * 零依賴測試：node src/lib/appVersion.test.mjs
 * 驗證「線上版本是否比執行中的新」判斷。
 */
import assert from 'node:assert';
import { hasNewerVersion } from './appVersion.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
};

test('線上版本與執行中不同 → 有更新', () => {
  assert.strictEqual(hasNewerVersion('517e9b7', 'a1b2c3d'), true);
});
test('版本相同 → 已是最新', () => {
  assert.strictEqual(hasNewerVersion('517e9b7', '517e9b7'), false);
});
test('任一邊未知 → 不提示', () => {
  assert.strictEqual(hasNewerVersion('517e9b7', ''), false);
  assert.strictEqual(hasNewerVersion('517e9b7', null), false);
  assert.strictEqual(hasNewerVersion('', '517e9b7'), false);
});
test('本機開發版 → 不提示', () => {
  assert.strictEqual(hasNewerVersion('dev', '517e9b7'), false);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
