/**
 * 本月花費速度（純函式，零依賴，可單元測試）
 *
 * 問題：信用卡帳單月底才來，當月刷的卡大多還沒入帳 → 「結餘」會高估。
 * 作法：用過去幾個「已完整入帳」月份的刷卡日均，估出本月到今天應該刷了多少，
 *       扣掉本月已入帳（帳單＋即時記帳）的部分，就是「預估未入帳」。
 */
import { isImportedId } from './syncMerge.js';

const TIGHT_MARGIN = 0.15;   // 變動支出進度超過時間進度 15 個百分點 → 吃緊

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function shiftMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

const isCardSpend = e => e && e.type !== 'income' && isImportedId(e.id);

/**
 * @param {Object} p
 * @param {Array}  p.rows    全部 lifeExpenses
 * @param {string} p.ym      檢視中的月份 YYYY-MM
 * @param {string} p.today   今天 YYYY-MM-DD
 * @param {number} p.income  本月收入
 * @param {number} p.spent   本月已記生活支出
 * @param {number} p.fixed   本月固定支出
 */
export function computeSpendPace({ rows = [], ym, today, income = 0, spent = 0, fixed = 0 }) {
  const isCurrentMonth = today.slice(0, 7) === ym;
  const dim = daysInMonth(ym);

  let unbilledEstimate = 0;
  let day = dim, daysLeft = 0;
  if (isCurrentMonth) {
    day = Number(today.slice(8, 10));
    daysLeft = dim - day + 1;

    // 上個月可能還有帳單沒寄來，取前 2~4 個月（有刷卡資料的月份）平均
    const monthly = [2, 3, 4].map(k => {
      const m = shiftMonth(ym, -k);
      return rows.filter(e => isCardSpend(e) && (e.date || '').startsWith(m))
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    }).filter(v => v > 0);

    if (monthly.length) {
      const avgMonthly = monthly.reduce((a, b) => a + b, 0) / monthly.length;
      const expected = avgMonthly / dim * day;
      const posted = rows.filter(e => isCardSpend(e) && (e.date || '').startsWith(ym) && (e.date || '') <= today)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0);
      unbilledEstimate = Math.max(0, Math.round(expected - posted));
    }
  }

  const remain = income - spent - fixed - unbilledEstimate;

  let status = 'none';
  if (income > 0) {
    if (remain < 0) status = 'over';
    else if (isCurrentMonth) {
      const variableBudget = income - fixed;
      const spendRatio = variableBudget > 0 ? (spent + unbilledEstimate) / variableBudget : 1;
      const timeRatio = day / dim;
      status = spendRatio > timeRatio + TIGHT_MARGIN ? 'tight' : 'ok';
    } else status = 'ok';
  }

  return {
    isCurrentMonth,
    unbilledEstimate,
    remain,
    daysLeft,
    dailyAllowance: isCurrentMonth ? Math.max(0, Math.floor(remain / daysLeft)) : null,
    status,
  };
}
