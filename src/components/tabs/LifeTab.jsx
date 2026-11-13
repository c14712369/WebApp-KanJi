import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from '../../store/appStore';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { lifeMonthLabel, formatAmount, fmtMoney, showToast, getFixedLifeMonthly, confirmDialog } from '../../lib/utils';
import { SALARY_DEFAULT_KEY, DAILY_EXP_KEY } from '../../lib/constants';
import AnimatedNumber from '../../lib/AnimatedNumber';
import IconRenderer from '../../lib/IconRenderer';
import { sortEntries } from '../../lib/lifeGrouping';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { isImportedId } from '../../lib/syncMerge';
import { computeSpendPace } from '../../lib/spendPace';
import { normalizeSalaryConfig, shouldApplySalaryToMonth, salaryDateForMonth, planSalaryUpdates } from '../../lib/salarySchedule';
import LifeEntryRow from './LifeEntryRow';
import CalendarView from './CalendarView';
import EntrySheet from './EntrySheet';
import '../../entry-sheet.css';

const localYm = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

// 進度條：從 0 滑動至目標寬度
function BarFill({ value, className, id }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(value), 60);
    return () => clearTimeout(t);
  }, [value]);
  return <div id={id} className={className} style={{ width: `${w}%` }} />;
}

function StackedExpenseBar({ value, segments, id }) {
  const [width, setWidth] = useState(0);
  const total = segments.reduce((sum, segment) => sum + segment.amount, 0);

  useEffect(() => {
    const t = setTimeout(() => setWidth(value), 60);
    return () => clearTimeout(t);
  }, [value]);

  const summary = segments
    .map(segment => `${segment.label} ${Math.round((segment.amount / total) * 100)}%`)
    .join('、');

  return (
    <div
      id={id}
      className="expense-progress-stack"
      style={{ width: `${width}%` }}
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(value)}
      aria-label={`總支出 ${Math.round(value)}%；${summary}`}
    >
      {segments.map(segment => {
        const share = total > 0 ? (segment.amount / total) * 100 : 0;
        return (
          <span
            key={segment.id}
            className="expense-progress-segment"
            style={{ flexBasis: `${share}%`, backgroundColor: segment.color }}
            title={`${segment.label}：NT$ ${formatAmount(Math.round(segment.amount))}（占支出 ${Math.round(share)}%）`}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}

const LIFE_SECTIONS = [
  { id: 'overview', label: '本月總覽', icon: 'fa-gauge-high' },
  { id: 'exp', label: '收支明細', icon: 'fa-list-ul' },
  { id: 'cat', label: '收支分類', icon: 'fa-shapes' },
];


// ── Salary Modal ─────────────────────────────────────────────────────────────
function SalaryModal({ lifeIncomeCategories, lifeExpenses, updateLifeExpense, onSaved, onClose }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SALARY_DEFAULT_KEY)); } catch { return null; } })();
  const [amount, setAmount] = useState(saved?.amount || '');
  const [catId,  setCatId]  = useState(saved?.catId  || lifeIncomeCategories[0]?.id || '');
  const [day,    setDay]    = useState(saved?.day    || 5);

  const handleSave = () => {
    if (!amount || Number(amount) <= 0) { showToast('請輸入薪資金額', 'error'); return; }
    // 新設定從儲存當月起生效：過往月份的薪資保持原樣，當月與之後的自動薪資逐筆更新
    const currentYm = localYm();
    const next = { amount: Number(amount), catId, day: parseInt(day), effectiveFrom: currentYm };
    const plan = planSalaryUpdates(lifeExpenses, saved, next, currentYm);
    localStorage.setItem(SALARY_DEFAULT_KEY, JSON.stringify(next));
    if (plan.length) console.log(`薪資設定更新 ${plan.length} 筆自動薪資（${currentYm} 起）:`, plan.map(p => p.id));
    plan.forEach(p => updateLifeExpense(p.id, p.patch));
    showToast(plan.length ? `預設薪資已儲存，已更新 ${plan.length} 筆` : '預設薪資已儲存');
    onSaved(); onClose();
  };
  const handleClear = async () => {
    if (!await confirmDialog({ title: '清除預設薪資', message: '確定要清除預設薪資設定嗎？', confirmText: '清除' })) return;
    localStorage.removeItem(SALARY_DEFAULT_KEY);
    showToast('已清除'); onClose();
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 360 }} onPointerDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>薪資設定</h3>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="form-group">
          <label className="form-label">月薪金額</label>
          <input className="form-input" type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">收入分類</label>
          <select className="form-select" value={catId} onChange={e => setCatId(e.target.value)}>
            {lifeIncomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">每月幾號入帳</label>
          <input className="form-input" type="number" inputMode="numeric" min="1" max="28" value={day} onChange={e => setDay(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}>
            <i className="fa-solid fa-check"></i> 儲存
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleClear}>清除設定</button>
        </div>
      </div>
    </div>
  );
}

