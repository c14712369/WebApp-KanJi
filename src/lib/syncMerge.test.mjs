/**
 * 零依賴測試：node src/lib/syncMerge.test.mjs
 * 驗證雲端/本地合併邏輯——GAS 匯入列（gmail_）以雲端為準，手動列以本地為準。
 */
import assert from 'node:assert';
import { isImportedId, mergeLifeExpenses } from './syncMerge.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};
const ids = (arr) => arr.map(e => e.id).sort();

console.log('\n[isImportedId]');
test('gmail_ 前綴為匯入列', () => { assert.equal(isImportedId('gmail_abc_x'), true); });
test('UUID 手動列非匯入列', () => { assert.equal(isImportedId('c1add534-0776-426f'), false); });
test('非字串安全處理', () => { assert.equal(isImportedId(undefined), false); });

console.log('\n[mergeLifeExpenses]');
test('雲端的 gmail_ 列即使本地沒有也要出現（修復漏看的核心）', () => {
  const local = [{ id: 'manual1', amount: 100 }];
  const cloud = [{ id: 'manual1', amount: 100 }, { id: 'gmail_s_x', amount: 85 }, { id: 'gmail_s_y', amount: 89 }];
  const merged = mergeLifeExpenses(local, cloud);
  assert.deepEqual(ids(merged), ['gmail_s_x', 'gmail_s_y', 'manual1']);
});
test('雲端已刪除的 gmail_ 列，本地殘留也要被移除（雲端為準）', () => {
  const local = [{ id: 'gmail_s_x', amount: 85 }, { id: 'gmail_s_y', amount: 89 }];
  const cloud = [{ id: 'gmail_s_x', amount: 85 }];
  const merged = mergeLifeExpenses(local, cloud);
  assert.deepEqual(ids(merged), ['gmail_s_x']);
});
test('手動列以本地為準（剛編輯的金額優先於雲端舊值）', () => {
  const local = [{ id: 'm1', amount: 200 }];
  const cloud = [{ id: 'm1', amount: 100 }];
  const merged = mergeLifeExpenses(local, cloud);
  assert.equal(merged.find(e => e.id === 'm1').amount, 200);
});
test('本地獨有的手動列要保留（雲端沒有也不丟）', () => {
  const local = [{ id: 'm_local_only', amount: 50 }];
  const cloud = [{ id: 'gmail_s_x', amount: 85 }];
  const merged = mergeLifeExpenses(local, cloud);
  assert.deepEqual(ids(merged), ['gmail_s_x', 'm_local_only']);
});
test('空輸入安全（不丟例外）', () => {
  assert.deepEqual(mergeLifeExpenses(undefined, undefined), []);
  assert.deepEqual(ids(mergeLifeExpenses([], [{ id: 'gmail_s_x' }])), ['gmail_s_x']);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
