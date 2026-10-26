import { motion } from 'framer-motion';
import IconRenderer from '../../lib/IconRenderer';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { formatAmount } from '../../lib/utils';

export default function LifeEntryRow({
  entry,
  idx = 0,
  isJustSaved = false,
  reward = null,
  lifeCategories = [],
  lifeIncomeCategories = [],
  paymentMethods = [],
  onEdit,
  onDelete,
}) {
  const isIncome = entry.type === 'income';
  const cat = isIncome
    ? (lifeIncomeCategories.find(c => c.id === entry.categoryId) || { name: '收入', color: '#3D7A5A' })
    : (lifeCategories.find(c => c.id === entry.categoryId) || { name: '支出', color: '#6B6B6B' });

  const isCard = !isIncome && (
    paymentMethods.find(p => p.id === entry.paymentMethod)?.type === 'card' ||
    entry.paymentMethod === 'card' ||
    entry.paymentMethod === 'credit_card_default'
  );

  return (
    <motion.div
      key={entry.id}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.15, delay: idx * 0.01, ease: 'easeOut' }}
      className={`${isIncome ? 'life-income-row' : 'life-exp-row'}${isJustSaved ? ' life-row-flash' : ''}`}
      data-entry-id={entry.id}
    >
      <div
        className={isIncome ? 'life-income-arrow' : 'life-exp-dot'}
        style={{ background: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {cat.icon && <IconRenderer name={cat.icon} size={14} color={cat.iconColor || '#fff'} />}
      </div>
      <div className="life-exp-info">
        <div className="life-item-main-line">
          <span className="life-item-cat-name">{cat.name}</span>
          {entry.note && (
            <>
              <span className="life-item-note-sep">·</span>
              <span className="life-item-note" title={entry.note}>{entry.note}</span>
            </>
          )}
          {isCard && (
            <i className="fa-solid fa-credit-card" style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: 4 }}></i>
          )}
        </div>
      </div>
      <div className="life-exp-amount-wrap">
        <div className={isIncome ? 'life-income-amount' : 'life-exp-amount stat-negative'}>
          {isIncome ? '+' : '-'} NT$ <AnimatedNumber value={Math.round(entry.amount)} format={v => formatAmount(v, isIncome ? 'income' : 'expense')} />
        </div>
        {reward && (
          <div className="life-exp-reward-inline">
            <i className="fa-solid fa-gift"></i> +<AnimatedNumber value={reward.amount} />{reward.rate ? ` (${reward.rate})` : ''}
          </div>
        )}
      </div>
      <div className="life-item-actions">
        {onEdit && (
          <button className="icon-btn" onClick={() => onEdit(entry)} title="編輯">
            <i className="fa-solid fa-pen"></i>
          </button>
        )}
        {onDelete && (
          <button className="icon-btn delete" onClick={() => onDelete(entry.id)} title="刪除">
            <i className="fa-solid fa-trash"></i>
          </button>
        )}
      </div>
    </motion.div>
  );
}
