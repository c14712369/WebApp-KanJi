/**
 * 專案支出彙總（純函式，零依賴，可單元測試）。
 * 專案明細存在 store.projectExpenses，以 projectId 關聯 projects[].id、以 date（YYYY-MM-DD）歸期。
 * 只計入仍存在的專案（與專案頁顯示一致；刪專案時明細會一併移除）。
 */

function liveExpenses(projects, projectExpenses) {
  if (!Array.isArray(projectExpenses) || !projectExpenses.length) return [];
  const ids = new Set((projects || []).map(p => p.id));
  return projectExpenses.filter(e => e && ids.has(e.projectId));
}

/** 加總日期以 prefix 開頭（'2026' 或 '2026-03'）的專案支出 */
export function sumProjectExpenses(projects, projectExpenses, prefix) {
  const p = String(prefix);
  return liveExpenses(projects, projectExpenses)
    .filter(e => (e.date || '').startsWith(p))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

/** 一年 12 個月的專案支出（index 0 = 1 月） */
export function projectExpensesByMonth(projects, projectExpenses, year) {
  const out = Array(12).fill(0);
  const y = String(year);
  liveExpenses(projects, projectExpenses).forEach(e => {
    const d = e.date || '';
    if (!d.startsWith(y + '-')) return;
    const m = Number(d.slice(5, 7));
    if (m >= 1 && m <= 12) out[m - 1] += Number(e.amount) || 0;
  });
  return out;
}

/** 專案支出出現過的年份（字串 'YYYY'） */
export function projectExpenseYears(projects, projectExpenses) {
  const set = new Set();
  liveExpenses(projects, projectExpenses).forEach(e => { if (/^\d{4}/.test(e.date || '')) set.add(e.date.slice(0, 4)); });
  return [...set];
}

/**
 * 選中年份不在清單時，落到清單中最接近的年份（同距離取較新的）；清單空則回傳 fallback。
 * years 為 'YYYY' 字串陣列。
 */
export function nearestYear(years, current, fallback = current) {
  if (!years?.length) return fallback;
  if (years.includes(current)) return current;
  const c = Number(current);
  let best = years[0];
  for (const y of years) {
    const d = Math.abs(Number(y) - c), bd = Math.abs(Number(best) - c);
    if (d < bd || (d === bd && Number(y) > Number(best))) best = y;
  }
  return best;
}
