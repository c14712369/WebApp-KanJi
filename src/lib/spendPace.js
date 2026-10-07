/** 本月花費速度（只採用實際記帳資料的純函式）。 */

const TIGHT_MARGIN = 0.15;   // 變動支出進度超過時間進度 15 個百分點 → 吃緊

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/**
 * @param {Object} p
 * @param {string} p.ym      檢視中的月份 YYYY-MM
 * @param {string} p.today   今天 YYYY-MM-DD
 * @param {number} p.income  本月收入
 * @param {number} p.spent   本月已記生活支出
 * @param {number} p.fixed   本月固定支出
 */
export function computeSpendPace({ ym, today, income = 0, spent = 0, fixed = 0 }) {
  const isCurrentMonth = today.slice(0, 7) === ym;
  const dim = daysInMonth(ym);

  let day = dim, daysLeft = 0;
  if (isCurrentMonth) {
    day = Number(today.slice(8, 10));
    daysLeft = dim - day + 1;
  }

  const remain = income - spent - fixed;

  let status = 'none';
  if (income > 0) {
    if (remain < 0) status = 'over';
    else if (isCurrentMonth) {
      const variableBudget = income - fixed;
      const spendRatio = variableBudget > 0 ? spent / variableBudget : 1;
      const timeRatio = day / dim;
      status = spendRatio > timeRatio + TIGHT_MARGIN ? 'tight' : 'ok';
    } else status = 'ok';
  }

  return {
    isCurrentMonth,
    remain,
    daysLeft,
    dailyAllowance: isCurrentMonth ? Math.max(0, Math.floor(remain / daysLeft)) : null,
    status,
  };
}
