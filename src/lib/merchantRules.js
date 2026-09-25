/**
 * 商家分類學習規則（純函式，零依賴，可單元測試）
 *
 * 使用者在 App 把某筆匯入的刷卡紀錄改分類 → 記成 { merchantKey: categoryId }，
 * 存在 appData.merchantRules；GAS（GAS-信用卡帳單/Categorizer.js）匯入時優先套用。
 * ⚠️ normalizeMerchant / merchantKey 必須與 GAS 版完全一致，改一邊就要改另一邊。
 */
import { isImportedId } from './syncMerge.js';

export function normalizeMerchant(name) {
  let s = String(name || '');
  if (s.normalize) s = s.normalize('NFKC');
  return s.toLowerCase()
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .replace(/^(連加|line ?pay|街口|全支付|悠遊付|apple ?pay)[\s*\-－_:：]*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function merchantKey(name) {
  return normalizeMerchant(name)
    .replace(/[\s\-_*·(（][^\s\-_*·(（]{1,8}(門市|分店|店)[)）]?$/, '')
    .replace(/[\s\-_*．.·,，()（）]/g, '')
    .slice(0, 40);
}

/**
 * 使用者把 targetId 那筆改成 catId：
 *  - 匯入列才學習（手動列本來就是使用者自己選的）
 *  - 該筆加上 _catLocked，之後 GAS 不會再改它
 *  - 同一家店、目前仍是「其他」的匯入列一起改
 * @return {{ rows: Array, rules: Object, affected: number }} 新陣列與新規則，不改原物件
 */
export function learnCategory(rows, rules, targetId, catId, otherCatId) {
  const target = rows.find(r => r.id === targetId);
  if (!target || !isImportedId(target.id)) return { rows, rules: { ...(rules || {}) }, affected: 0 };

  const key = merchantKey(target.note);
  const nextRules = { ...(rules || {}) };
  if (key) nextRules[key] = catId;

  let affected = 0;
  const next = rows.map(r => {
    if (r.id === targetId) return { ...r, categoryId: catId, _catLocked: true };
    if (key && isImportedId(r.id) && r.type !== 'income' && !r._catLocked
        && r.categoryId === otherCatId && merchantKey(r.note) === key) {
      affected++;
      return { ...r, categoryId: catId };
    }
    return r;
  });
  return { rows: next, rules: nextRules, affected };
}
