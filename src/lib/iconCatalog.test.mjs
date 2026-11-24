/**
 * 零依賴測試：node src/lib/iconCatalog.test.mjs
 * 分類圖示目錄：分組、中文名稱、搜尋；舊分類存的圖示名稱一個都不能少（否則既有分類會變成虛線圓圈）。
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ICON_GROUPS, ALL_ICON_NAMES, searchIconGroups, iconLabel } from './iconCatalog.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✅ ' + name); }
  catch (e) { failed++; console.log('  ❌ ' + name + ' → ' + e.message); }
};

// 外幣功能上線前就有的 30 個圖示：使用者的分類資料裡存的就是這些字串
const LEGACY = [
  'Gamepad2', 'Briefcase', 'Home', 'ShieldCheck', 'MoreHorizontal',
  'Utensils', 'Bus', 'Zap', 'Pill', 'Landmark', 'Gift', 'TrendingUp',
  'Plane', 'BedDouble', 'Ticket', 'ShoppingBag', 'Car', 'Coffee',
  'Smartphone', 'Monitor', 'BookOpen', 'Music', 'Dumbbell', 'Scissors',
  'HeartPulse', 'Baby', 'Dog', 'Cat', 'Camera', 'Palmtree',
];

const here = dirname(fileURLToPath(import.meta.url));
// 讀圖示對照表原始碼：去掉 // 註解（分組標題），只留識別字
const readMap = (file, constName) => {
  const src = readFileSync(join(here, file), 'utf8').replace(/\/\/[^\n]*/g, '');
  const body = (src.match(new RegExp(`const ${constName} = \\{([\\s\\S]*?)\\};`)) || [])[1] || '';
  const importBody = (src.match(/import \{([\s\S]*?)\} from 'lucide-react'/) || [])[1] || '';
  return {
    body,
    keys: body.split(/[\s,]+/).map(s => s.split(':')[0].trim()).filter(Boolean),
    imported: new Set(importBody.split(/[\s,]+/).filter(Boolean)),
  };
};
const core = readMap('IconRenderer.jsx', 'CORE_ICONS');
const ext = readMap('iconsExtended.jsx', 'EXTENDED_ICONS');
const mapKeys = [...core.keys, ...ext.keys];

console.log('目錄完整性');
test('圖示數量至少 120 個（原本只有 30 個）', () => {
  assert.ok(ALL_ICON_NAMES.length >= 120, `只有 ${ALL_ICON_NAMES.length} 個`);
});
test('舊分類用的 30 個圖示名稱全部保留', () => {
  const missing = LEGACY.filter(n => !ALL_ICON_NAMES.includes(n));
  assert.deepEqual(missing, []);
});
test('同一個圖示只出現在一個分組（不重複）', () => {
  const dup = ALL_ICON_NAMES.filter((n, i) => ALL_ICON_NAMES.indexOf(n) !== i);
  assert.deepEqual(dup, []);
});
test('每個圖示都有中文名稱', () => {
  const noLabel = ICON_GROUPS.flatMap(g => g.icons).filter(i => !i.label || !/[一-鿿]/.test(i.label));
  assert.deepEqual(noLabel.map(i => i.name), []);
});
test('每個分組都有中文名稱且至少 6 個圖示', () => {
  for (const g of ICON_GROUPS) {
    assert.ok(/[一-鿿]/.test(g.label), g.id);
    assert.ok(g.icons.length >= 6, `${g.label} 只有 ${g.icons.length} 個`);
  }
});

console.log('與 IconRenderer 同步');
test('目錄裡的每個圖示 IconRenderer 都畫得出來', () => {
  const missing = ALL_ICON_NAMES.filter(n => !mapKeys.includes(n));
  assert.deepEqual(missing, []);
});
test('IconRenderer 能畫的圖示都出現在選擇器裡', () => {
  const extra = mapKeys.filter(n => !ALL_ICON_NAMES.includes(n));
  assert.deepEqual(extra, []);
});
test('對照表用到的元件都有從 lucide-react 匯入', () => {
  for (const m of [core, ext]) {
    const notImported = m.keys.filter(v => !m.imported.has(v));
    assert.deepEqual(notImported, []);
  }
});
test('舊的 30 個都在內建表（第一次畫面不用等擴充檔）', () => {
  assert.deepEqual(LEGACY.filter(n => !core.keys.includes(n)), []);
});
test('內建表與擴充表不重複', () => {
  assert.deepEqual(core.keys.filter(n => ext.keys.includes(n)), []);
});

console.log('搜尋');
test('空白搜尋 → 全部分組', () => {
  assert.equal(searchIconGroups('').length, ICON_GROUPS.length);
  assert.equal(searchIconGroups('   ').length, ICON_GROUPS.length);
});
test('中文關鍵字找得到：咖啡 → Coffee', () => {
  const names = searchIconGroups('咖啡').flatMap(g => g.icons.map(i => i.name));
  assert.ok(names.includes('Coffee'));
});
test('常見記帳用語找得到：捷運、房租、訂閱、寵物', () => {
  for (const q of ['捷運', '房租', '訂閱', '寵物']) {
    assert.ok(searchIconGroups(q).length > 0, q);
  }
});
test('英文名稱也找得到（不分大小寫）：coffee', () => {
  const names = searchIconGroups('coffee').flatMap(g => g.icons.map(i => i.name));
  assert.ok(names.includes('Coffee'));
});
test('搜分組名稱 → 整組都列出', () => {
  const food = ICON_GROUPS.find(g => g.label === '飲食');
  const r = searchIconGroups('飲食');
  const hit = r.find(g => g.id === food.id);
  assert.ok(hit);
  assert.equal(hit.icons.length, food.icons.length);
});
test('沒有結果的分組不列出；完全找不到 → 空陣列', () => {
  assert.ok(searchIconGroups('咖啡').every(g => g.icons.length > 0));
  assert.deepEqual(searchIconGroups('zzzz不存在'), []);
});

console.log('名稱');
test('iconLabel 回傳中文名稱；不認識的名稱回傳原字串', () => {
  assert.equal(iconLabel('Coffee'), '咖啡');
  assert.equal(iconLabel('NoSuchIcon'), 'NoSuchIcon');
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed) { console.log('有測試失敗 ❌'); process.exit(1); }
console.log('全部通過 ✅');
