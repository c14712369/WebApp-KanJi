/**
 * 旅程例外商家（純函式，零依賴，可單元測試）
 *
 * 使用者把旅程期間的某筆「移到日常」並選「以後這家都算日常」→ 記成
 * { <商家 key>: { on: true|false, at: <時間戳>, label: <顯示名> } }，存 appData.tripExcludeMerchants。
 * 合併時同一個 key 取 at 較新的（不用陣列聯集，因為聯集刪不掉）。
 *
 * 只對台幣列有效：在日本刷 7-11 仍算旅程。
 * 只放前端；merchantKey / normalizeMerchant 本身不動（與 GAS 版必須一致）。
 */
import { normalizeMerchant, merchantKey } from './merchantRules.js';

// 超商別名：比對對象是 normalizeMerchant 後的小寫字串（NFKC 已把半形片假名、全形英數轉正）。
// 原則：寧可少認，不要認錯。順序即優先順序；命中就回傳固定 key。
const NOT_ALNUM_CJK = String.raw`a-z0-9\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}`;
const ALIASES = [
  ['7-11', new RegExp(
    // 文字別名：包含即算（日文允許中間有 ・ ･ ー -）
    '統一超商|7-?eleven|seven-?eleven|セブン[・･ー\\-]?イレブン'
    // 數字寫法：必須是獨立一段，前後都不能是英數或中日文字
    + `|(?<![${NOT_ALNUM_CJK}])(?:7-11|711)(?![${NOT_ALNUM_CJK}])`, 'u')],
  // 「全家」後面只能接 便利／結尾／空白／「/」；全家國際餐飲、全家牛排、全家福都不算
  ['familymart', /familymart|ファミリーマート|全家(?=便利|$|[\s/])/u],
  ['hilife', /萊爾富|hi-?life/u],
  ['okmart', /ok超商|ok便利|okmart|來來超商/u],
];

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * 商家 key：超商走別名表（固定 key）；其他用 merchantKey，
 * 含中日文字時再去掉結尾連續英數字（台新帳單在店名後附的代碼／城市，如 A3709、TAIPEI）。
 * 純英數店名不去。空字串回 ''。
 */
export function tripMerchantKey(name) {
  const norm = normalizeMerchant(name);
  if (!norm) return '';
  for (const [key, re] of ALIASES) if (re.test(norm)) return key;
  const base = merchantKey(name);
  return CJK_RE.test(base) ? base.replace(/[a-z0-9]+$/, '') : base;
}
function isForeign(entry) {
  return !!entry && !!entry.currency && entry.currency !== 'TWD';
}

/** 這筆是否被使用者設為「旅程期間也算日常」。外幣列一律 false；note 或 liveNote 任一命中即 true。 */
export function isTripExcluded(entry, map) {
  if (!entry || !map || isForeign(entry)) return false;
  for (const name of [entry.note, entry.liveNote]) {
    const key = tripMerchantKey(name);
    if (key && map[key] && map[key].on === true) return true;
  }
  return false;
}

/**
 * 回傳新物件：map[key] = { on, at, label }；label 是原名去掉 [銀行] 前綴。key 空白時原樣回傳。
 * nameOrKey 若已是 map 裡的 key 就直接用（不重算），並保留原本的 label（關閉時才不會被 key 取代）。
 */
export function setTripExclusion(map, nameOrKey, on, now = Date.now()) {
  const m = map || {};
  const existing = typeof nameOrKey === 'string' && Object.prototype.hasOwnProperty.call(m, nameOrKey);
  const key = existing ? nameOrKey : tripMerchantKey(nameOrKey);
  if (!key) return map;
  const label = existing && m[key] && m[key].label
    ? m[key].label
    : String(nameOrKey || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim();
  return { ...m, [key]: { on: !!on, at: now, label } };
}
/** 本機與雲端合併：同一個 key 取 at 較大的那份（相同取本機）。 */
export function mergeTripExcludes(local, cloud) {
  const out = { ...(cloud || {}) };
  for (const [key, v] of Object.entries(local || {})) {
    const c = out[key];
    if (!c || (v && v.at || 0) >= (c.at || 0)) out[key] = v;
  }
  return out;
}

/** 目前生效（on: true）的例外清單，依 at 新到舊。 */
export function activeTripExclusions(map) {
  return Object.entries(map || {})
    .filter(([, v]) => v && v.on === true)
    .map(([key, v]) => ({ key, label: v.label || key, at: v.at || 0 }))
    .sort((a, b) => b.at - a.at);
}
