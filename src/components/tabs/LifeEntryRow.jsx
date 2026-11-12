import { motion } from 'framer-motion';
import IconRenderer from '../../lib/IconRenderer';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { formatAmount, fmtMoney } from '../../lib/utils';

/**
 * 明細列（參考 MOZE）：左大圓分類圖示｜中間標題（備註/店家）＋副標｜右金額＋分類、付款方式小標籤。
 * 整列點一下編輯；刪除收在編輯視窗裡，列上不再擺鉛筆和垃圾桶。
 */
export default function LifeEntryRow({
  entry,
  idx = 0,
  noteLabel,          // 統一大小寫後的顯示寫法（由 CalendarView 算好），沒有就用原備註
  isJustSaved = false,
  reward = null,
  lifeCategories = [],
  lifeIncomeCategories = [],
  paymentMethods = [],
  onEdit,
}) {
  const isIncome = entry.type === 'income';
  const cat = isIncome
    ? (lifeIncomeCategories.find(c => c.id === entry.categoryId) || { name: '收入', color: '#3D7A5A' })
    : (lifeCategories.find(c => c.id === entry.categoryId) || { name: '支出', color: '#6B6B6B' });

  const payment = !isIncome ? paymentMethods.find(p => p.id === entry.paymentMethod) : null;
  // 付款方式名稱去掉括號說明，標籤保持短
  const paymentLabel = payment?.name ? payment.name.replace(/\s*[（(].*?[)）]\s*/g, '').trim() : '';
  const note = (noteLabel || entry.note || '').trim();
  const title = note || cat.name;
  const amountType = isIncome ? 'income' : 'expense';

  const open = () => onEdit && onEdit(entry);

  return (
    <motion.div
      key={entry.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.15, delay: idx * 0.01, ease: 'easeOut' }}
      className={`kk-entry${isIncome ? ' is-income' : ''}${isJustSaved ? ' life-row-flash' : ''}`}
      data-entry-id={entry.id}
      role={onEdit ? 'button' : undefined}
      tabIndex={onEdit ? 0 : undefined}
      aria-label={`${isIncome ? '收入' : '支出'} ${cat.name}${note ? ` ${note}` : ''} ${formatAmount(entry.amount, amountType)} 元，點一下編輯`}
      onClick={open}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
    >
      <span className="kk-entry-icon" style={{ background: cat.color }} aria-hidden="true">
        {cat.icon
          ? <IconRenderer name={cat.icon} size={20} color={cat.iconColor || '#fff'} />
          : <span className="kk-entry-initial">{cat.name.slice(0, 1)}</span>}
      </span>

      <span className="kk-entry-main">
        <span className="kk-entry-title" title={title}>{title}</span>
        {/* 分類已在右側標籤，副標只放回饋，不重複顯示 */}
        {reward && (
          <span className="kk-entry-sub is-reward">
            <i className="fa-solid fa-gift" aria-hidden="true"></i> 回饋 +<AnimatedNumber value={reward.amount} format={fmtMoney} />{reward.rate ? `（${reward.rate}）` : ''}
          </span>
        )}
      </span>

      <span className="kk-entry-side">
        <span className={`kk-entry-amount ${isIncome ? 'is-income' : 'is-expense'}`}>
          $<AnimatedNumber value={Math.round(entry.amount)} format={v => formatAmount(v, amountType)} />
        </span>
        {(note || paymentLabel) && (
          <span className="kk-entry-tags" aria-hidden="true">
            {note && <span className="kk-tag">{cat.name}</span>}
            {paymentLabel && <span className="kk-tag">{paymentLabel}</span>}
          </span>
        )}
      </span>
    </motion.div>
  );
}
