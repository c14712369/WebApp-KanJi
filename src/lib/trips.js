/**
 * 旅程（純函式，零依賴，可單元測試）。
 * 旅程不是分類：分類回答「花在什麼」，旅程回答「為了哪趟」。
 * 明細歸屬規則（entryTripId，看「來源」；由上往下，第一條成立就停；收入一律不算旅程）：
 *   1. tripId === 'none' → 日常（使用者手動排除）
 *   2. tripId 指向存在的旅程 → 那趟旅程（使用者手動指定，例如出發前先付的住宿、機票）
 *   3. 帳單列是「國外交易服務費」（有 feeOf），且 ctx.byId 找得到它連到的那筆交易（且那筆本身沒有 feeOf）→ 跟那筆交易同一結果（不看服務費自己的日期與例外名單）
 *   4. 日期不在任何旅程期間 → 日常
 *   5. 台幣列（沒有 currency 或為 TWD）且店名在「旅程例外商家」名單 → 日常（外幣列不受影響）
 *   6. 手動列（id 不是 gmail_、live_ 開頭）→ 那趟旅程（建旅程前就記好的手動帳也會自動歸入）
 *   7. 即時列（live）、從即時列換成的帳單列（fromLive）或 id 以 live_ 開頭 → 那趟旅程（Apple Pay、Uber 收據）
 *   8. 帳單列，幣別等於旅程幣別（且不是 TWD）→ 那趟旅程
 *   9. 其他帳單列 → 日常，但列入該旅程的「待確認」（tripPendingId / pendingEntries）
 * ctx = { exclude, byId }（getTripContext 產生）：沒有 exclude 就略過第 5 條，沒有 byId 就略過第 3 條。
 */

import { isImportedId } from './syncMerge.js';
import { isTripExcluded } from './tripMerchants.js';

export const NO_TRIP = 'none';
const DAY_MS = 86400000;

const toUtc = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);

/** 起訖日涵蓋 date 的旅程；重疊時取較晚出發的（大旅程裡的小行程） */
export function tripForDate(trips, date) {
  if (!date || !Array.isArray(trips)) return null;
  let best = null;
  for (const t of trips) {
    if (!t || !t.startDate || !t.endDate) continue;
    if (date >= t.startDate && date <= t.endDate && (!best || t.startDate > best.startDate)) best = t;
  }
  return best;
}

const hasId = (id, prefix) => typeof id === 'string' && id.indexOf(prefix) === 0;
/** 帳單列：gmail_ 開頭，且不是即時列、也不是從即時列換來的 */
const isBillRow = (e) => hasId(e?.id, 'gmail_') && !e.live && !e.fromLive;

/** 這筆明細屬於哪趟旅程（id），不屬於回傳 null。規則見檔頭 1–9 條 */
export function entryTripId(entry, trips, ctx = {}) {
  if (!entry || entry.type === 'income') return null;
  const c = ctx || {};
  const tid = entry.tripId;
  if (tid === NO_TRIP) return null;                                           // 規則 1
  if (tid && (trips || []).some(t => t.id === tid)) return tid;               // 規則 2
  if (entry.feeOf && c.byId) {                                                // 規則 3
    const parent = c.byId.get(entry.feeOf);
    if (parent && !parent.feeOf) return entryTripId(parent, trips, c);
  }
  const trip = tripForDate(trips, entry.date);
  if (!trip) return null;                                                     // 規則 4
  if (c.exclude && isTripExcluded(entry, c.exclude)) return null;             // 規則 5（isTripExcluded 內部只認台幣列）
  if (!isImportedId(entry.id)) return trip.id;                                // 規則 6
  if (entry.live || entry.fromLive || hasId(entry.id, 'live_')) return trip.id; // 規則 7
  if (isBillRow(entry) && entry.currency && entry.currency !== 'TWD'
      && entry.currency === trip.currency) return trip.id;                    // 規則 8
  return null;                                                                // 規則 9（待確認見 tripPendingId）
}

/**
 * 落在第 9 條（帳單列、日期在旅程內、使用者還沒決定、不是例外、不是服務費、支出且金額 > 0）→ 回傳那趟的 id，否則 null
 */
export function tripPendingId(entry, trips, ctx = {}) {
  if (!isBillRow(entry) || entry.type === 'income' || !(Number(entry.amount) > 0)) return null;
  if (entry.tripId === NO_TRIP) return null;
  const c = ctx || {};
  if (entry.feeOf && c.byId && c.byId.has(entry.feeOf)) return null;
  const trip = tripForDate(trips, entry.date);
  if (!trip) return null;
  if (c.exclude && isTripExcluded(entry, c.exclude)) return null;
  return entryTripId(entry, trips, c) === null ? trip.id : null;
}

