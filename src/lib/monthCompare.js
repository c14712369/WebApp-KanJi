/**
 * 生活費「較上月」（純函式，零依賴，可單元測試）。
 * 本月還沒過完：拿上月 1 日到「同一天」比（上月較短就算到上月底），標「較上月同期」；
 * 已過完的月份：整月比整月，標「較上月」。未來的月份、上月同期沒花費 → null（不顯示）。
 */

const pad = (n) => String(n).padStart(2, '0');
const prevYmOf = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
};
const lastDayOf = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

/** 某月 1 日到 uptoDay 日（含）的生活支出合計 */
function spendUpTo(list, ym, uptoDay) {
  const end = `${ym}-${pad(uptoDay)}`;
  let sum = 0;
  for (const e of list) {
    if (!e || e.type === 'income' || typeof e.date !== 'string') continue;
    if (!e.date.startsWith(ym) || e.date.slice(0, 10) > end) continue;
    const v = Number(e.amount);
    if (Number.isFinite(v)) sum += v;
  }
  return sum;
}

/**
 * @param {Array} lifeExpenses
 * @param {string} ym       要看的月份 'YYYY-MM'
 * @param {string} todayIso 今天 'YYYY-MM-DD'
 * @returns {null | { delta, pct, up, label, range }}  range：同期比較時的「1–24 日」，整月比較為 null
 */
export function lifeMonthOverMonth(lifeExpenses, ym, todayIso) {
  const list = Array.isArray(lifeExpenses) ? lifeExpenses : [];
  const todayYm = String(todayIso || '').slice(0, 7);
  if (!ym || ym > todayYm) return null;

  const prevYm = prevYmOf(ym);
  const isCurrent = ym === todayYm;
  const day = isCurrent ? Number(todayIso.slice(8, 10)) : lastDayOf(ym);
  const curr = spendUpTo(list, ym, day);
  const prev = spendUpTo(list, prevYm, isCurrent ? Math.min(day, lastDayOf(prevYm)) : lastDayOf(prevYm));
  if (!prev) return null;

  const delta = curr - prev;
  return {
    delta,
    pct: Math.round(Math.abs(delta / prev) * 100),
    up: delta > 0,
    label: isCurrent ? '較上月同期' : '較上月',
    range: isCurrent ? `1–${day} 日` : null,
  };
}