// ── Main LifeTab ─────────────────────────────────────────────────────────────
export default function LifeTab() {
  const {
    items,
    lifeExpenses, lifeCategories, lifeIncomeCategories,
    lifeBudgets, lifeCurrentMonth, paymentMethods,
    lifePendingCatId,
    addLifeExpense, updateLifeExpense, deleteLifeExpense, setLifeCurrentMonth,
    setLifePendingCatId,
    setLifeCategories, learnLifeCategory,
    activeTab, pendingAdd, setPendingAdd,
  } = useAppStore();

  // 手機版：月份切換列放進單列頁首（Header 的 #mobileHeaderSlot），不另外佔一列
  const isMobile = useMediaQuery('(max-width: 768px)');
  const [headerSlot, setHeaderSlot] = useState(null);
  useEffect(() => { setHeaderSlot(document.getElementById('mobileHeaderSlot')); }, []);

  const [selectedCatId, setSelectedCatId] = useState(null);
  const [sortMode,      setSortMode]      = useState('date-desc');
  const [lifeView,      setLifeView]      = useState('exp');
  const [expModal,      setExpModal]      = useState(null);
  const [newType,       setNewType]       = useState('expense');
  const [showSalary,    setShowSalary]    = useState(false);
  const [salaryVersion, setSalaryVersion] = useState(0); // 儲存薪資設定後重跑自動入帳
  const [filterType,    setFilterType]    = useState('all'); // 'all' | 'expense' | 'income'
  const [justSavedId,   setJustSavedId]   = useState(null);  // 剛存檔的那筆：聚焦並閃爍
  const prefersReducedMotion = useReducedMotion();
  const ym = lifeCurrentMonth;

  // 選取的日曆日期：當月預設為今日，其他月份預設為 null（看整月）
  const [selectedCalDate, setSelectedCalDate] = useState(() => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return ym === localYm() ? todayStr : null;
  });

  // 跨月切換時同步選定日期
  useEffect(() => {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (ym === localYm()) {
      setSelectedCalDate(todayStr);
    } else {
      setSelectedCalDate(null);
    }
  }, [ym]);

  // 底部導覽中間「＋」→ 開新增支出視窗（從其他分頁按也會先切過來再開）
  useEffect(() => {
    if (pendingAdd !== 'life') return;
    setPendingAdd(null);
    setNewType('expense');
    setExpModal({});
  }, [pendingAdd]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleQuickAdd = (targetDate) => {
    if (navigator.vibrate) navigator.vibrate(50);
    setNewType('expense');
    setExpModal({ date: targetDate });
  };

  // When category filter is selected, automatically align type filter to expense
  useEffect(() => {
    if (selectedCatId !== null) {
      setFilterType('expense');
    }
  }, [selectedCatId]);

  // Apply cross-tab category filter (from AnalysisTab click)
  useEffect(() => {
    if (!lifePendingCatId) return;
    setSelectedCatId(lifePendingCatId);
    setLifeView('exp');
    setLifePendingCatId(null);
  }, [lifePendingCatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-apply salary ──
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(SALARY_DEFAULT_KEY));
      if (!raw) return;
      const currentYm = localYm();
      const s = normalizeSalaryConfig(raw, currentYm);
      // 舊設定補上生效月份後寫回，之後月份前進時才不會一直往後推
      if (s !== raw) localStorage.setItem(SALARY_DEFAULT_KEY, JSON.stringify(s));
      if (!shouldApplySalaryToMonth(s, ym, currentYm)) return;
      const alreadyApplied = lifeExpenses.some(e =>
        (e.date || '').startsWith(ym) && (e._autoSalary || e._salaryDefault)
      );
      if (alreadyApplied) return;
      addLifeExpense({
        id: crypto.randomUUID(), type: 'income',
        categoryId: s.catId, amount: s.amount,
        date: salaryDateForMonth(ym, s.day),
        note: '薪資 (自動)', _autoSalary: true,
      });
    } catch {}
  }, [ym, salaryVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-apply daily expenses ──
  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem(DAILY_EXP_KEY) || '[]');
      list.forEach(rule => {
        if (!lifeExpenses.some(e => e._autoDailyId === rule.id && (e.date || '').startsWith(ym))) {
          addLifeExpense({
            id: crypto.randomUUID(), type: 'expense',
            categoryId: rule.catId, amount: rule.amount,
            date: ym + '-01', note: rule.name, _autoDailyId: rule.id,
          });
        }
      });
    } catch {}
  }, [ym]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed stats ──
  const tInc   = lifeExpenses.filter(e => e.type === 'income' && (e.date || '').startsWith(ym)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const tExp   = lifeExpenses.filter(e => e.type !== 'income' && (e.date || '').startsWith(ym)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  // 每月現金固定支出（信用卡項目已由 Gmail 記帳匯入明細、計在 tExp，不重複加）
  const fixedMonthly = Math.round(getFixedLifeMonthly(items, ym));
  const now      = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const pace     = computeSpendPace({ ym, today: todayIso, income: tInc, spent: tExp, fixed: fixedMonthly });
  const totalSpent = tExp + fixedMonthly;
  const remain   = pace.remain;
  const pct      = tInc > 0 ? Math.min(Math.round((totalSpent / tInc) * 100), 100) : 0;
  const timePct  = pace.isCurrentMonth ? Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100) : null;

  // ── Category summary ──
  const catSummary = lifeCategories.map(cat => {
    const spent  = lifeExpenses.filter(e => e.categoryId === cat.id && (e.date || '').startsWith(ym) && e.type !== 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const budget = lifeBudgets[cat.id + '|' + ym] || 0;
    return { ...cat, spent, budget, isOver: budget > 0 && spent > budget };
  }).filter(c => c.spent > 0);

  const categorizedSpent = catSummary.reduce((sum, cat) => sum + cat.spent, 0);
  const uncategorizedSpent = Math.max(0, tExp - categorizedSpent);
  const expenseSegments = [
    ...catSummary.map(cat => ({ id: cat.id, label: cat.name, color: cat.color, amount: cat.spent })),
    ...(uncategorizedSpent > 0 ? [{ id: 'uncategorized', label: '未分類', color: '#8A8A8A', amount: uncategorizedSpent }] : []),
    ...(fixedMonthly > 0 ? [{ id: 'fixed', label: '固定支出', color: '#64748B', amount: fixedMonthly }] : []),
  ];

  // ── Reward map ──
  const rewardMap = {};
  lifeExpenses.forEach(e => {
    if (e.type === 'income' && e._linkedExpenseId) {
      const m = (e.note || '').match(/\(([^)]*%)\)/);
      rewardMap[e._linkedExpenseId] = { amount: e.amount, rate: m ? m[1] : '' };
    }
  });

  // ── Filtered + sorted list ──
  // 同一天內：收入在前 → 依分類設定順序分組 → 同分類內備註同群的相鄰、依金額由大到小
  const catOrder = {};
  [...lifeIncomeCategories, ...lifeCategories].forEach((c, i) => { if (!(c.id in catOrder)) catOrder[c.id] = i; });
  const calEntries = sortEntries(
    lifeExpenses.filter(e => {
      if (!(e.date || '').startsWith(ym)) return false;
      if (e.type === 'income' && e._linkedExpenseId) return false;
      if (selectedCatId !== null && e.categoryId !== selectedCatId) return false;
      if (filterType !== 'all' && e.type !== filterType) return false;
      return true;
    }),
    { catOrder, dir: sortMode === 'date-desc' ? 'desc' : 'asc' }
  );

  // 存檔後聚焦該筆日期、捲過去並閃爍提示
  useEffect(() => {
    if (!justSavedId) return;
    const savedEntry = lifeExpenses.find(e => e.id === justSavedId);
    if (savedEntry && savedEntry.date) {
      setSelectedCalDate(savedEntry.date);
    }
    const timer = setTimeout(() => {
      document.querySelector(`[data-entry-id="${CSS.escape(justSavedId)}"]`)
        ?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    }, 120);
    const t = setTimeout(() => setJustSavedId(null), 1600);
    return () => { clearTimeout(timer); clearTimeout(t); };
  }, [justSavedId, lifeExpenses]);

  // ── Month nav ──
  const changeMonth = (delta) => {
    if (navigator.vibrate) navigator.vibrate(50);
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setLifeCurrentMonth(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    setSelectedCatId(null);
  };

  // ── CRUD handlers ──
  const handleSaveExp = (entry) => {
    const prev = entry.id && lifeExpenses.find(e => e.id === entry.id);
    if (prev) {
      // 手動改過金額/分類的自動薪資做記號，之後改薪資設定時不覆蓋
      const salaryManual = (prev._autoSalary || prev._salaryDefault)
        && (Number(entry.amount) !== Number(prev.amount) || entry.categoryId !== prev.categoryId)
        ? { _salaryManual: true } : {};
      updateLifeExpense(entry.id, { ...entry, ...salaryManual });
      // 刷卡匯入列改分類 → 記住這家店，同店其他「其他」一起改，之後匯入自動套用
      if (isImportedId(prev.id) && entry.type !== 'income' && prev.categoryId !== entry.categoryId) {
        const n = learnLifeCategory(entry.id, entry.categoryId);
        const catName = lifeCategories.find(c => c.id === entry.categoryId)?.name || '';
        showToast(n > 0 ? `已更新，同店另外 ${n} 筆也改成「${catName}」` : `已更新，之後這家店自動歸「${catName}」`);
      } else {
        showToast('已更新');
      }
    } else {
      addLifeExpense(entry);
      const entryYm = (entry.date || '').slice(0, 7);
      showToast(entryYm === ym ? '已儲存' : `已儲存到 ${Number(entryYm.slice(5, 7))} 月`);
    }
    setJustSavedId(entry.id);
    setExpModal(null);
  };
  // 回傳是否真的刪了，讓編輯視窗決定要不要關閉
  const handleDelete = async (id) => {
    if (!await confirmDialog({ title: '刪除明細', message: '確定要刪除這筆紀錄嗎？此動作無法復原。', confirmText: '刪除' })) return false;
    if (navigator.vibrate) navigator.vibrate(50);
    deleteLifeExpense(id);
    showToast('已刪除');
    return true;
  };
  const openEdit = (entry) => { if (navigator.vibrate) navigator.vibrate(50); setExpModal(entry); };
  const openNew  = (type)  => { if (navigator.vibrate) navigator.vibrate(50); setNewType(type); setExpModal({}); };

  // 月份切換列：桌面在頁內；手機搬進單列頁首，「本月」只在看別的月份時出現
  const inHeader = isMobile && !!headerSlot;
  const isThisMonth = ym === localYm();
  const monthNav = (
    <div className={`month-nav life-month-nav${inHeader ? ' is-in-header' : ''}`}>
      <button className="icon-btn" onClick={() => changeMonth(-1)} aria-label="上個月"><i className="fa-solid fa-chevron-left"></i></button>
      <input
        type="month"
        className="form-input life-month-input"
        id="lifeMonthDisplay"
        aria-label="選擇月份"
        value={ym}
        onChange={e => {
          if (e.target.value) {
            setLifeCurrentMonth(e.target.value);
            setSelectedCatId(null);
          }
        }}
      />
      <button className="icon-btn" onClick={() => changeMonth(1)} aria-label="下個月"><i className="fa-solid fa-chevron-right"></i></button>
      {(!inHeader || !isThisMonth) && (
        <button
          className="btn btn-outline btn-sm life-month-today"
          onClick={() => {
            if (navigator.vibrate) navigator.vibrate(20);
            // 用本地時間，避免 UTC 在每月 1 號早上 8 點前算成上個月
            setLifeCurrentMonth(localYm());
            setSelectedCatId(null);
          }}
          title="回到本月"
          aria-label="回到本月"
        >
          <i className="fa-solid fa-calendar-day" aria-hidden="true"></i>
          <span className="life-month-today-label">本月</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="tab-content life-tab-content">
      {/* Month nav：手機 portal 進頁首；離開生活頁的轉場期間不渲染，避免和下一頁標題疊在一起 */}
      {isMobile
        ? (headerSlot && activeTab === 'life' ? createPortal(monthNav, headerSlot) : null)
        : monthNav}

      {/* 手機看明細時收起（改由清單頂端「每月統計」進總覽／分類）；在總覽、分類時才出現，用來切回明細 */}
      <div className={`life-section-nav${lifeView === 'exp' ? ' is-exp-view' : ''}`} role="tablist" aria-label="生活費檢視">
        {LIFE_SECTIONS.map(section => {
          const active = lifeView === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`life-section-btn${active ? ' active' : ''}`}
              onClick={() => { if (navigator.vibrate) navigator.vibrate(20); setLifeView(section.id); }}
            >
              {active && (
                <motion.span
                  layoutId="life-section-indicator"
                  className="life-section-indicator"
                  transition={prefersReducedMotion ? { duration: 0 } : { type: 'tween', duration: 0.2, ease: [0.2, 0, 0, 1] }}
                />
              )}
              <span className="life-section-icon" aria-hidden="true"><i className={`fa-solid ${section.icon}`}></i></span>
              <span className="life-section-label">{section.label}</span>
            </button>
          );
        })}
      </div>

      {/* Life Hero Card */}
      <div className="life-hero-card" style={{ display: lifeView === 'overview' ? undefined : 'none' }} aria-hidden={lifeView !== 'overview'}>
        <div className="hero-main">
          <div className="hero-label">
            {pace.isCurrentMonth ? '本月還能花' : '生活費結餘'}
          </div>
          <div className={`hero-amount${remain < 0 ? ' stat-negative' : ' stat-positive'}`} id="lifeMonthRemain">
            {remain < 0 ? '−' : ''}NT$ <AnimatedNumber value={Math.abs(Math.round(remain))} format={v => formatAmount(v, 'income')} effect="scroll" />
          </div>
          {pace.isCurrentMonth && pace.status === 'over' && (
            <div className="hero-pace">
              <span className="pace-chip pace-over">已超支</span>
            </div>
          )}
          <div className="progress-wrap-hero">
            <div className={`progress-bar hero-progress${pct >= 100 ? ' is-over' : pct >= 80 ? ' is-high' : ''}`}>
              <StackedExpenseBar
                id="lifeOverallProgress"
                value={Math.min(pct, 100)}
                segments={expenseSegments}
              />
              {timePct !== null && <span className="time-marker" style={{ left: `${timePct}%` }} title={`本月已過 ${timePct}%`} />}
            </div>
            <span className={`progress-pct ${pct >= 100 ? 'over-budget' : pct >= 80 ? 'high' : ''}`} id="lifeOverallPct">支出 {pct}%</span>
          </div>
          {expenseSegments.length > 0 && (
            <div className="expense-progress-legend" aria-label="支出分類占比">
              {expenseSegments.map(segment => {
                // 以實際收入為分母，各分類加總 = 進度條的「支出 %」
                const share = tInc > 0 ? Math.round((segment.amount / tInc) * 100) : 0;
                return (
                  <span className="expense-progress-legend-item" key={segment.id} title={`NT$ ${formatAmount(Math.round(segment.amount))}`}>
                    <i style={{ backgroundColor: segment.color }} />
                    <span>{segment.label} {share}%</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="hero-details">
          <div className="hero-detail-item">
            <div className="detail-label">
              <i className="fa-solid fa-hand-holding-dollar"></i> 實際收入
              <button className="icon-btn salary-settings-btn" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setShowSalary(true); }} title="設定預設薪資">
                <i className="fa-solid fa-gear"></i>
              </button>
            </div>
            <div className="detail-value stat-positive" id="lifeMonthBudget">NT$ <AnimatedNumber value={Math.round(tInc)} format={v => formatAmount(v, 'income')} effect="scroll" /></div>
          </div>
          <div className="hero-detail-item">
            <div className="detail-label"><i className="fa-solid fa-leaf"></i> 生活支出</div>
            <div className="detail-value stat-negative" id="lifeMonthSpent">NT$ <AnimatedNumber value={Math.round(tExp)} format={fmtMoney} effect="scroll" /></div>
          </div>
          {fixedMonthly > 0 && (
            <div className="hero-detail-item">
              <div className="detail-label"><i className="fa-solid fa-money-bill-wave"></i> 固定支出</div>
              <div className="detail-value stat-fixed" id="lifeMonthFixed">NT$ <AnimatedNumber value={fixedMonthly} format={fmtMoney} effect="scroll" /></div>
            </div>
          )}
        </div>
      </div>

      {/* Shared container: 收支明細 / 預算分類 */}
      <div className={`life-shared-container life-shared-${lifeView}`} style={{ display: lifeView === 'overview' ? 'none' : undefined }} aria-hidden={lifeView === 'overview'}>
        <AnimatePresence mode="wait">
          {lifeView === 'exp' ? (
            <motion.div
              key="exp-view"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="life-view-content active"
            >
              <div className="life-detail-panel" style={{ width: '100%' }}>
                {selectedCatId !== null && (
                  <div className="life-detail-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 4px 16px', background: 'transparent', border: 'none' }}>
                    <h3 id="lifeDetailTitle" style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', letterSpacing: '0.3px' }}>
                      {lifeCategories.find(c => c.id === selectedCatId)?.name || '分類明細'}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button className="icon-btn" id="lifeClearFilter" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setSelectedCatId(null); }} title="清除篩選">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  </div>
                )}

                <CalendarView
                  ym={ym}
                  entries={calEntries}
                  selectedDate={selectedCalDate}
                  onSelectDate={setSelectedCalDate}
                  onQuickAdd={handleQuickAdd}
                  lifeCategories={lifeCategories}
                  lifeIncomeCategories={lifeIncomeCategories}
                  paymentMethods={paymentMethods}
                  rewardMap={rewardMap}
                  justSavedId={justSavedId}
                  onEdit={openEdit}
                  filterType={filterType}
                  setFilterType={setFilterType}
                  sortMode={sortMode}
                  setSortMode={setSortMode}
                  monthSummary={{ expense: tExp, income: tInc, remain, isCurrentMonth: pace.isCurrentMonth }}
                  onOpenOverview={() => setLifeView('overview')}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="cat-view"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
              className="life-view-content active"
            >
              <div className="life-sidebar" style={{ width: '100%' }}>
                <div className="life-cat-list" style={{ overflowY: 'auto' }}>
                  <div className={`life-cat-row${selectedCatId === null ? ' active' : ''}`}
                    onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setSelectedCatId(null); setLifeView('exp'); }}>
                    <div className="life-cat-row-left">
                      <div className="life-cat-dot" style={{ background: 'var(--text-muted)' }}></div>
                      <div className="life-cat-row-info"><div className="life-cat-row-name">全部支出</div></div>
                    </div>
                    <div className="life-cat-row-right">
                      <span className="life-cat-row-amt">NT$ <AnimatedNumber value={tExp} format={fmtMoney} /></span>
                    </div>
                  </div>
                  {catSummary.map(cat => {
                    const barPct = cat.budget > 0 ? Math.min(Math.round((cat.spent / cat.budget) * 100), 100) : 0;
                    return (
                      <div key={cat.id}
                        className={`life-cat-row${selectedCatId === cat.id ? ' active' : ''}${cat.isOver ? ' over-budget-row' : ''}`}
                        onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setSelectedCatId(cat.id); setLifeView('exp'); }}>
                        <div className="life-cat-row-left">
                          <div className="life-cat-dot" style={{ background: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {cat.icon && <IconRenderer name={cat.icon} size={14} color={cat.iconColor || "#fff"} />}
                          </div>
                          <div className="life-cat-row-info">
                            <div className="life-cat-row-name">{cat.name}</div>
                            {cat.budget > 0 && (
                              <div className="life-cat-mini-bar">
                                <BarFill
                                  className={`life-cat-mini-fill ${cat.isOver ? 'over' : barPct >= 80 ? 'high' : barPct >= 60 ? 'medium' : 'low'}`}
                                  value={barPct}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="life-cat-row-right">
                          <span className={`life-cat-row-amt${cat.isOver ? ' over text-danger' : ''}`}>NT$ <AnimatedNumber value={cat.spent} format={fmtMoney} /></span>
                          {cat.budget > 0 && <span className="life-cat-row-budget-hint">/ <AnimatedNumber value={cat.budget} format={fmtMoney} /></span>}
                          {cat.isOver && <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--danger-color)', fontSize: '0.75rem' }}></i>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => openNew('expense')}>
        <i className="fa-solid fa-plus"></i>
      </button>

      {/* 記一筆／編輯：底部抽屜（AnimatePresence 讓關閉時能滑下去） */}
      <AnimatePresence>
        {expModal !== null && (
          <EntrySheet
            key="entry-sheet"
            lifeCategories={lifeCategories}
            lifeIncomeCategories={lifeIncomeCategories}
            paymentMethods={paymentMethods}
            currentMonth={ym}
            initial={expModal.id ? expModal : { type: newType, ...(expModal.date ? { date: expModal.date } : {}) }}
            onClose={() => setExpModal(null)}
            onSave={handleSaveExp}
            onDelete={async (id) => { if (await handleDelete(id)) setExpModal(null); }}
          />
        )}
      </AnimatePresence>
      {showSalary && <SalaryModal lifeIncomeCategories={lifeIncomeCategories} lifeExpenses={lifeExpenses} updateLifeExpense={updateLifeExpense} onSaved={() => setSalaryVersion(v => v + 1)} onClose={() => setShowSalary(false)} />}
    </div>
  );
}
