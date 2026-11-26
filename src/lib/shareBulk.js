/**
 * 幫大家付：存檔後的批次套用候選篩選（獨立成檔以避免 share.js 與 trips.js 循環依賴）。
 */
import { isShared } from './share.js';
import { entryTripId } from './trips.js';
import { tripMerchantKey } from './tripMerchants.js';

const isFeeRow = (e) => !!(e?.feeOf) || String(e?.note || '').includes('國外交易服務費');

/**
 * 找出同一趟旅程、同一家店、還沒設過幫大家付、不是服務費且非自己的支出列。
 */
export function bulkShareTargets(entry, entries, trips, ctx = {}) {
  if (!entry || entry.type === 'income' || isFeeRow(entry)) return [];
  const tid = entryTripId(entry, trips, ctx);
  const key = tripMerchantKey(entry.note);
  if (!tid || !key) return [];
  return (entries || []).filter(e =>
    e && e.id !== entry.id && e.type !== 'income' && !isFeeRow(e) && !isShared(e)
    && tripMerchantKey(e.note) === key && entryTripId(e, trips, ctx) === tid
  );
}
