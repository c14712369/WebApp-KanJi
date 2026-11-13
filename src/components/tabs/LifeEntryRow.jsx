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
  // 付款方式名稱去掉括號說明、斜線兩側空白，標籤保持短（「現金 / 其他」→「現金/其他」）
  const paymentLabel = payment?.name
    ? payment.name.replace(/\s*[（(].*?[)）]\s*/g, '').replace(/\s*\/\s*/g, '/').trim()
    : '';
  const note = (noteLabel || entry.note || '').trim();
  const title = note || cat.name;
  const metaText = [note ? cat.name : null, paymentLabel].filter(Boolean).join(' · ');
  const amountType = isIncome ? 'income' : 'expense';
  // 百萬以上縮小一號，避免擠出固定寬的金額欄
  const isLongAmount = String(Math.round(Math.abs(Number(entry.amount) || 0))).length >= 7;

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

      {/* 左側兩行：標題＋小字「分類 · 付款」（標題已是分類名時不重複）；右側只放金額，各列比例固定 */}
      <span className="kk-entry-main">
        <span className="kk-entry-title" title={title}>{title}</span>
        {(metaText || reward) && (
          <span className="kk-entry-meta" title={metaText || undefined}>
            {metaText}
            {reward && (
              <span className="kk-entry-reward">
                {metaText ? ' · ' : ''}<i className="fa-solid fa-gift" aria-hidden="true"></i> 回饋 +<AnimatedNumber value={reward.amount} format={fmtMoney} />{reward.rate ? `（${reward.rate}）` : ''}
              </span>
            )}
          </span>
        )}
      </span>

      <span className={`kk-entry-amount ${isIncome ? 'is-income' : 'is-expense'}${isLongAmount ? ' is-long' : ''}`}>
        $<AnimatedNumber value={Math.round(entry.amount)} format={v => formatAmount(v, amountType)} />
      </span>
    </motion.div>
  );
}
