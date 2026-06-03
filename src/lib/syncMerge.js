/**
 * 雲端/本地同步合併邏輯（純函式，零依賴，可單元測試）。
 *
 * 背景：記帳列有兩種來源——
 *   1. GAS（Gmail 帳單匯入）寫入雲端的列，id 以 "gmail_" 開頭，使用者不會在前端編輯它。
 *   2. 使用者在前端手動新增的列（id 為 UUID 等）。
 * 舊的「依時間戳整批二選一」會讓其中一方蓋掉另一方（GAS 匯入常被前端推送蓋掉）。
 * 改用「依 id 合併」：gmail_ 列以雲端為準（含新增與刪除），手動列以本地為準。
 */

/** id 是否為 GAS 匯入列 */
export function isImportedId(id) {
  return typeof id === 'string' && id.indexOf('gmail_') === 0;
}

/**
 * 合併本地與雲端的 lifeExpenses。
 * - gmail_ 匯入列：完全採用雲端集合（雲端有才有、雲端刪了本地也移除）。
 * - 手動列：本地與雲端聯集，同 id 以本地為準（使用者剛編輯的優先）。
 * @param {Array} local
 * @param {Array} cloud
 * @returns {Array}
 */
export function mergeLifeExpenses(local = [], cloud = []) {
  const localArr = Array.isArray(local) ? local : [];
  const cloudArr = Array.isArray(cloud) ? cloud : [];

  const cloudImported = cloudArr.filter(e => isImportedId(e && e.id));

  const manualById = {};
  cloudArr.filter(e => !isImportedId(e && e.id)).forEach(e => { manualById[e.id] = e; });
  localArr.filter(e => !isImportedId(e && e.id)).forEach(e => { manualById[e.id] = e; }); // 本地覆蓋

  return [...Object.values(manualById), ...cloudImported];
}
