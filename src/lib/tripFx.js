/**
 * 旅程的舊明細換算（純函式，零依賴，可單元測試）。
 *
 * 背景：Apple Pay 捷徑把「¥3,200」只取數字，記成 $3,200（台幣）。外幣功能上線前的旅程明細
 * 都是這樣，要找出來、依「各自日期」的匯率換成台幣，原幣與匯率一併留下，之後還能復原。
 *
 * 破壞性寫入守則：呼叫端逐筆 updateLifeExpense（不整份覆蓋）、換算前先留快照、
 * 筆數有上限，任何一天抓不到匯率就整批不換（不拿猜的匯率）。
 */
import { tripForDate, entryTripId } from './trips.js';
import { entryAmountFields } from './fx.js';

export const FX_CONVERT_MAX = 200;

const isStatementRow = (e) => typeof e.id === 'string' && e.id.indexOf('gmail_') === 0;
const isLiveRow = (e) => !!e.live || (typeof e.id === 'string' && e.id.indexOf('live_') === 0);

/**
 * 這趟旅程裡還沒換成台幣的支出。
 * - 沒標幣別的：可能是外幣數字被當台幣記（code＝這趟的幣別、original＝目前金額）
 * - fxPending：後端知道幣別但當時抓不到匯率，台幣金額還是 0（code、original 用它自己的）
 * suggested（預設勾選）：旅程期間的 Apple Pay 列、fxPending 列；手記列與行前刷的不預設勾。
 * 刷卡帳單列（gmail_）本來就是台幣，不列。
 * @returns {Array<{entry, suggested: boolean, code: string, original: number}>}
 */
export function unconvertedTripEntries(trip, entries, trips) {
  if (!trip || !trip.currency || trip.currency === 'TWD') return [];
  const out = [];
  for (const e of entries || []) {
    if (!e || e.type === 'income' || e.transit || isStatementRow(e)) continue;
    if (entryTripId(e, trips) !== trip.id) continue;

    if (e.fxPending && e.currency && e.currency !== 'TWD' && Number(e.originalAmount) > 0) {
      out.push({ entry: e, suggested: true, code: e.currency, original: Number(e.originalAmount) });
      continue;
    }
    if (e.currency || !(Number(e.amount) > 0)) continue;
    const duringTrip = tripForDate([trip], e.date) !== null;
    out.push({ entry: e, suggested: isLiveRow(e) && duringTrip, code: trip.currency, original: Number(e.amount) });
  }
  return out.sort((a, b) => (a.entry.date || '').localeCompare(b.entry.date || ''));
}

/**
 * 換算計畫：每筆依自己日期的匯率。
 * @param {Array} items  unconvertedTripEntries 的結果（已篩成使用者勾選的）
 * @param {Object} ratesByDate  { 'JPY|YYYY-MM-DD' 或 'YYYY-MM-DD': 匯率 }（1 單位外幣 = 多少台幣）
 * @param {Object} [opts]
 * @param {Array} [opts.confirmTwd]  預設勾了但使用者取消的 → 標成確認台幣，之後不再提醒（fxPending 列除外）
 * @returns {{ patches: Array<{id, patch}>, missingDates: string[], tooMany: boolean }}
 *   有任何一天沒匯率或超過上限 → patches 為空，由呼叫端提示使用者
 */
export function planFxConversion(items, ratesByDate, { confirmTwd = [] } = {}) {
  const list = items || [];
  const twd = (confirmTwd || []).filter(it => !it.entry.fxPending);
  if (list.length + twd.length > FX_CONVERT_MAX) return { patches: [], missingDates: [], tooMany: true };

  // 匯率可用「幣別|日期」或只用「日期」當鍵（同趟多半只有一種幣別）
  const rateOf = (it) => Number(ratesByDate?.[`${it.code}|${it.entry.date}`] ?? ratesByDate?.[it.entry.date]);
  const missing = [...new Set(list.filter(it => !(rateOf(it) > 0)).map(it => it.entry.date))].sort();
  if (missing.length) return { patches: [], missingDates: missing, tooMany: false };

  const patches = list.map(it => ({
    id: it.entry.id,
    patch: { ...entryAmountFields(it.original, it.code, rateOf(it)), fxPending: undefined },
  }));
  twd.forEach(it => patches.push({ id: it.entry.id, patch: { currency: 'TWD' } }));
  return { patches, missingDates: [], tooMany: false };
}

/** 換算前的快照 → 復原用的逐筆修改（原本沒有的欄位明確寫 undefined，才蓋得掉換算後的值） */
export function fxRestorePatches(beforeEntries) {
  return (beforeEntries || []).map(e => ({
    id: e.id,
    patch: {
      amount: e.amount,
      currency: e.currency,
      originalAmount: e.originalAmount,
      fxRate: e.fxRate,
      fxCustom: e.fxCustom,
      fxPending: e.fxPending,
    },
  }));
}
