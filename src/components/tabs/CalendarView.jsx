import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { buildMonthCalendar, groupEntriesByDay, calendarFocusRow, noteDisplayMap } from '../../lib/lifeGrouping';
import { formatAmount } from '../../lib/utils';
import AnimatedNumber from '../../lib/AnimatedNumber';
import LifeEntryRow from './LifeEntryRow';
import TripDayRow from './TripDayRow';

// 金額一律走 AnimatedNumber：按「隱藏金額」時，所有收入同一種淡出／淡入節奏，不會有的瞬間換、有的慢半拍
const fmtIncome = (v) => formatAmount(v, 'income');
const fmtExpense = (v) => formatAmount(v, 'expense');

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const COLLAPSE_SCROLL_PX = 24; // 明細往下捲超過此距離 → 月曆收成單週
const EXPAND_PULL_PX = 56;     // 收合時明細已在頂端、再往下拉超過此距離 → 展開整月
const SWIPE_PX = 28;           // 在月曆上上下滑動的判定距離
const TYPE_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' },
];
const SORT_OPTIONS = [
  { key: 'date-desc', label: '新到舊' },
  { key: 'date-asc', label: '舊到新' },
];
const buzz = (ms = 12) => { if (navigator.vibrate) navigator.vibrate(ms); };
const pad2 = (n) => String(n).padStart(2, '0');

