/**
 * 旅程操作純函式（零依賴，可單元測試）：
 * 服務費判斷、可設例外的店名與顯示標籤、從旅程記一筆的預設草稿。
 */
import { tripMerchantKey } from './tripMerchants.js';

const BANK_PREFIX_RE = /^\s*\[[^\]]*\]\s*/;

/** 是否為國外交易服務費列（有 feeOf 或 note 含「國外交易服務費」） */
export function isFeeEntry(entry) {
  if (!entry) return false;
  if (entry.feeOf) return true;
  return String(entry.note || '').includes('國外交易服務費');
}

/** 取得可設為旅程例外的店名清單（台幣列且非服務費；依 tripMerchantKey 去重） */
export function exclusionNames(entry) {
  if (!entry) return [];
  if (entry.currency && entry.currency !== 'TWD') return [];
  if (isFeeEntry(entry)) return [];

  const seen = new Set();
  const out = [];
  for (const name of [entry.note, entry.liveNote]) {
    if (!name || typeof name !== 'string') continue;
    const key = tripMerchantKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** 顯示用店名：liveNote 優先，否則 note，去掉開頭的 [銀行] 前綴 */
export function exclusionLabel(entry) {
  if (!entry) return '';
  const raw = String(entry.liveNote || '').trim() ? entry.liveNote : (entry.note || '');
  return String(raw).replace(BANK_PREFIX_RE, '').trim();
}

/** 從旅程「記一筆」的預設草稿：已結束用回程日，其他用今天 */
export function tripEntryDraft(trip, today) {
  const date = trip?.endDate && today > trip.endDate ? trip.endDate : today;
  return { type: 'expense', tripId: trip?.id, date };
}
