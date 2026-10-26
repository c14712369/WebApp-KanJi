import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { buildMonthCalendar, groupEntriesByDay, paginateGroups, findEntryPage } from '../../lib/lifeGrouping';
import { formatAmount } from '../../lib/utils';
import LifeEntryRow from './LifeEntryRow';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const PAGE_SIZE = 5; // 每頁約 5 筆，行動端無需長滑即可看到完整細項

function getPaginationItems(current, total) {
  if (total <= 6) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 3) {
    return [1, 2, 3, 4, '...', total];
  }
  if (current >= total - 2) {
    return [1, '...', total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export default function CalendarView({
  ym,
  entries = [],
  selectedDate,
  onSelectDate,
  onQuickAdd,
  lifeCategories = [],
  lifeIncomeCategories = [],
  paymentMethods = [],
  rewardMap = {},
  justSavedId = null,
  onEdit,
  onDelete,
  filterType = 'all',
  setFilterType,
  sortMode = 'date-desc',
  setSortMode,
}) {
  const [page, setPage] = useState(1);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 當月份、收支類型或單日選取變更時，重設分頁
  useEffect(() => {
    setPage(1);
  }, [ym, filterType, selectedDate]);

  // 月曆網格與紅綠點資料
  const { paddingDays, days } = useMemo(() => {
    return buildMonthCalendar(ym, entries);
  }, [ym, entries]);

  // 選中日期的所有明細（若 selectedDate 為 null 則不需單日明細）
  const selectedEntries = useMemo(() => {
    if (!selectedDate) return [];
    return entries.filter(e => {
      if (e.date !== selectedDate) return false;
      if (e.type === 'income' && e._linkedExpenseId) return false;
      return true;
    });
  }, [entries, selectedDate]);

  // 單日合計（當有選取日期時）
  const { dayExpense, dayIncome } = useMemo(() => {
    if (!selectedDate) return { dayExpense: 0, dayIncome: 0 };
    let exp = 0, inc = 0;
    for (const e of selectedEntries) {
      const amt = Number(e.amount) || 0;
      if (e.type === 'income') {
        inc += amt;
      } else {
        exp += amt;
      }
    }
    return { dayExpense: exp, dayIncome: inc };
  }, [selectedEntries, selectedDate]);

  // 全月依日期分組（當未選取單日 / 看整月時）
  const dayGroups = useMemo(() => {
    if (selectedDate !== null) return [];
    return groupEntriesByDay(entries);
  }, [entries, selectedDate]);

  // 全月分頁計算（整天不切斷）
  const { totalPages, pageGroups } = useMemo(() => {
    if (selectedDate !== null) return { totalPages: 1, pageGroups: [] };
    return paginateGroups(dayGroups, page, PAGE_SIZE);
  }, [dayGroups, page, selectedDate]);

  // 存檔後若在全月模式，自動跳到新資料所在的頁數
  useEffect(() => {
    if (!justSavedId || selectedDate !== null) return;
    const targetPage = findEntryPage(dayGroups, justSavedId, PAGE_SIZE);
    if (targetPage && targetPage !== page) {
      setPage(targetPage);
    }
  }, [justSavedId, dayGroups, selectedDate, page]);


  // 格式化選定日期標題（如 10月15日 週四）
  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return '';
    const parts = selectedDate.split('-');
    if (parts.length !== 3) return selectedDate;
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const w = WEEKDAYS[d.getDay()];
    return `${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日 週${w}`;
  }, [selectedDate]);

  // 點擊日期格子：選中則取消（還原為全月），未選中則切換為該日
  const handleCellClick = (dateStr) => {
    if (navigator.vibrate) navigator.vibrate(20);
    if (selectedDate === dateStr) {
      onSelectDate(null);
    } else {
      onSelectDate(dateStr);
    }
  };

  return (
    <div className="kakei-calendar-container">
      {/* 星期標頭 */}
      <div className="kakei-cal-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="kakei-cal-weekday-cell">
            {w}
          </div>
        ))}
      </div>

      {/* 日期網格 */}
      <div className="kakei-cal-grid">
        {/* 前置佔位格 */}
        {Array.from({ length: paddingDays }).map((_, i) => (
          <div key={`pad-${i}`} className="kakei-cal-cell is-pad" aria-hidden="true" />
        ))}

        {/* 各天儲存格 */}
        {days.map((dayItem) => {
          const isToday = dayItem.date === todayIso;
          const isSelected = dayItem.date === selectedDate;

          return (
            <motion.button
              key={dayItem.date}
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => handleCellClick(dayItem.date)}
              className={`kakei-cal-cell${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`}
              aria-label={`${dayItem.date} ${dayItem.hasExpense ? '有支出' : ''} ${dayItem.hasIncome ? '有收入' : ''}`}
              title={isSelected ? '再次點擊取消篩選，看整月' : dayItem.date}
            >
              <span className="kakei-cal-num">{dayItem.day}</span>
              <div className="kakei-cal-dots-wrap">
                {dayItem.hasExpense && <span className="kakei-cal-dot dot-expense" />}
                {dayItem.hasIncome && <span className="kakei-cal-dot dot-income" />}
              </div>
            </motion.button>
          );
        })}
      </div>


      {/* 全部 / 支出 / 收入 快速過濾膠囊列 + 排序開關 */}
      {(setFilterType || setSortMode) && (
        <div className="kakei-cal-controls-row">
          {setFilterType && (
            <div className="kakei-cal-filter-bar">
              {[
                { key: 'all', label: '全部' },
                { key: 'expense', label: '支出' },
                { key: 'income', label: '收入' }
              ].map(opt => {
                const isActive = filterType === opt.key;
                return (
                  <motion.button
                    key={opt.key}
                    type="button"
                    whileTap={{ scale: 0.96 }}
                    className={`kakei-cal-filter-btn${isActive ? ' is-active' : ''}${isActive ? ` filter-${opt.key}` : ''}`}
                    onClick={() => {
                      if (navigator.vibrate) navigator.vibrate(20);
                      setFilterType(opt.key);
                    }}
                  >
                    {opt.label}
                  </motion.button>
                );
              })}
            </div>
          )}

          {setSortMode && (
            <button
              type="button"
              className="kakei-cal-sort-btn"
              title={sortMode === 'date-desc' ? '由新到舊排序（點擊改由舊到新）' : '由舊到新排序（點擊改由新到舊）'}
              aria-label={sortMode === 'date-desc' ? '由新到舊排序' : '由舊到新排序'}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(20);
                setSortMode(s => s === 'date-desc' ? 'date-asc' : 'date-desc');
              }}
            >
              <i className={`fa-solid ${sortMode === 'date-desc' ? 'fa-arrow-down-short-wide' : 'fa-arrow-up-short-wide'}`}></i>
            </button>
          )}
        </div>
      )}

      {/* 明細清單區塊：依 selectedDate 顯示單日或全月 */}
      <div className="kakei-day-detail-panel">
        {selectedDate && (
          <div className="kakei-day-detail-header">
            <div className="kakei-day-detail-date">
              <i className="fa-regular fa-calendar-check" style={{ color: 'var(--primary-color)' }}></i>
              <span>{selectedDateLabel}</span>
              <button
                type="button"
                className="kakei-pill-tag"
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(20);
                  onSelectDate(null);
                }}
                title="回到整月明細"
              >
                <i className="fa-solid fa-list-ul"></i>
                <span>看整月</span>
              </button>
            </div>

            <div className="kakei-day-detail-badges">
              {dayExpense > 0 && (
                <span className="kakei-badge badge-expense">
                  - NT$ {formatAmount(dayExpense, 'expense')}
                </span>
              )}
              {dayIncome > 0 && (
                <span className="kakei-badge badge-income">
                  + NT$ {formatAmount(dayIncome, 'income')}
                </span>
              )}
              {dayExpense === 0 && dayIncome === 0 && (
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>無收支</span>
              )}
            </div>
          </div>
        )}

        <div className="kakei-day-entries-list">
          {selectedDate ? (
            /* ── 單日檢視 ── */
            selectedEntries.length === 0 ? (
              <div className="kakei-day-empty-state">
                <span className="empty-icon" style={{ fontSize: '1.3rem', opacity: 0.65 }}>
                  <i className="fa-solid fa-mug-hot"></i>
                </span>
                <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                  本日尚無記帳紀錄
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{
                    marginTop: 4,
                    borderRadius: 'var(--radius)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    fontSize: '0.84rem',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(20);
                    onQuickAdd(selectedDate);
                  }}
                >
                  <i className="fa-solid fa-plus" style={{ color: 'var(--primary-color)' }}></i>
                  補記此日收支
                </button>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {selectedEntries.map((e, idx) => (
                  <LifeEntryRow
                    key={e.id}
                    entry={e}
                    idx={idx}
                    isJustSaved={e.id === justSavedId}
                    reward={rewardMap[e.id]}
                    lifeCategories={lifeCategories}
                    lifeIncomeCategories={lifeIncomeCategories}
                    paymentMethods={paymentMethods}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </AnimatePresence>
            )
          ) : (
            /* ── 全月檢視（依日期分組 + 分頁） ── */
            dayGroups.length === 0 ? (
              <div className="kakei-day-empty-state">
                <span className="empty-icon" style={{ fontSize: '1.3rem', opacity: 0.65 }}>
                  <i className="fa-regular fa-note-sticky"></i>
                </span>
                <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                  本月尚無任何記帳記錄
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{
                    marginTop: 4,
                    borderRadius: 'var(--radius)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    fontSize: '0.84rem',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    if (navigator.vibrate) navigator.vibrate(20);
                    onQuickAdd(`${ym}-01`);
                  }}
                >
                  <i className="fa-solid fa-plus" style={{ color: 'var(--primary-color)' }}></i>
                  新增本月第一筆收支
                </button>
              </div>
            ) : (
              <>
                {/* 全月分頁列（置於清單上方，便於快速切換且不需向下滑動） */}
                {totalPages > 1 && (
                  <div className="life-pagination-bar">
                    <button
                      type="button"
                      className="pagination-btn pagination-arrow"
                      disabled={page === 1}
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(50);
                        setPage(p => Math.max(p - 1, 1));
                      }}
                      aria-label="上一頁"
                    >
                      <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    {getPaginationItems(page, totalPages).map((item, idx) => {
                      if (item === '...') {
                        return <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>;
                      }
                      return (
                        <button
                          key={item}
                          type="button"
                          className={`pagination-btn${page === item ? ' active' : ''}`}
                          onClick={() => {
                            if (navigator.vibrate) navigator.vibrate(50);
                            setPage(item);
                          }}
                        >
                          {item}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className="pagination-btn pagination-arrow"
                      disabled={page === totalPages}
                      onClick={() => {
                        if (navigator.vibrate) navigator.vibrate(50);
                        setPage(p => Math.min(p + 1, totalPages));
                      }}
                      aria-label="下一頁"
                    >
                      <i className="fa-solid fa-chevron-right"></i>
                    </button>
                  </div>
                )}

                <AnimatePresence mode="popLayout">
                  {pageGroups.map(group => {
                    const gParts = (group.date || '').split('-');
                    const gWeek = group.date ? WEEKDAYS[new Date(group.date + 'T00:00:00').getDay()] : '';
                    return (
                      <div key={group.date} className="kakei-day-group-section">
                        <div className="life-day-header">
                          <span className="ldh-date">
                            {parseInt(gParts[1], 10)}/{parseInt(gParts[2], 10)}
                            <span className="ldh-week">（{gWeek}）</span>
                          </span>
                          <span className="ldh-total">合計 NT$ {formatAmount(group.total, 'expense')}</span>
                        </div>
                        {group.entries.map((e, idx) => (
                          <LifeEntryRow
                            key={e.id}
                            entry={e}
                            idx={idx}
                            isJustSaved={e.id === justSavedId}
                            reward={rewardMap[e.id]}
                            lifeCategories={lifeCategories}
                            lifeIncomeCategories={lifeIncomeCategories}
                            paymentMethods={paymentMethods}
                            onEdit={onEdit}
                            onDelete={onDelete}
                          />
                        ))}
                      </div>
                    );
                  })}
                </AnimatePresence>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
