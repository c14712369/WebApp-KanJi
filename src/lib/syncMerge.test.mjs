/**
 * 零依賴測試：node src/lib/syncMerge.test.mjs
 * 驗證雲端/本地合併邏輯——GAS 匯入列（gmail_）以雲端為準，手動列以本地為準。
 */
import assert from 'node:assert';
import { isImportedId, mergeLifeExpenses, purgePreAprilManualExpenses, mergeDeletedIds } from './syncMerge.js';

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

console.log('\n[purgePreAprilManualExpenses]');
test('移除 4/1 前的手動支出（無 type 視為支出）', () => {
  const out = purgePreAprilManualExpenses([{ id: 'm1', date: '2026-03-10', amount: 75 }]);
  assert.equal(out.length, 0);
});
test('保留薪資/收入（type=income）即使在 4 月前', () => {
  const out = purgePreAprilManualExpenses([{ id: 's1', date: '2026-03-13', amount: 48000, type: 'income' }]);
  assert.equal(out.length, 1);
});
test('保留刷卡匯入（gmail_）即使在 4 月前', () => {
  const out = purgePreAprilManualExpenses([{ id: 'gmail_x', date: '2026-03-16', amount: 75 }]);
  assert.equal(out.length, 1);
});
test('保留 4/1（含）之後的手動支出', () => {
  const out = purgePreAprilManualExpenses([
    { id: 'm_keep', date: '2026-04-01', amount: 50 },
    { id: 'm_keep2', date: '2026-05-02', amount: 27 },
  ]);
  assert.deepEqual(out.map(e => e.id).sort(), ['m_keep', 'm_keep2']);
});
test('混合情境：只濾掉 4 月前手動支出，其餘全留', () => {
  const out = purgePreAprilManualExpenses([
    { id: 'm_old', date: '2026-02-09', amount: 260 },              // 刪
    { id: 's_old', date: '2026-01-15', amount: 48000, type: 'income' }, // 留(收入)
    { id: 'gmail_old', date: '2026-03-16', amount: 75 },           // 留(刷卡)
    { id: 'm_new', date: '2026-04-15', amount: 100 },              // 留(4月後)
  ]);
  assert.deepEqual(out.map(e => e.id).sort(), ['gmail_old', 'm_new', 's_old']);
});

console.log('\n[刪除墓碑 / 編輯保留]');
test('本地刪掉的 gmail_ 列，雲端還在也不會回來', () => {
  const cloud = [{ id: 'gmail_s_x', amount: 16091 }, { id: 'gmail_s_y', amount: 241 }];
  const merged = mergeLifeExpenses([], cloud, ['gmail_s_x']);
  assert.deepEqual(ids(merged), ['gmail_s_y']);
});
test('刪掉的 live_ 列，雲端還在也不會回來', () => {
  const merged = mergeLifeExpenses([], [{ id: 'live_a', amount: 85 }], ['live_a']);
  assert.deepEqual(merged, []);
});
test('本地編輯過的 gmail_ 列優先於雲端未編輯版', () => {
  const local = [{ id: 'gmail_s_x', amount: 16091, categoryId: 'lc_travel', _editedAt: 100 }];
  const cloud = [{ id: 'gmail_s_x', amount: 16091, categoryId: 'lc_other' }];
  assert.equal(mergeLifeExpenses(local, cloud)[0].categoryId, 'lc_travel');
});
test('雲端較新的編輯優先於本地較舊的編輯', () => {
  const local = [{ id: 'gmail_s_x', note: 'old', _editedAt: 100 }];
  const cloud = [{ id: 'gmail_s_x', note: 'new', _editedAt: 200 }];
  assert.equal(mergeLifeExpenses(local, cloud)[0].note, 'new');
});
test('雲端已移除的 gmail_ 列，本地編輯過也不復活（存在與否仍以雲端為準）', () => {
  assert.deepEqual(mergeLifeExpenses([{ id: 'gmail_s_x', _editedAt: 100 }], []), []);
});
test('本地刪掉的手動列，沒墓碑時會被雲端聯集救回（重現 bug）', () => {
  const merged = mergeLifeExpenses([], [{ id: 'm695', amount: 695 }]);
  assert.deepEqual(ids(merged), ['m695']);
});
test('本地刪掉的手動列有墓碑 → 雲端還在也不會回來', () => {
  const merged = mergeLifeExpenses([], [{ id: 'm695', amount: 695 }, { id: 'm798', amount: 798 }], ['m695']);
  assert.deepEqual(ids(merged), ['m798']);
});
test('墓碑清單取聯集去重', () => {
  assert.deepEqual(mergeDeletedIds(['a', 'b'], ['b', 'c']).sort(), ['a', 'b', 'c']);
  assert.deepEqual(mergeDeletedIds(undefined, null), []);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
