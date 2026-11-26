import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls, useReducedMotion } from 'framer-motion';
import { groupTripEntries } from '../../lib/trips';
import { exclusionLabel } from '../../lib/tripActions';
import { fmtMoney } from '../../lib/utils';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import LifeEntryRow from './LifeEntryRow';

/**
 * 旅程明細：旅程卡只放總覽，明細在這裡看，主頁面不會被撐長。
 * - 手機：底部抽屜（把手可往下拉關閉）；桌機：置中對話框（沒有把手、淡入）
 * - 分類膠囊切換「全部／只看某分類」（操作列不放金額）
 * - 膠囊下方固定一列「目前篩選的筆數與合計」（資料列），捲動時不跟著跑；日期列黏在清單頂端
 * - 固定高度：切換分類時大小不變，內容在區內捲動
 * 層級 990/991：高於底部導覽（900），低於記一筆抽屜（998/999），所以點明細編輯時抽屜會疊在上面。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y) return '';
  return `${m}/${d}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
};
const shortDate = (iso) => {
  const [, m, d] = String(iso || '').split('-').map(Number);
  return m ? `${m}/${d}` : '';
};

export default function TripEntriesSheet({
  trip, summary, initialCatId = null, onClose, onEditEntry, justSavedId, entrySheetOpen = false,
  lifeCategories, lifeIncomeCategories, paymentMethods,
  pending = [], onDecide, onAddEntry,
}) {
  const [catId, setCatId] = useState(initialCatId);
  const sheetRef = useRef(null);
  const listRef = useRef(null);
  const returnFocusRef = useRef(null);
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const isDialog = useMediaQuery('(min-width: 769px)');

  // 分類被改掉、該分類的明細都沒了 → 回到全部
  const cats = summary.byCategory;
  const activeId = catId && cats.some(c => c.id === catId) ? catId : null;
  const active = cats.find(c => c.id === activeId) || null;
  const groups = useMemo(() => groupTripEntries(summary.entries, activeId, lifeCategories), [summary.entries, activeId, lifeCategories]);
  const showPending = !activeId && pending.length > 0;
  const shownCount = groups.reduce((s, g) => s + g.items.length, 0);
  const shownSum = groups.reduce((s, g) => s + g.sum, 0);

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      const el = returnFocusRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, []);

  // 換分類回到清單頂端，不會停在上一個分類捲到的位置
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [activeId]);

  const pick = (id) => {
    if (navigator.vibrate) navigator.vibrate(20);
    setCatId(id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && !entrySheetOpen) { e.stopPropagation(); onClose(); }
  };
  const handleDragEnd = (_, info) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
  };
  const sheetTransition = reduceMotion ? { duration: 0 } : { type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] };
  // 手機從底部滑上來、可拖曳關閉；桌機置中淡入、微微上浮
  const motionProps = isDialog
    ? {
      initial: { opacity: 0, y: 12, scale: 0.98 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: 8, scale: 0.98 },
      transition: reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.32, 0.72, 0, 1] },
    }
    : {
      initial: { y: '100%' },
      animate: { y: 0 },
      exit: { y: '100%' },
      transition: sheetTransition,
      drag: 'y',
      dragControls,
      dragListener: false,
      dragConstraints: { top: 0, bottom: 0 },
      dragElastic: { top: 0, bottom: 0.7 },
      onDragEnd: handleDragEnd,
    };

  return createPortal(
    <>
      <motion.div
        className="tp-sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        ref={sheetRef}
        className={`tp-sheet${isDialog ? ' is-dialog' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpSheetTitle"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        {...motionProps}
      >
        <div className="tp-sheet-head" onPointerDown={isDialog ? undefined : (e) => dragControls.start(e)}>
          {!isDialog && <span className="kk-sheet-grabber" aria-hidden="true" />}
          <div className="tp-sheet-titlerow">
            <h2 id="tpSheetTitle" className="tp-sheet-title">
              <i className="fa-solid fa-plane" aria-hidden="true"></i>
              <span>{trip.name}</span>
            </h2>
            <div className="tp-sheet-actions" onPointerDown={e => e.stopPropagation()}>
              {onAddEntry && (
                <button type="button" className="btn btn-ghost btn-sm tp-add-entry-btn" onClick={onAddEntry}>
                  <i className="fa-solid fa-plus" aria-hidden="true"></i> 記一筆
                </button>
              )}
              <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
        </div>

        {/* 操作列：只放分類切換 */}
        <div className="tp-sheet-chips" role="tablist" aria-label="依分類篩選">
          <button type="button" role="tab" aria-selected={!activeId} className={`tp-chip${!activeId ? ' is-active' : ''}`} onClick={() => pick(null)}>
            全部
          </button>
          {cats.map(c => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={activeId === c.id}
              className={`tp-chip${activeId === c.id ? ' is-active' : ''}`}
              onClick={() => pick(c.id)}
            >
              <span className="tp-chip-dot" style={{ background: c.color }} aria-hidden="true" />
              {c.name}
            </button>
          ))}
        </div>

        {/* 資料列：目前篩選的筆數與合計（固定在膠囊下方，捲動時一直看得到） */}
        <div className="tp-sheet-sum" aria-live="polite">
          <span>{active ? active.name : '全部'} · {shownCount} 筆</span>
          <span className="tp-sheet-sum-amt">−${fmtMoney(shownSum)}</span>
        </div>

        <div className="tp-sheet-list" ref={listRef}>
          {showPending && (
            <section className="tp-pending" aria-label="待確認刷卡">
              <h3 className="tp-pending-head">
                <i className="fa-solid fa-circle-question" aria-hidden="true"></i>
                <span>待確認 {pending.length} 筆 · 旅程期間的刷卡，是旅費嗎？</span>
              </h3>
              <ul className="tp-pending-list">
                {pending.map(e => (
                  <li key={e.id} className="tp-pending-row">
                    <div className="tp-pending-top">
                      <span className="tp-pending-name" title={exclusionLabel(e) || undefined}>
                        {exclusionLabel(e) || '未命名'}
                      </span>
                      <span className="tp-pending-amt">−${fmtMoney(Math.round(Number(e.amount) || 0))}</span>
                    </div>
                    <div className="tp-pending-bottom">
                      <span className="tp-pending-date">{shortDate(e.date)}</span>
                      <span className="tp-pending-actions">
                        <button type="button" className="btn btn-ghost btn-sm tp-pending-btn" onClick={() => onDecide?.(e, 'daily')}>日常</button>
                        <button type="button" className="btn btn-ghost btn-sm tp-pending-btn is-trip" onClick={() => onDecide?.(e, 'trip')}>算旅費</button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {groups.length === 0 && !showPending && (
            <p className="tp-empty-note">這趟還沒有明細</p>
          )}
          {groups.map(g => (
            <section key={g.date} className="tp-day">
              <h3 className="tp-day-head">
                <span>{dayLabel(g.date)}</span>
                {(g.date < trip.startDate || g.date > trip.endDate) && <span className="tp-day-tag">行前</span>}
                <span className="tp-day-sum">−${fmtMoney(g.sum)}</span>
              </h3>
              {g.items.map(e => (
                <LifeEntryRow
                  key={e.id}
                  entry={e}
                  lifeCategories={lifeCategories}
                  lifeIncomeCategories={lifeIncomeCategories}
                  paymentMethods={paymentMethods}
                  isJustSaved={e.id === justSavedId}
                  onEdit={onEditEntry}
                  hideTrip
                  hideCategory={!!activeId}
                />
              ))}
            </section>
          ))}
        </div>
      </motion.div>
    </>,
    document.body
  );
}
