/**
 * 旅程規則 v2 一次性移轉（純函式，零依賴，可單元測試）。
 * 把「舊規則有歸入旅程、新規則會掉出去」的支出明細（主要是台幣帳單列）鎖定成原旅程 id，
 * 讓改版後既有旅程（如東京賞楓）的總額與筆數不變。
 */
import { entryTripId, tripForDate, NO_TRIP } from './trips.js';

export const TRIP_MIGRATION_FLAG = 'sub_mgr_trip_rules_v2';
export const TRIP_MIGRATION_SNAPSHOT = 'sub_mgr_trip_rules_v2_snapshot';
export const TRIP_MIGRATION_MAX = 200;

/** 舊規則的原樣複本（tripId === 'none' > tripId 指向存在的旅程 > 依日期），只給移轉用 */
export function legacyEntryTripId(entry, trips) {
  if (!entry) return null;
  if (entry.tripId === NO_TRIP) return null;
  if (entry.tripId && (trips || []).some(t => t.id === entry.tripId)) return entry.tripId;
  return tripForDate(trips, entry.date)?.id || null;
}

/**
 * 規劃要寫入 tripId 的明細清單：
 * 支出、tripId 不是 'none' 且沒指向存在的旅程、舊規則有歸入、新規則沒歸入 → { id, tripId }。
 * 維持 entries 原順序。
 */
export function planTripMigration(entries, trips, ctx = {}) {
  if (!Array.isArray(entries)) return [];
  const tripIds = new Set((trips || []).filter(Boolean).map(t => t.id));
  const plan = [];
  for (const e of entries) {
    if (!e || e.type === 'income') continue;
    if (e.tripId === NO_TRIP || (e.tripId && tripIds.has(e.tripId))) continue;
    const legacy = legacyEntryTripId(e, trips);
    if (!legacy) continue;
    if (entryTripId(e, trips, ctx) !== null) continue;
    plan.push({ id: e.id, tripId: legacy });
  }
  return plan;
}