export default function CalendarView({
  ym,
  entries = [],
  allEntries = null,     // 未篩選的本月明細：用來算被篩選藏起幾筆（沒給就不提示）
  filterLabel = null,    // 目前篩選的說明（如「只看收入」），有值時把手列顯示可移除的膠囊
  filterIcon = null,     // 膠囊前的小圖示（旅程用 fa-plane，代替「只看」兩字省寬度）
  onClearFilter,
  selectedDate,
  onSelectDate,
  onQuickAdd,
  lifeCategories = [],
  lifeIncomeCategories = [],
  paymentMethods = [],
  rewardMap = {},
  justSavedId = null,
  onEdit,
  filterType = 'all',
  setFilterType,
  sortMode = 'date-desc',
  setSortMode,
  monthSummary = null,   // { expense, income, remain, isCurrentMonth }
  onOpenOverview,
  onOpenTrip,
}) {
  const [collapsed, setCollapsed] = useState(false);   // 月曆收合成單週，讓出空間給明細
  const [listScrolled, setListScrolled] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [scrollDate, setScrollDate] = useState(null);   // 整月清單目前捲到的日期：收合時單週跟著它走
  const [rovingDate, setRovingDate] = useState(null);   // 月曆的鍵盤焦點日（整個月曆只佔一個 Tab 停點）
  const collapsedRef = useRef(false);
  const listRef = useRef(null);
  const filterWrapRef = useRef(null);
  const filterBtnRef = useRef(null);
  const gridRef = useRef(null);
  const scrollRafRef = useRef(0);
  const pendingFocusRef = useRef(null);
  const lastScrollTopRef = useRef(0);
  const pullStartYRef = useRef(null);
  const panEndAtRef = useRef(0);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;

  // 整月改成一路往下捲（不分頁，免得筆數多時狂按頁碼）；換月份、篩選、排序或選日時回到清單頂端
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
    lastScrollTopRef.current = 0;
    setScrollDate(null);
  }, [ym, filterType, sortMode, selectedDate]);

  // 篩選選單：打開時焦點移進選單；點外面關閉；按 Esc 關閉並把焦點還給篩選鈕
  useEffect(() => {
    if (!filterOpen) return undefined;
    const raf = requestAnimationFrame(() => {
      filterWrapRef.current?.querySelector('.kfp-seg-btn.is-active, .kfp-seg-btn')?.focus({ preventScroll: true });
    });
    const onDown = (e) => { if (!filterWrapRef.current?.contains(e.target)) setFilterOpen(false); };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setFilterOpen(false);
      filterBtnRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  // 月曆網格資料
  const { paddingDays, days } = useMemo(() => {
    return buildMonthCalendar(ym, entries);
  }, [ym, entries]);

  // 前後月補位的日期數字（淡色、不可點），讓每一列都是完整一週
  const { leadNums, trailNums, monthNum } = useMemo(() => {
    const [y, m] = (ym || '').split('-').map(Number);
    if (!y || !m) return { leadNums: [], trailNums: [], monthNum: 0 };
    const prevMonthDays = new Date(y, m - 1, 0).getDate();
    const lead = Array.from({ length: paddingDays }, (_, i) => prevMonthDays - paddingDays + 1 + i);
    const trailCount = (7 - ((paddingDays + days.length) % 7)) % 7;
    const trail = Array.from({ length: trailCount }, (_, i) => i + 1);
    return { leadNums: lead, trailNums: trail, monthNum: m };
  }, [ym, paddingDays, days.length]);

  // 收合時顯示的那一週：選取日 →（整月清單捲到的日期）→ 今天（本月）→ 第一週
  const followScroll = collapsed && !selectedDate && !!scrollDate;
  const focusDate = selectedDate || (followScroll ? scrollDate : null) || (todayIso.startsWith(ym) ? todayIso : null);
  // 鍵盤 Tab 停點：使用者用方向鍵走到的日期 → 焦點日 → 本月第一天
  const hasDay = (d) => !!d && days.some(x => x.date === d);
  const rovingTarget = hasDay(rovingDate) ? rovingDate : hasDay(focusDate) ? focusDate : days[0]?.date;
  const { rows: calRows, row: focusRow } = useMemo(
    () => calendarFocusRow({ paddingDays, days }, focusDate),
    [paddingDays, days, focusDate]
  );

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
  // 只有 1 筆也顯示合計（2026-11-13 使用者定）：每天的合計固定出現在同一個位置，往下掃不會時有時無
  const { dayExpense, dayIncome, showDayExpense, showDayIncome } = useMemo(() => {
    if (!selectedDate) return { dayExpense: 0, dayIncome: 0, showDayExpense: false, showDayIncome: false };
    let exp = 0, inc = 0;
    for (const e of selectedEntries) {
      const amt = Number(e.amount) || 0;
      if (e.type === 'income') inc += amt;
      else exp += amt;
    }
    return { dayExpense: exp, dayIncome: inc, showDayExpense: exp > 0, showDayIncome: inc > 0 };
  }, [selectedEntries, selectedDate]);

  // 全月依日期分組（當未選取單日 / 看整月時）
  const dayGroups = useMemo(() => {
    if (selectedDate !== null) return [];
    return groupEntriesByDay(entries);
  }, [entries, selectedDate]);

  // 篩選中被藏起來的筆數（單日看那天、整月看全月）→ 空狀態說「有 3 筆支出沒顯示」，不會誤以為沒記帳
  const hiddenText = useMemo(() => {
    if (!filterLabel || !allEntries) return '';
    const visible = new Set(entries.map(e => e.id));
    let exp = 0, inc = 0;
    for (const e of allEntries) {
      if (selectedDate && e.date !== selectedDate) continue;
      if (visible.has(e.id)) continue;
      if (e.type === 'income') inc++; else exp += e._tripDay ? (e.count || 1) : 1;
    }
    return [exp ? `${exp} 筆支出` : '', inc ? `${inc} 筆收入` : ''].filter(Boolean).join('、');
  }, [filterLabel, allEntries, entries, selectedDate]);


  // 點擊日期格子：選中則取消（還原為全月），未選中則切換為該日
  const handleCellClick = (dateStr) => {
    // 剛在月曆上滑動收合/展開，放開手指時不要順便選到日期
    if (performance.now() - panEndAtRef.current < 350) return;
    if (navigator.vibrate) navigator.vibrate(20);
    if (selectedDate === dateStr) {
      onSelectDate(null);
    } else {
      onSelectDate(dateStr);
    }
  };

  // 用 ref 鏡像目前狀態：連續 scroll 事件在重繪前也不會重複觸發開合與震動
  const toggleCollapsed = (next) => {
    const value = typeof next === 'boolean' ? next : !collapsedRef.current;
    if (value === collapsedRef.current) return;
    collapsedRef.current = value;
    buzz();
    setCollapsed(value);
  };

  // 在月曆上往上滑 → 收成單週；往下滑 → 展開整月
  const handleSheetPanEnd = (_, info) => {
    panEndAtRef.current = performance.now();
    const { x, y } = info.offset;
    if (Math.abs(y) < SWIPE_PX || Math.abs(y) < Math.abs(x)) return;
    toggleCollapsed(y < 0);
  };

  // 明細往下捲 → 月曆自動收合；只看往下的方向，往回捲或程式回到頂端不會反覆開合
  const handleListScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const top = el.scrollTop;
    setListScrolled(top > 2);
    if (!collapsedRef.current && top > COLLAPSE_SCROLL_PX && top > lastScrollTopRef.current) {
      toggleCollapsed(true);
    }
    lastScrollTopRef.current = top;

    // 整月檢視：找出目前在清單最上方的那一天（每幀最多算一次），收合的單週跟著換週
    if (!selectedDate) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        const listTop = el.getBoundingClientRect().top;
        let current = null;
        for (const s of el.querySelectorAll('.kakei-day-group-section[data-date]')) {
          if (s.getBoundingClientRect().bottom > listTop + 8) { current = s.dataset.date; break; }
        }
        setScrollDate(top > 2 ? current : null);
      });
    }
  };

  // 月曆方向鍵：左右一天、上下一週；移到被收起的週時自動展開月曆
  const handleGridKeyDown = (e) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta === undefined) return;
    const idx = days.findIndex(d => d.date === e.target?.dataset?.date);
    if (idx < 0) return;
    e.preventDefault();
    const next = Math.min(days.length - 1, Math.max(0, idx + delta));
    if (collapsedRef.current && Math.floor((paddingDays + next) / 7) !== focusRow) toggleCollapsed(false);
    pendingFocusRef.current = days[next].date;
    setRovingDate(days[next].date);
  };

  // 等重繪（含展開月曆）完成後再把焦點移到新日期
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    gridRef.current?.querySelector(`[data-date="${target}"]`)?.focus({ preventScroll: true });
  }, [rovingDate, collapsed]);

  // 明細區手勢（不用特地抓把手）：
  // - 展開時往上滑，清單已到底或內容太少捲不動 → 直接收成單週
  // - 收合時從清單最頂端往下拉 → 展開整月（同 iOS 行事曆手感）
  const canScrollDown = (el) => el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  const handleListTouchStart = (e) => {
    const el = listRef.current;
    pullStartYRef.current = el ? { y: e.touches[0].clientY, atTop: el.scrollTop <= 0 } : null;
  };
  const handleListTouchMove = (e) => {
    const start = pullStartYRef.current;
    const el = listRef.current;
    if (!start || !el) return;
    const dy = e.touches[0].clientY - start.y;
    if (!collapsedRef.current && dy < -SWIPE_PX && !canScrollDown(el)) {
      pullStartYRef.current = null;
      toggleCollapsed(true);
    } else if (collapsedRef.current && start.atTop && el.scrollTop <= 0 && dy > EXPAND_PULL_PX) {
      pullStartYRef.current = null;
      toggleCollapsed(false);
    }
  };
  // 滑鼠滾輪比照：捲不動時往下滾收合、在頂端往上滾展開
  const handleListWheel = (e) => {
    const el = listRef.current;
    if (!el || Math.abs(e.deltaY) < 8) return;
    if (e.deltaY > 0 && !collapsedRef.current && !canScrollDown(el)) toggleCollapsed(true);
    else if (e.deltaY < 0 && collapsedRef.current && el.scrollTop <= 0) toggleCollapsed(false);
  };

  // 同一家店大小寫不同（7-ELEVEN / 7-Eleven）時統一顯示，不改資料
  const noteLabels = useMemo(() => noteDisplayMap(entries), [entries]);

  const filterDirty = filterType !== 'all' || sortMode !== 'date-desc';
  const showFilter = !!(setFilterType || setSortMode);
  const showFilterPill = !!filterLabel && !!onClearFilter;
  // 篩選已經由膠囊顯示，篩選鈕上的點只剩「排序改過」時才出現，同一件事不標兩次
  const filterDot = sortMode !== 'date-desc' || (filterType !== 'all' && !showFilterPill);
  const clearFilter = () => { buzz(20); onClearFilter?.(); };

  const renderRow = (e, idx) => (
    e._tripDay ? (
      <TripDayRow key={e.id} entry={e} idx={idx} isJustSaved={e.id === justSavedId} onOpen={onOpenTrip} />
    ) : (
      <LifeEntryRow
        key={e.id}
        entry={e}
        idx={idx}
        noteLabel={noteLabels.get(String(e.note || '').trim().toLowerCase())}
        isJustSaved={e.id === justSavedId}
        reward={rewardMap[e.id]}
        lifeCategories={lifeCategories}
        lifeIncomeCategories={lifeIncomeCategories}
        paymentMethods={paymentMethods}
        onEdit={onEdit}
      />
    )
  );

  const renderEmpty = (icon, text, actionLabel, onAction, actionIcon = 'fa-solid fa-plus') => (
    <div className="kakei-day-empty-state">
      <span className="kakei-empty-icon" aria-hidden="true"><i className={icon}></i></span>
      <div className="kakei-empty-text">{text}</div>
      <button
        type="button"
        className="btn btn-outline btn-sm kakei-empty-action"
        onClick={() => { buzz(20); onAction(); }}
      >
        <i className={actionIcon} aria-hidden="true"></i>
        {actionLabel}
      </button>
    </div>
  );

  // 篩選把東西都藏起來時的空狀態：說清楚藏了什麼，按鈕改成清除篩選（不是叫你再記一筆）；
  // 篩選名稱已在把手列膠囊上，這裡不再重寫一次
  const renderFilteredEmpty = (scope) => renderEmpty(
    'fa-solid fa-filter',
    `${scope}有 ${hiddenText}被篩選隱藏`,
    '清除篩選',
    () => onClearFilter?.(),
    'fa-solid fa-xmark'
  );

  return (
    <div className={`kakei-calendar-container${collapsed ? ' is-collapsed' : ''}${listScrolled ? ' is-list-scrolled' : ''}`}>
      <motion.div className="kakei-cal-sheet" onPanEnd={handleSheetPanEnd}>
        {/* 星期標頭 */}
        <div className="kakei-cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`kakei-cal-weekday-cell${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}>
              週{w}
            </div>
          ))}
        </div>

        {/* 日期網格：收合時只露出焦點那一週，其餘列以位移帶出／帶入 */}
        <div
          className="kakei-cal-viewport"
          style={{ '--cal-rows': calRows, '--cal-focus-row': focusRow }}
        >
          <div
            className="kakei-cal-grid"
            ref={gridRef}
            onKeyDown={handleGridKeyDown}
            role="group"
            aria-label="月曆：方向鍵移動日期，Enter 選取"
          >
            {/* 上個月補位 */}
            {leadNums.map((n, i) => (
              <div key={`lead-${n}`} className={`kakei-cal-cell is-pad${i === 0 ? ' is-sun' : ''}`} aria-hidden="true">
                <span className="kakei-cal-num">{pad2(n)}</span>
              </div>
            ))}

            {/* 本月各天 */}
            {days.map((dayItem, i) => {
              const col = (paddingDays + i) % 7;
              const isToday = dayItem.date === todayIso;
              const isSelected = dayItem.date === selectedDate;
              const hasEntries = dayItem.hasExpense || dayItem.hasIncome;
              const offscreen = collapsed && Math.floor((paddingDays + i) / 7) !== focusRow;
              const isFuture = dayItem.date > todayIso;               // ISO 字串可直接比大小
              const isScrollFocus = followScroll && dayItem.date === scrollDate;
              const isTabStop = dayItem.date === rovingTarget;

              return (
                <motion.button
                  key={dayItem.date}
                  type="button"
                  data-date={dayItem.date}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleCellClick(dayItem.date)}
                  onFocus={() => setRovingDate(dayItem.date)}
                  className={`kakei-cal-cell${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${hasEntries ? '' : ' is-quiet'}${isFuture ? ' is-future' : ''}${isScrollFocus ? ' is-scroll-focus' : ''}${col === 0 ? ' is-sun' : col === 6 ? ' is-sat' : ''}`}
                  aria-label={`${Number(dayItem.date.slice(5, 7))}月${dayItem.day}日 週${WEEKDAYS[col]}${dayItem.hasExpense ? '，有支出' : ''}${dayItem.hasIncome ? '，有收入' : ''}${hasEntries ? '' : '，無紀錄'}`}
                  aria-pressed={isSelected}
                  aria-hidden={offscreen || undefined}
                  tabIndex={!offscreen && isTabStop ? 0 : -1}
                  title={isSelected ? '再次點擊取消篩選，看整月' : dayItem.date}
                >
                  {/* 1 號照樣顯示 01：月份已在頁首，不在格子裡重複 */}
                  <span className="kakei-cal-num">{pad2(dayItem.day)}</span>
                </motion.button>
              );
            })}

            {/* 下個月補位 */}
            {trailNums.map((n, i) => (
              <div
                key={`trail-${n}`}
                className={`kakei-cal-cell is-pad${(paddingDays + days.length + i) % 7 === 6 ? ' is-sat' : ''}`}
                aria-hidden="true"
              >
                <span className="kakei-cal-num">{pad2(n)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 把手列：左「看整月」＋當日合計｜中把手｜右篩選 */}
        <div className="kakei-cal-handle-row">
          <div className="kakei-cal-handle-side is-left">
            {selectedDate && (
              <button
                type="button"
                className="kakei-chip"
                onClick={() => { buzz(20); onSelectDate(null); }}
                title="回到整月明細"
              >
                <i className="fa-solid fa-list-ul" aria-hidden="true"></i>
                <span className="kakei-chip-label">看整月</span>
              </button>
            )}
          </div>

          <button
            type="button"
            className="kakei-cal-handle"
            onClick={() => toggleCollapsed()}
            aria-expanded={!collapsed}
            aria-label={collapsed ? '展開整月月曆' : '月曆收成單週，騰出明細空間'}
            title={collapsed ? '展開整月' : '收成單週'}
          >
            <span className="kakei-cal-handle-bar" aria-hidden="true" />
          </button>

          {/* 把手列只放操作；當日花費改到當天明細最上面的「當日小計」 */}
          <div className="kakei-cal-handle-side is-right">
            {/* 篩選中：一眼看得到、點一下就清掉，不用再打開選單 */}
            {showFilterPill && (
              <button
                type="button"
                className={`kakei-chip is-filter${filterIcon ? ' has-lead' : ''}`}
                onClick={clearFilter}
                aria-label={`清除篩選：${filterLabel}`}
                title={`清除篩選：${filterLabel}`}
              >
                {filterIcon && <i className={`fa-solid ${filterIcon}`} aria-hidden="true"></i>}
                <span className="kakei-chip-label">{filterLabel}</span>
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            )}
            {showFilter && (
              <div className="kakei-filter-wrap" ref={filterWrapRef}>
                <button
                  ref={filterBtnRef}
                  type="button"
                  className={`kakei-filter-btn${filterDot ? ' is-dirty' : ''}${filterOpen ? ' is-open' : ''}`}
                  onClick={() => { buzz(20); setFilterOpen(v => !v); }}
                  aria-haspopup="dialog"
                  aria-expanded={filterOpen}
                  aria-label={filterDirty ? '篩選與排序（已套用）' : '篩選與排序'}
                  title="篩選與排序"
                >
                  <i className="fa-solid fa-sliders" aria-hidden="true"></i>
                </button>
                <AnimatePresence>
                  {filterOpen && (
                    <motion.div
                      className="kakei-filter-pop"
                      role="dialog"
                      aria-label="篩選與排序"
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.16, ease: [0.2, 0, 0, 1] }}
                    >
                      {setFilterType && (
                        <div className="kfp-group">
                          <div className="kfp-label">類型</div>
                          <div className="kfp-seg" role="radiogroup" aria-label="類型">
                            {TYPE_OPTIONS.map(opt => (
                              <button
                                key={opt.key}
                                type="button"
                                role="radio"
                                aria-checked={filterType === opt.key}
                                className={`kfp-seg-btn${filterType === opt.key ? ` is-active is-${opt.key}` : ''}`}
                                onClick={() => { buzz(20); setFilterType(opt.key); }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {setSortMode && (
                        <div className="kfp-group">
                          <div className="kfp-label">排序</div>
                          <div className="kfp-seg" role="radiogroup" aria-label="排序">
                            {SORT_OPTIONS.map(opt => (
                              <button
                                key={opt.key}
                                type="button"
                                role="radio"
                                aria-checked={sortMode === opt.key}
                                className={`kfp-seg-btn${sortMode === opt.key ? ' is-active' : ''}`}
                                onClick={() => { buzz(20); setSortMode(opt.key); }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* 明細捲動區：月曆以外的空間全部給它 */}
      <div
        ref={listRef}
        className="kakei-cal-list"
        onScroll={handleListScroll}
        onTouchStart={handleListTouchStart}
        onTouchMove={handleListTouchMove}
        onWheel={handleListWheel}
      >
        {/* 每月統計：本月支出・收入；點進去看總覽與分類 */}
        {monthSummary && (
          <button
            type="button"
            className="kakei-month-summary"
            onClick={() => { buzz(20); onOpenOverview && onOpenOverview(); }}
            aria-label={`每月統計：支出 ${formatAmount(monthSummary.expense, 'expense')} 元，收入 ${formatAmount(monthSummary.income, 'income')} 元。點一下看本月總覽與分類`}
          >
            <span className="kms-icon" aria-hidden="true">
              <span className="kms-icon-top" />
              <span className="kms-icon-num">{monthNum}</span>
            </span>
            <span className="kms-main">
              <span className="kms-title">每月統計</span>
              <span className="kms-sub">
                {monthSummary.isCurrentMonth ? '還能花' : '結餘'}
                <b className={monthSummary.remain < 0 ? 'is-neg' : 'is-pos'}>
                  {monthSummary.remain < 0 ? '−' : ''}$<AnimatedNumber value={Math.abs(Math.round(monthSummary.remain))} format={fmtIncome} />
                </b>
              </span>
            </span>
            <span className="kms-side">
              <span className="is-expense">$<AnimatedNumber value={Math.round(monthSummary.expense)} format={fmtExpense} /></span>
              <span className="kms-dot" aria-hidden="true">•</span>
              <span className="is-income">$<AnimatedNumber value={Math.round(monthSummary.income)} format={fmtIncome} /></span>
              <i className="fa-solid fa-chevron-right kms-chevron" aria-hidden="true"></i>
            </span>
          </button>
        )}

        <div className="kakei-day-detail-panel">
          <div className="kakei-day-entries-list">
            {selectedDate ? (
              /* ── 單日檢視 ── */
              selectedEntries.length === 0 ? (
                hiddenText
                  ? renderFilteredEmpty('這天')
                  : renderEmpty('fa-solid fa-mug-hot', '這天還沒有記帳', '補記這天的收支', () => onQuickAdd(selectedDate))
              ) : (
                <>
                  {/* 當日小計：樣式同整月清單的日期列，但不寫日期（月曆上已選中，不重複）；只有 1 筆也顯示 */}
                  {(showDayExpense || showDayIncome) && (
                    <div className="life-day-header kakei-day-subtotal">
                      <span className="ldh-date">當日小計</span>
                      <span className="ldh-total">
                        {showDayExpense && <span className="is-expense">−$<AnimatedNumber value={dayExpense} format={fmtExpense} /></span>}
                        {showDayIncome && <span className="is-income">+$<AnimatedNumber value={dayIncome} format={fmtIncome} /></span>}
                      </span>
                    </div>
                  )}
                  <AnimatePresence mode="popLayout">
                    {selectedEntries.map(renderRow)}
                  </AnimatePresence>
                </>
              )
            ) : (
              /* ── 全月檢視（依日期分組 + 分頁） ── */
              dayGroups.length === 0 ? (
                hiddenText
                  ? renderFilteredEmpty('這個月')
                  : renderEmpty('fa-regular fa-note-sticky', '這個月還沒有記帳', '新增本月第一筆', () => onQuickAdd(`${ym}-01`))
              ) : (
                <>
                  {/* 整月一路往下捲：日期標題黏在頂端，捲動時月曆自動收成單週 */}
                  <AnimatePresence mode="popLayout">
                    {dayGroups.map(group => {
                      const gParts = (group.date || '').split('-');
                      const gWeek = group.date ? WEEKDAYS[new Date(group.date + 'T00:00:00').getDay()] : '';
                      return (
                        <div key={group.date} className="kakei-day-group-section" data-date={group.date}>
                          <div className="life-day-header">
                            <span className="ldh-date">
                              {parseInt(gParts[1], 10)}/{parseInt(gParts[2], 10)}
                              <span className="ldh-week">週{gWeek}</span>
                            </span>
                            <span className="ldh-total">
                              {/* 只有 1 筆也顯示合計，每天的日期旁固定有當日收支 */}
                              {group.total > 0 && <span className="is-expense">−$<AnimatedNumber value={group.total} format={fmtExpense} /></span>}
                              {group.incomeTotal > 0 && <span className="is-income">+$<AnimatedNumber value={group.incomeTotal} format={fmtIncome} /></span>}
                            </span>
                          </div>
                          {group.entries.map(renderRow)}
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
    </div>
  );
}
