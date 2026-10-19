/**
 * 零依賴測試：node src/lib/appVersion.test.mjs
 * 驗證「線上版本是否比執行中的新」判斷。
 */
import assert from 'node:assert';
import { hasNewerVersion, waitForWaitingWorker } from './appVersion.js';

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

// ── waitForWaitingWorker：新 SW 下載完（進入 waiting）才回傳 ──
const atest = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n    ${e.message}`); }
};
const opts = { timeoutMs: 200, intervalMs: 10 };

await atest('已經有 waiting 的 SW → 立即回傳它', async () => {
  const sw = { id: 'new' };
  assert.strictEqual(await waitForWaitingWorker({ waiting: sw }, opts), sw);
});
await atest('新 SW 還在下載 → 等到它進入 waiting 才回傳', async () => {
  const reg = { waiting: null };
  const sw = { id: 'new' };
  setTimeout(() => { reg.waiting = sw; }, 50);
  assert.strictEqual(await waitForWaitingWorker(reg, opts), sw);
});
await atest('逾時仍沒有 waiting → 回傳 null', async () => {
  assert.strictEqual(await waitForWaitingWorker({ waiting: null }, opts), null);
});
await atest('沒有 registration（不支援 SW）→ 回傳 null', async () => {
  assert.strictEqual(await waitForWaitingWorker(null, opts), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