/** 某趟旅程的待確認列，新到舊（同日金額大到小、再依 id，順序固定） */
export function pendingEntries(trip, entries, trips, ctx = {}) {
  return (entries || [])
    .filter(e => e && tripPendingId(e, trips, ctx) === trip.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')
      || (Number(b.amount) || 0) - (Number(a.amount) || 0)
      || String(a.id || '').localeCompare(String(b.id || '')));
}

let lastCtx = null;
/**
 * 建立歸屬規則要用的 ctx。只記住上一次的 (entries, exclude) 參照，參照都沒變就回傳同一個物件
 * （讓畫面的 useMemo 依賴穩定，也避免每次重建 byId）。
 */
export function getTripContext(entries, exclude) {
  if (lastCtx && lastCtx.entries === entries && lastCtx.exclude === exclude) return lastCtx.ctx;
  const byId = new Map();
  (entries || []).forEach(e => { if (e && e.id != null) byId.set(e.id, e); });
  const ctx = { exclude, byId };
  lastCtx = { entries, exclude, ctx };
  return ctx;
}

export function tripDays(trip) {
  return Math.max(1, daysBetween(trip.startDate, trip.endDate) + 1);
}

/**
 * 一趟旅程的彙總：總額、筆數、天數、日均、分類拆解（大到小、含占比）、外幣原幣小計、明細（新到舊，同日金額大到小）。
 */
export function summarizeTrip(trip, entries, trips, categories = [], ctx = {}) {
  // 新到舊；同一天依金額由大到小（使用者 2026-11-24 定），同金額依 id 讓順序固定
  const list = (entries || [])
    .filter(e => e && e.type !== 'income' && entryTripId(e, trips, ctx) === trip.id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')
      || (Number(b.amount) || 0) - (Number(a.amount) || 0)
      || String(a.id || '').localeCompare(String(b.id || '')));
  const total = list.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const days = tripDays(trip);

  const catMap = new Map();
  const foreignMap = new Map();
  list.forEach(e => {
    const amt = Number(e.amount) || 0;
    const cat = categories.find(c => c.id === e.categoryId);
    const key = cat ? cat.id : '__none';
    const row = catMap.get(key) || { id: key, name: cat?.name || '未分類', color: cat?.color || '#8A8A8A', icon: cat?.icon, amount: 0 };
    row.amount += amt;
    catMap.set(key, row);
    if (e.currency && e.currency !== 'TWD' && Number(e.originalAmount) > 0) {
      const f = foreignMap.get(e.currency) || { code: e.currency, original: 0, twd: 0 };
      f.original += Number(e.originalAmount);
      f.twd += amt;
      foreignMap.set(e.currency, f);
    }
  });

  const byCategory = [...catMap.values()]
    .sort((a, b) => b.amount - a.amount)
    .map(c => ({ ...c, pct: total > 0 ? Math.round((c.amount / total) * 100) : 0 }));

  return {
    total,
    count: list.length,
    days,
    perDay: total > 0 ? Math.round(total / days) : 0,
    byCategory,
    foreign: [...foreignMap.values()].map(f => ({ ...f, original: Math.round(f.original * 100) / 100 })),
    entries: list,
  };
}

/**
 * 旅程明細抽屜：依分類篩選（catId＝summarizeTrip 的分類 id，'__none' 是未分類；null 不篩），
 * 再依日分組（沿用傳入順序，summarizeTrip 已排成新到舊），每組附當日小計。
 */
export function groupTripEntries(entries, catId, categories = []) {
  const known = new Set((categories || []).map(c => c.id));
  const keyOf = (e) => (known.has(e.categoryId) ? e.categoryId : '__none');
  const out = [];
  (entries || []).forEach(e => {
    if (catId && keyOf(e) !== catId) return;
    const amt = Number(e.amount) || 0;
    const last = out[out.length - 1];
    if (last && last.date === e.date) { last.items.push(e); last.sum += amt; }
    else out.push({ date: e.date, items: [e], sum: amt });
  });
  return out;
}

/** 11/14–11/22；跨年寫完整年份 */
export function formatTripRange(trip) {
  const [sy, sm, sd] = trip.startDate.split('-').map(Number);
  const [ey, em, ed] = trip.endDate.split('-').map(Number);
  if (sy === ey) return `${sm}/${sd}–${em}/${ed}`;
  return `${sy}/${sm}/${sd}–${ey}/${em}/${ed}`;
}

