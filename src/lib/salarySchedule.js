/** 預設薪資的生效月份（純函式）：避免切到過往月份時自動補記薪資。 */

const YM_RE = /^\d{4}-\d{2}$/;

/**
 * 補上 effectiveFrom。舊版設定沒有這個欄位 → 視為從 currentYm（今天所在月份）開始生效。
 * @param {Object|null} config  { amount, catId, day, effectiveFrom? }
 * @param {string} currentYm    今天所在月份 YYYY-MM
 */
export function normalizeSalaryConfig(config, currentYm) {
  if (!config) return null;
  if (YM_RE.test(config.effectiveFrom || '')) return config;
  return { ...config, effectiveFrom: currentYm };
}

/**
 * 檢視中的月份是否該自動套用薪資：只套用生效月份當月與之後。
 * @param {Object|null} config
 * @param {string} ym          檢視中的月份 YYYY-MM
 * @param {string} currentYm   今天所在月份 YYYY-MM
 */
export function shouldApplySalaryToMonth(config, ym, currentYm) {
  const c = normalizeSalaryConfig(config, currentYm);
  if (!c) return false;
  return ym >= c.effectiveFrom;
}

/** 該月入帳日 YYYY-MM-DD；遇週六提前 1 天、週日提前 2 天（入帳在週五）。 */
export function salaryDateForMonth(ym, day) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, Number(day)));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  else if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}

const isAutoSalary = e => !!(e._autoSalary || e._salaryDefault);

/**
 * 儲存新薪資設定時，要逐筆更新哪些自動薪資：只動 currentYm 當月與之後，
 * 使用者在明細手動改過的（_salaryManual）不覆蓋。過往月份一律不動。
 * 不用「金額等於舊設定」判斷是否手改：設定與明細一旦不同步就永遠更新不到。
 * @returns {{id: string, patch: Object}[]}
 */
export function planSalaryUpdates(expenses, prevConfig, nextConfig, currentYm) {
  if (!nextConfig) return [];
  return expenses
    .filter(e => isAutoSalary(e)
      && !e._salaryManual
      && (e.date || '').slice(0, 7) >= currentYm)
    .map(e => ({
      id: e.id,
      patch: {
        amount: Number(nextConfig.amount),
        categoryId: nextConfig.catId,
        date: salaryDateForMonth(e.date.slice(0, 7), nextConfig.day),
      },
    }));
}
