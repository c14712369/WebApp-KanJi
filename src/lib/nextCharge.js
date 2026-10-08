// 固定支出「下次扣款日」：以開始日期為錨點，依週期推算今天（含）之後的第一個扣款日。
// 日期一律用本地時間的年月日運算，避免 new Date('YYYY-MM-DD') 被當成 UTC 而跨日。

const MONTH_STEP = { monthly: 1, bimonthly: 2, quarterly: 3, 'half-yearly': 6, yearly: 12 };
const DAY_MS = 86400000;

function parseYmd(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

// 指定年月的扣款日：錨點日超過當月天數時取月底（例：31 號遇 11 月 → 30 號）
function clampedDate(y, monthIndex, day) {
  const last = new Date(y, monthIndex + 1, 0).getDate();
  return new Date(y, monthIndex, Math.min(day, last));
}

const daysBetween = (from, to) => Math.round((to - from) / DAY_MS);

// 本地時間的 YYYY-MM-DD（避免 toISOString 的 UTC 在台灣早上 8 點前變成昨天）
export const toYmd = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * @param {{ cycle: string, startDate?: string, endDate?: string }} item
 * @param {Date} today 已歸零到 00:00 的今天
 * @returns {{ date: Date, daysLeft: number } | null} 已結束、一次性已過或無開始日時為 null
 */
export function getNextCharge(item, today) {
  const start = parseYmd(item.startDate);
  if (!start) return null;
  const startDate = clampedDate(start.y, start.m - 1, start.d);

  let next;
  if (startDate >= today) {
    next = startDate;
  } else if (item.cycle === 'fixed') {
    return null;
  } else if (item.cycle === 'daily') {
    next = new Date(today);
  } else if (item.cycle === 'weekly') {
    const weeks = Math.ceil(daysBetween(startDate, today) / 7);
    next = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + weeks * 7);
  } else {
    const step = MONTH_STEP[item.cycle] ?? 1;
    const monthsSince = (today.getFullYear() - start.y) * 12 + (today.getMonth() - (start.m - 1));
    let k = Math.floor(monthsSince / step) * step;
    next = clampedDate(start.y, start.m - 1 + k, start.d);
    while (next < today) {
      k += step;
      next = clampedDate(start.y, start.m - 1 + k, start.d);
    }
  }

  const end = parseYmd(item.endDate);
  if (end && next > new Date(end.y, end.m - 1, end.d)) return null;

  return { date: next, daysLeft: daysBetween(today, next) };
}
