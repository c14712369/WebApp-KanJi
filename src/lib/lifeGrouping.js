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
 * 以「日」為單位分頁：每頁累積到接近 targetSize 筆就換頁，但同一天的明細永不跨頁。
 * @param {Array} groups - groupEntriesByDay 的結果
 * @param {number} page - 1-based
 * @param {number} targetSize - 每頁目標明細筆數
 * @returns {{totalPages:number, pageGroups:Array}}
 */
export function paginateGroups(groups = [], page = 1, targetSize = 20) {
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
  return { totalPages: pages.length || 1, pageGroups: pages[page - 1] || [] };
}
