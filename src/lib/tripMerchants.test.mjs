/**
 * 旅程例外商家比對測試：node src/lib/tripMerchants.test.mjs
 * 驗證：超商別名、分店字尾、只對台幣列有效、雲端合併取較新。
 */
import assert from 'node:assert';
import { tripMerchantKey, isTripExcluded, setTripExclusion, mergeTripExcludes, activeTripExclusions } from './tripMerchants.js';

let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + ' — ' + e.message); }
};

console.log('\n[旅程例外商家]');
const k = tripMerchantKey;
test('7-11 各種寫法都是同一家', () => {
  for (const n of ['7-ELEVEN', '7-ELEVEN 台北門市', '[台新] 統一超商－京發A3709 TAIPEI', '統一超商新營門市', '統一超商中正門市', 'セブン-イレブン'])
    assert.equal(k(n), '7-11', n);
});
test('全家各種寫法都是同一家', () => {
  for (const n of ['全家便利商店台南店', 'FamilyMart', 'ファミリーマート']) assert.equal(k(n), 'familymart', n);
});
test('一般連鎖店的不同分店是同一家', () => { assert.equal(k('路易莎 台南中正店'), k('路易莎 成大店')); });
test('不同店不會撞在一起', () => { assert.notEqual(k('台灣大哥大'), k('台灣高鐵')); assert.notEqual(k('誠品書店'), k('')); });
const on = { '7-11': { on: true, at: 1, label: '7-ELEVEN' } };
test('台幣 7-11 被例外', () => { assert.equal(isTripExcluded({ note: '7-ELEVEN' }, on), true); });
test('例外不影響外幣列（日本的 7-11 仍算旅程）', () => {
  assert.equal(isTripExcluded({ note: '7-ELEVEN', currency: 'JPY' }, on), false);
  assert.equal(isTripExcluded({ note: '7-ELEVEN', currency: 'TWD' }, on), true);
});
test('帳單取代後店名變了，靠 liveNote 仍認得', () => {
  assert.equal(isTripExcluded({ note: '[台新] 某某商店', liveNote: '7-ELEVEN' }, on), true);
});
test('取消後不再例外', () => {
  assert.equal(isTripExcluded({ note: '7-ELEVEN' }, setTripExclusion(on, '7-11', false, 2)), false);
});
test('合併取較新的', () => {
  assert.deepEqual(
    mergeTripExcludes({ a: { on: false, at: 2 } }, { a: { on: true, at: 1 }, b: { on: true, at: 5 } }),
    { a: { on: false, at: 2 }, b: { on: true, at: 5 } });
});

console.log('\n[補充：邊界與其他別名]');
test('萊爾富、OK 超商別名', () => {
  assert.equal(k('萊爾富台北店'), 'hilife');
  assert.equal(k('Hi-Life'), 'hilife');
  assert.equal(k('OK超商'), 'okmart');
  assert.equal(k('OKmart'), 'okmart');
});
test('半形片假名 7-11、SEVEN-ELEVEN 也認得', () => {
  assert.equal(k('ｾﾌﾞﾝｲﾚﾌﾞﾝ'), '7-11');
  assert.equal(k('SEVEN-ELEVEN'), '7-11');
});
test('全家福不是全家', () => { assert.notEqual(k('全家福餐廳'), 'familymart'); });
test('空字串回傳空字串', () => { assert.equal(k(''), ''); assert.equal(k(null), ''); });
test('setTripExclusion：label 去掉銀行前綴、不改原物件、空 key 原樣回傳', () => {
  const before = {};
  const next = setTripExclusion(before, '[台新] 統一超商－京發', true, 9);
  assert.deepEqual(before, {});
  assert.deepEqual(next, { '7-11': { on: true, at: 9, label: '統一超商－京發' } });
  assert.equal(setTripExclusion(before, '   ', true, 9), before);
});
test('activeTripExclusions：只列 on、新到舊', () => {
  const m = { a: { on: true, at: 1, label: 'A' }, b: { on: false, at: 9, label: 'B' }, c: { on: true, at: 5, label: 'C' } };
  assert.deepEqual(activeTripExclusions(m), [{ key: 'c', label: 'C', at: 5 }, { key: 'a', label: 'A', at: 1 }]);
});
test('isTripExcluded：空 map、無店名都不例外', () => {
  assert.equal(isTripExcluded({ note: '7-ELEVEN' }, {}), false);
  assert.equal(isTripExcluded({ note: '7-ELEVEN' }, null), false);
  assert.equal(isTripExcluded({}, on), false);
});

console.log('\n[審查修正：寧可少認，不要認錯]');
test('不同店不會因為砍字尾撞在一起', () => {
  assert.notEqual(k('西門町牛肉麵店'), k('西門町滷肉飯店'));
  assert.notEqual(k('台南安平豆花店'), k('台南安平蝦捲店'));
  assert.notEqual(k('誠品生活咖啡店'), k('誠品生活選物店'));
});
test('以全家開頭的其他店不是全家便利商店', () => {
  for (const n of ['全家國際餐飲', '全家牛排', '全家福', '全家藥局']) assert.notEqual(k(n), 'familymart', n);
});
test('帶付款前綴的全家、7-11 仍認得', () => {
  for (const n of ['[玉山] 連支＊全家便利商店', '[玉山] 連加＊連加＊全家便利商店', '悠遊卡自動加值－全家 /TW']) assert.equal(k(n), 'familymart', n);
  assert.equal(k('[台新] 悠遊卡自動加值－統一超商 /TW'), '7-11');
});
test('含 711 的其他商家不是 7-11', () => {
  for (const n of ['屈臣氏S711長壽店', '豐華小館A711 TAIPEI', '711號海鮮', 'B7-11 停車場', '信義路7 11樓']) assert.notEqual(k(n), '7-11', n);
});
test('日文中點寫法的 7-11', () => {
  for (const n of ['セブン・イレブン', 'ｾﾌﾞﾝ･ｲﾚﾌﾞﾝ', 'セブンーイレブン']) assert.equal(k(n), '7-11', n);
});
test('OK 超商的其他寫法', () => { for (const n of ['OK便利商店', 'OK超商', '來來超商']) assert.equal(k(n), 'okmart', n); });
test('台新附在店名後的代碼與城市不影響比對', () => {
  assert.equal(k('[台新] 臺北大眾捷運股份有限公司TAIPEI'), k('[台新] 臺北大眾捷運股份有限公司A3709 TAIPEI'));
});
test('純英數店名不被砍', () => { assert.notEqual(k('GITHUB, INC.O8549 SAN FR'), ''); assert.notEqual(k('7-ELEVEN TOKYO'), ''); });
test('移除例外：傳名單上的 key 一定關得掉，label 保留', () => {
  const m1 = setTripExclusion({}, '[玉山] 連加＊連加＊Ｃｏｕｐａｎｇ', true, 1);
  const key = Object.keys(m1)[0];
  const m2 = setTripExclusion(m1, key, false, 2);
  assert.equal(Object.keys(m2).length, 1); assert.equal(m2[key].on, false); assert.equal(m2[key].label, m1[key].label);
  assert.deepEqual(activeTripExclusions(m2), []);
});

console.log(`\n通過 ${passed} / 失敗 ${failed}`);
if (failed > 0) process.exit(1);
console.log('全部通過 ✅');
