/**
 * 雲端/本地同步合併邏輯（純函式，零依賴，可單元測試）。
 *
 * 背景：記帳列有兩種來源——
 *   1. GAS（Gmail 帳單匯入）寫入雲端的列，id 以 "gmail_" 開頭，使用者不會在前端編輯它。
 *   2. 使用者在前端手動新增的列（id 為 UUID 等）。
 * 舊的「依時間戳整批二選一」會讓其中一方蓋掉另一方（GAS 匯入常被前端推送蓋掉）。
 * 改用「依 id 合併」：gmail_ 列以雲端為準（含新增與刪除），手動列以本地為準。
 */

/** id 是否為 GAS 匯入列（gmail_ 帳單／收據、live_ 捷徑即時記帳） */
export function isImportedId(id) {
  return typeof id === 'string' && (id.indexOf('gmail_') === 0 || id.indexOf('live_') === 0);
}

/**
 * 合併本地與雲端的 lifeExpenses。
 * - gmail_ 匯入列：存在與否以雲端為準；同 id 若有一方被使用者編輯過（_editedAt），取較新的編輯。
 * - 手動列：本地與雲端聯集，同 id 以本地為準（使用者剛編輯的優先）。
 * - deletedIds（使用者刪掉的匯入列墓碑）：一律排除，避免 GAS 重新匯入或雲端舊資料讓它復活。
 * @param {Array} local
 * @param {Array} cloud
 * @param {Array<string>} deletedIds
 * @returns {Array}
 */
export function mergeLifeExpenses(local = [], cloud = [], deletedIds = []) {
  const localArr = Array.isArray(local) ? local : [];
  const cloudArr = Array.isArray(cloud) ? cloud : [];
  const deleted = new Set(Array.isArray(deletedIds) ? deletedIds : []);

  // 匯入列存在與否以雲端為準；同 id 本地編輯較新（_editedAt）→ 用本地版，
  // 只改過分類（_catLocked）→ 保留本地分類，其餘欄位以雲端為準；
  // 但雲端有較晚的編輯（別台裝置改的）時，分類也跟雲端走，鎖照樣保留
  const editedAt = e => (e && e._editedAt) || 0;
  const localImported = {};
  localArr.forEach(e => { if (e && isImportedId(e.id)) localImported[e.id] = e; });
  const cloudImported = cloudArr.filter(e => isImportedId(e && e.id)).map(e => {
    const l = localImported[e.id];
    if (l && editedAt(l) > editedAt(e)) return l;
    if (!l || !l._catLocked) return e;
    return editedAt(e) > editedAt(l) ? { ...e, _catLocked: true } : { ...e, categoryId: l.categoryId, _catLocked: true };
  });

  // 手動列：聯集，同 id 以本地為準；雲端有較晚的編輯時改用雲端版（電腦上改的不會被手機蓋回）
  const manualById = {};
  cloudArr.filter(e => !isImportedId(e && e.id)).forEach(e => { manualById[e.id] = e; });
  localArr.filter(e => !isImportedId(e && e.id)).forEach(e => {
    const c = manualById[e.id];
    if (!c || editedAt(e) >= editedAt(c)) manualById[e.id] = e;
  });

  return [...Object.values(manualById), ...cloudImported].filter(e => !deleted.has(e && e.id));
}

/** 本地與雲端的刪除墓碑取聯集 */
export function mergeDeletedIds(local, cloud) {
  return [...new Set([...(Array.isArray(local) ? local : []), ...(Array.isArray(cloud) ? cloud : [])])];
}

/**
 * 合併商家分類學習規則：聯集，同 key 以本地為準（使用者剛改的優先）。
 */
export function mergeMerchantRules(local, cloud) {
  return { ...(cloud || {}), ...(local || {}) };
}

/**
 * 一次性資料政策：移除「指定日期以前的手動支出列」。
 * 條件＝ 非 gmail_ 匯入列 且 非收入(type !== 'income') 且 date < cutoff。
 * 保留：收入/薪資、刷卡匯入(gmail_)、cutoff（含）之後的所有列。
 * 設計為同步時的冪等過濾，因合併採聯集，需在每次合併後施加才能確保兩端都洗淨且自我修復。
 * @param {Array} entries
 * @param {string} cutoff - ISO 日期字串，預設 '2026-04-01'
 */
export function purgePreAprilManualExpenses(entries = [], cutoff = '2026-04-01') {
  const arr = Array.isArray(entries) ? entries : [];
  return arr.filter(e => {
    if (!e) return false;
    const isManualExpense = !isImportedId(e.id) && e.type !== 'income';
    const beforeCutoff = (e.date || '') < cutoff;
    return !(isManualExpense && beforeCutoff);
  });
}

/**
 * 推送到雲端的整包資料：本機認識的欄位以本機為準，本機不認識的欄位保留雲端的。
 * 背景：推送是整包 upsert。2026-11 外幣／旅程上線前，舊版 App 的匯出沒有 trips，
 * 一推送就把新版寫進雲端的旅程洗掉。之後再加新欄位時，落後一版的裝置也不會再洗掉它。
 * settings 也逐欄合併（同樣理由）。不改動傳入的物件。
 */
export function buildPushPayload(cloud, local) {
  const base = cloud && typeof cloud === 'object' ? cloud : {};
  const out = { ...base, ...local };
  if (base.settings || local?.settings) out.settings = { ...(base.settings || {}), ...(local?.settings || {}) };
  return out;
}

/** 編輯一筆記帳：套用修改並蓋上編輯時間（手動列與匯入列都蓋，跨裝置合併時較晚的編輯優先） */
export function withEdit(entry, data, now = Date.now()) {
  return { ...entry, ...data, _editedAt: now };
}
