/**
 * 記帳明細「依日期分組」與「分頁時整天不切斷」邏輯（純函式，零依賴，可單元測試）。
 */

/**
 * 將已過濾、已排序的明細依日期分組（保留原排序）。
 * @param {Array} entries
 * @returns {Array<{date:string, entries:Array, total:number}>} total 為當日支出合計（不含收入）
 */
export function groupEntriesByDay(entries = []) {
  const arr = Array.isArray(entries) ? entries : [];
  const order = [];
  const map = {};
  for (const e of arr) {
    const d = (e && e.date) || '';
    if (!map[d]) { map[d] = { date: d, entries: [], total: 0 }; order.push(d); }
    map[d].entries.push(e);
    if (e && e.type !== 'income') map[d].total += (Number(e.amount) || 0);
  }
  return order.map(d => map[d]);
}

/**
 * 備註分群鍵：去掉開頭的 [卡名] 標籤後取第一個詞（半形/全形空白分隔），不分大小寫。
 * 「伴手禮 小老闆」「伴手禮 芒果乾」→ 都是「伴手禮」。
 */
export function noteGroupKey(note) {
  const s = String(note || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim();
  return (s.split(/[\s　]+/)[0] || '').toLowerCase();
}

/**
 * 明細排序：日期（dir）→ 同日收入在前 → 分類設定順序 → 同分類內「備註同群的黏在一起」，
 * 群組依該群最大一筆金額由大到小，群內也由大到小。不改動輸入陣列。
 * @param {Array} entries
 * @param {{catOrder?: Object<string, number>, dir?: 'asc'|'desc'}} opts
 */
export function sortEntries(entries = [], { catOrder = {}, dir = 'desc' } = {}) {
  const arr = Array.isArray(entries) ? entries : [];
  const amt = e => Number(e.amount) || 0;
  const groupId = e => `${e.date}|${e.type}|${e.categoryId}|${noteGroupKey(e.note)}`;
  const groupMax = {};
  for (const e of arr) {
    const g = groupId(e);
    groupMax[g] = Math.max(groupMax[g] ?? -Infinity, amt(e));
  }
  const sign = dir === 'asc' ? 1 : -1;
  return arr.slice().sort((a, b) =>
    sign * (a.date || '').localeCompare(b.date || '')
    || ((a.type === 'income' ? 0 : 1) - (b.type === 'income' ? 0 : 1))
    || ((catOrder[a.categoryId] ?? 1e9) - (catOrder[b.categoryId] ?? 1e9))
    || (groupMax[groupId(b)] - groupMax[groupId(a)])
    || noteGroupKey(a.note).localeCompare(noteGroupKey(b.note))
    || (amt(b) - amt(a))
    || (a.id || '').localeCompare(b.id || '')
  );
}

/**
 * 以「日」為單位分頁：每頁累積到接近 targetSize 筆就換頁，但同一天的明細永不跨頁。
 * @param {Array} groups - groupEntriesByDay 的結果
 * @param {number} page - 1-based
 * @param {number} targetSize - 每頁目標明細筆數
 * @returns {{totalPages:number, pageGroups:Array}}
 */
export function paginateGroups(groups = [], page = 1, targetSize = 20) {
  const pages = buildPages(groups, targetSize);
  return { totalPages: pages.length || 1, pageGroups: pages[page - 1] || [] };
}

/**
 * 某筆明細落在第幾頁（1-based，規則同 paginateGroups）；不在清單內回 null。
 * 存檔後用來跳到那筆：補記幾天前的帳，常被排到第 2 頁，停在第 1 頁看起來像沒存到。
 */
export function findEntryPage(groups = [], entryId, targetSize = 20) {
  const pages = buildPages(groups, targetSize);
  const i = pages.findIndex(p => p.some(g => (g.entries || []).some(e => e && e.id === entryId)));
  return i === -1 ? null : i + 1;
}

function buildPages(groups, targetSize) {
  const arr = Array.isArray(groups) ? groups : [];
  const pages = [];
  let cur = [], count = 0;
  for (const g of arr) {
    const n = (g.entries && g.entries.length) || 0;
    if (cur.length > 0 && count + n > targetSize) {
      pages.push(cur); cur = []; count = 0;
    }
    cur.push(g);
    count += n;
  }
  if (cur.length) pages.push(cur);
  return pages;
}