/** ongoing（第幾天）／upcoming（還有幾天）／past */
export function tripStatus(trip, today) {
  if (today < trip.startDate) return { kind: 'upcoming', daysUntil: daysBetween(today, trip.startDate) };
  if (today > trip.endDate) return { kind: 'past' };
  return { kind: 'ongoing', day: daysBetween(trip.startDate, today) + 1 };
}

export function sortTrips(trips) {
  return [...(trips || [])].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}

export function validateTrip({ name, startDate, endDate }) {
  const e = {};
  if (!String(name || '').trim()) e.name = '請輸入旅程名稱';
  if (!startDate) e.startDate = '請選擇出發日';
  if (!endDate) e.endDate = '請選擇回程日';
  else if (startDate && endDate < startDate) e.endDate = '回程不能早於出發日';
  return e;
}

/** 記一筆抽屜打開時的旅程選項：編輯照該筆歸屬；新增看日期落在哪趟。回傳旅程 id 或 'none' */
export function sheetTripDefault(trips, date, initial, ctx = {}) {
  if (initial?.id) return entryTripId(initial, trips, ctx) || NO_TRIP;
  // 新增：從旅程裡按「記一筆」會帶 initial.tripId，指向存在的旅程就照它
  if (initial?.tripId && (trips || []).some(t => t.id === initial.tripId)) return initial.tripId;
  return tripForDate(trips, date)?.id || NO_TRIP;
}

/**
 * 存檔時的 tripId：選了旅程 → 存 id（改旅程日期也跟著走）；
 * 選「不屬於旅程」但日期落在某趟裡 → 存 'none' 才排除得掉；其餘不存（undefined，JSON 會丟掉）
 */
export function tripIdToSave(selected, trips, date) {
  if (selected && selected !== NO_TRIP) return selected;
  return tripForDate(trips, date) ? NO_TRIP : undefined;
}

// ── 每月統計：日常與旅程拆開（全部是台幣）──────────────────────────────────
export const TRIP_COLOR = '#2B9FD8';
const TRIP_FILTER_PREFIX = 'trip:';

/** 支出是否算在某趟旅程（收入一律不算） */
const tripOfExpense = (e, trips, ctx) => (e && e.type !== 'income' ? entryTripId(e, trips, ctx) : null);

/**
 * 某月（'YYYY-MM'）的支出拆成：
 *   daily：日常各分類（照 categories 原順序、只列有花的；不含旅程）＋ uncategorized（分類被刪掉的）
 *   trips：每趟一行（大到小）；只算日期在這個月的明細，行前先付的算在付款那個月
 * dailyTotal + tripTotal = 當月全部支出。
 */
export function splitMonthSpend(entries, trips, ym, categories = [], ctx = {}) {
  const catIds = new Set(categories.map(c => c.id));
  const byCat = new Map();
  const byTrip = new Map();
  let uncategorized = 0;
  (entries || []).forEach(e => {
    if (!e || e.type === 'income' || !(e.date || '').startsWith(ym)) return;
    const amt = Number(e.amount) || 0;
    const tid = entryTripId(e, trips, ctx);
    if (tid) { byTrip.set(tid, (byTrip.get(tid) || 0) + amt); return; }
    if (catIds.has(e.categoryId)) byCat.set(e.categoryId, (byCat.get(e.categoryId) || 0) + amt);
    else uncategorized += amt;
  });
  const daily = categories.filter(c => byCat.get(c.id) > 0).map(c => ({ ...c, amount: byCat.get(c.id) }));
  const tripRows = [...byTrip.entries()]
    .map(([id, amount]) => ({ id, name: (trips || []).find(t => t.id === id)?.name || '旅程', amount }))
    .sort((a, b) => b.amount - a.amount);
  const dailyTotal = daily.reduce((s, c) => s + c.amount, 0) + uncategorized;
  return { daily, uncategorized, dailyTotal, trips: tripRows, tripTotal: tripRows.reduce((s, t) => s + t.amount, 0) };
}

/** 篩選值：分類 id，或 'trip:<旅程 id>' */
export const tripFilterId = (id) => TRIP_FILTER_PREFIX + id;
export const tripIdFromFilter = (filterId) =>
  (typeof filterId === 'string' && filterId.startsWith(TRIP_FILTER_PREFIX) ? filterId.slice(TRIP_FILTER_PREFIX.length) : null);

/** 明細是否符合篩選：點分類只看「日常」的該分類（金額才對得上），點旅程只看那一趟 */
export function matchesCatFilter(entry, filterId, trips, ctx = {}) {
  const tid = tripIdFromFilter(filterId);
  if (tid) return tripOfExpense(entry, trips, ctx) === tid;
  return entry.categoryId === filterId && !tripOfExpense(entry, trips, ctx);
}
