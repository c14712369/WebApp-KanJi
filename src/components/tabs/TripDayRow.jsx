import { motion } from 'framer-motion';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { formatAmount, fmtMoney } from '../../lib/utils';
import { TRIP_COLOR } from '../../lib/trips';

/**
 * 日常清單裡「當天該趟旅程」的收合列：點一下打開那趟的旅程明細抽屜。
 * 外觀對齊 LifeEntryRow（同列高、左右留白與字級），不與日常支出混排細節。
 */
export default function TripDayRow({ entry, idx = 0, isJustSaved = false, onOpen }) {
  const tripName = entry.note || '旅程';
  const count = Number(entry.count) || 0;
  const roundedAmount = Math.round(Number(entry.amount) || 0);
  const isLongAmount = String(Math.abs(roundedAmount)).length >= 7;
  const ariaLabel = `${tripName} ${count} 筆，NT$ ${formatAmount(roundedAmount, 'expense')}，打開旅程明細`;

  const handleClick = () => {
    if (navigator.vibrate) navigator.vibrate(20);
    onOpen?.(entry.tripId);
  };

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.15, delay: idx * 0.01, ease: 'easeOut' }}
      className={`kk-tripday${isJustSaved ? ' life-row-flash' : ''}`}
      style={{ '--trip-color': TRIP_COLOR }}
      data-entry-id={entry.id}
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      <span className="kk-tripday-icon" aria-hidden="true">
        <i className="fa-solid fa-plane"></i>
      </span>

      <span className="kk-tripday-main">
        <span className="kk-tripday-title" title={`${tripName} · ${count} 筆`}>
          {tripName} · {count} 筆
        </span>
      </span>

      <span className="kk-tripday-side">
        <span className={`kk-entry-amount is-expense${isLongAmount ? ' is-long' : ''}`}>
          $<AnimatedNumber value={roundedAmount} format={fmtMoney} />
        </span>
        <i className="fa-solid fa-chevron-right kk-tripday-chevron" aria-hidden="true"></i>
      </span>
    </motion.button>
  );
}
