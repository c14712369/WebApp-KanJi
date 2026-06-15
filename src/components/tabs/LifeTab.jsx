import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { lifeMonthLabel, formatAmount, showToast, getFixedLifeMonthly, confirmDialog } from '../../lib/utils';
import { SALARY_DEFAULT_KEY, DAILY_EXP_KEY } from '../../lib/constants';
import AnimatedNumber from '../../lib/AnimatedNumber';
import CategoryManageModal from '../modals/CategoryManageModal';
import IconRenderer from '../../lib/IconRenderer';
import { groupEntriesByDay, paginateGroups } from '../../lib/lifeGrouping';
import { motion, AnimatePresence } from 'framer-motion';

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

// 進度條：從 0 滑動至目標寬度
function BarFill({ value, className, id }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(value), 60);
    return () => clearTimeout(t);
  }, [value]);
  return <div id={id} className={className} style={{ width: `${w}%` }} />;
}

const PAGE_SIZE = 20;


// ── Calculator hook ──────────────────────────────────────────────────────────
function useCalc(initialVal = '0') {
  const [cur,   setCur]   = useState(String(initialVal));
  const [first, setFirst] = useState(null);
  const [op,    setOp]    = useState(null);
  const [fresh, setFresh] = useState(false);

  const reset = useCallback((val = '0') => {
    setCur(String(val)); setFirst(null); setOp(null); setFresh(false);
  }, []);
  const digit = useCallback((d) => {
    setCur(prev => {
      if (fresh) { setFresh(false); return d === '.' ? '0.' : d; }
      if (prev === '0' && d !== '.') return d;
      if (d === '.' && prev.includes('.')) return prev;
      return prev + d;
    });
  }, [fresh]);
  const operator = useCallback((o) => {
    setFirst(parseFloat(cur)); setOp(o); setFresh(true);
  }, [cur]);
  const equal = useCallback(() => {
    if (!op || first == null) return;
    const b = parseFloat(cur);
    let res = 0;
    if (op === '+') res = first + b;
    else if (op === '−') res = first - b;
    else if (op === '×') res = first * b;
    else if (op === '÷') res = b !== 0 ? first / b : 0;
    setCur(String(parseFloat(res.toFixed(4))));
    setOp(null); setFirst(null); setFresh(true);
    if (navigator.vibrate) navigator.vibrate(50);
  }, [op, first, cur]);
  const back  = useCallback(() => {
    setCur(p => {
      if (p.length > 1) return p.slice(0, -1);
      // If we backspace the last digit and there's no operation, clear everything just in case
      if (!op) { setFirst(null); setOp(null); }
      return '0';
    });
  }, [op]);
  const clear = useCallback(() => {
    setCur('0');
    setFirst(null);
    setOp(null);
    setFresh(false);
  }, []);

  return { cur, first, op, reset, digit, operator, equal, back, clear };
}

// ── Salary Modal ─────────────────────────────────────────────────────────────
function SalaryModal({ lifeIncomeCategories, onClose }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(SALARY_DEFAULT_KEY)); } catch { return null; } })();
  const [amount, setAmount] = useState(saved?.amount || '');
  const [catId,  setCatId]  = useState(saved?.catId  || lifeIncomeCategories[0]?.id || '');
  const [day,    setDay]    = useState(saved?.day    || 5);

  const handleSave = () => {
    if (!amount || Number(amount) <= 0) { showToast('請輸入薪資金額', 'error'); return; }
    localStorage.setItem(SALARY_DEFAULT_KEY, JSON.stringify({ amount: Number(amount), catId, day: parseInt(day) }));
    showToast('預設薪資已儲存'); onClose();
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
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={handleClear}>清除設定</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}>
            <i className="fa-solid fa-check"></i> 儲存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Expense / Income Modal ────────────────────────────────────────────────────
function ExpenseModal({ lifeCategories, lifeIncomeCategories, paymentMethods, currentMonth, initial, onClose, onSave }) {
  const isEdit   = !!(initial?.id && initial?.type);
  const initType = initial?.type || 'expense';
  
  const lastSaved = !isEdit ? (() => { try { return JSON.parse(localStorage.getItem('LAST_EXPENSE_ENTRY')) || {}; } catch { return {}; } })() : {};
  
  const [type,     setType]     = useState(initType);
  const [catId,    setCatId]    = useState(initType !== 'income' ? (initial?.categoryId || lastSaved.catId || lifeCategories[0]?.id || '') : (lifeCategories[0]?.id || ''));
  const [incCatId, setIncCatId] = useState(initType === 'income' ? (initial?.categoryId || lastSaved.incCatId || lifeIncomeCategories[0]?.id || '') : (lifeIncomeCategories[0]?.id || ''));
  const [date,     setDate]     = useState(initial?.date || currentMonth + '-' + String(new Date().getDate()).padStart(2, '0'));
  const [note,     setNote]     = useState(initial?.note || '');
  const [pmId,     setPmId]     = useState(initial?.paymentMethod || lastSaved.pmId || paymentMethods[0]?.id || 'cash');
  const [showCalc, setShowCalc] = useState(false);
  const calc = useCalc(initial?.amount || '0');

  const amount = parseFloat(calc.cur) || 0;

  const handleSubmit = () => {
    if (!amount || amount <= 0 || !date) { showToast('請輸入金額', 'error'); return; }
    if (navigator.vibrate) navigator.vibrate(50);
    if (!isEdit) {
      localStorage.setItem('LAST_EXPENSE_ENTRY', JSON.stringify({ catId, incCatId, pmId }));
    }
    const entry = {
      id: initial?.id || crypto.randomUUID(),
      type, amount,
      categoryId: type === 'income' ? incCatId : catId,
      date, note: note.trim(),
      ...(type === 'expense' ? { paymentMethod: pmId } : {}),
    };
    onSave(entry);
  };

  return (
    <div className="modal-overlay active" style={{ alignItems: 'flex-start', paddingTop: 0 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400, margin: '0 auto', height: '100vh', maxHeight: '100vh', overflowY: 'auto', borderRadius: 0 }} onPointerDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="lifeExpModalTitle">
            {isEdit ? (type === 'income' ? '編輯收入' : '編輯支出') : (type === 'income' ? '新增收入' : '新增支出')}
          </h3>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>

        {!isEdit && (
          <div style={{ display: 'flex', background: 'var(--bg-color)', borderRadius: 'var(--radius)', padding: 4, marginBottom: 20, border: '1px solid var(--border-color)' }}>
            <button style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 6, background: type === 'expense' ? 'var(--card-bg)' : 'transparent', color: type === 'expense' ? 'var(--text-main)' : 'var(--text-muted)', boxShadow: type === 'expense' ? 'var(--shadow-sm)' : 'none', fontWeight: type === 'expense' ? 600 : 500, transition: 'all 0.2s', fontSize: '0.95rem' }} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setType('expense'); }}>
              支出
            </button>
            <button style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 6, background: type === 'income' ? 'var(--card-bg)' : 'transparent', color: type === 'income' ? 'var(--text-main)' : 'var(--text-muted)', boxShadow: type === 'income' ? 'var(--shadow-sm)' : 'none', fontWeight: type === 'income' ? 600 : 500, transition: 'all 0.2s', fontSize: '0.95rem' }} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setType('income'); }}>
              收入
            </button>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">日期</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="icon-btn" style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', width: 42, height: 42, flexShrink: 0 }} onClick={() => {
              if (navigator.vibrate) navigator.vibrate(50);
              const d = new Date(date); d.setDate(d.getDate() - 1);
              setDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
            }}>
              <i className="fa-solid fa-chevron-left" style={{ color: 'var(--text-main)' }}></i>
            </button>
            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} style={{ flex: 1, textAlign: 'center' }} />
            <button className="icon-btn" style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius)', width: 42, height: 42, flexShrink: 0 }} onClick={() => {
              if (navigator.vibrate) navigator.vibrate(50);
              const d = new Date(date); d.setDate(d.getDate() + 1);
              setDate(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
            }}>
              <i className="fa-solid fa-chevron-right" style={{ color: 'var(--text-main)' }}></i>
            </button>
          </div>
        </div>

        {type === 'expense' ? (
          <div className="form-group">
            <label className="form-label">分類</label>
            <select className="form-select" value={catId} onChange={e => setCatId(e.target.value)}>
              {lifeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">收入類別</label>
            <select className="form-select" value={incCatId} onChange={e => setIncCatId(e.target.value)}>
              {lifeIncomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">金額</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="form-input" style={{ flex: 1, cursor: 'pointer', fontFamily: 'monospace', fontSize: '1.1rem', minHeight: 40, display: 'flex', alignItems: 'center' }}
              onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setShowCalc(v => !v); }}>
              {parseFloat(calc.cur || 0).toLocaleString()}
            </div>
            <button className="icon-btn" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setShowCalc(v => !v); }} title="計算機">
              <i className="fa-solid fa-calculator"></i>
            </button>
          </div>
        </div>

        {showCalc && (
          <>
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }} onClick={() => setShowCalc(false)} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: 320, zIndex: 10000, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 16, padding: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }} onPointerDown={e => e.stopPropagation()}>
              <div style={{ padding: '8px 12px', marginBottom: 16, background: 'var(--bg-color)', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 60, boxSizing: 'border-box', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 6, right: 12, fontSize: '0.75rem', color: 'var(--secondary-color)', fontFamily: 'monospace' }}>
                  {calc.first != null && calc.op ? `${calc.first} ${calc.op}` : ''}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '1.8rem', color: 'var(--text-main)', fontWeight: 600, lineHeight: 1 }}>
                  {parseFloat(calc.cur || 0).toLocaleString()}
                </div>
              </div>
              {[
                ['7','8','9','÷'],
                ['4','5','6','×'],
                ['1','2','3','−'],
                ['.','0','⌫','+'],
              ].map((row, ri) => (
                <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 6 }}>
                  {row.map(k => {
                    const isOp = ['÷','×','−','+'].includes(k);
                    const isAction = k === '⌫';
                    return (
                      <button key={k} className="btn" style={{
                          padding: '12px 0',
                          fontFamily: 'monospace',
                          fontSize: '1.2rem',
                          background: isOp ? 'var(--card-bg)' : isAction ? 'var(--card-bg)' : 'var(--bg-color)',
                          color: isOp ? 'var(--primary-color)' : isAction ? 'var(--secondary-color)' : 'var(--text-main)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 8,
                          fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        onClick={() => {
                          if (navigator.vibrate) navigator.vibrate(20);
                          if ('0123456789.'.includes(k)) calc.digit(k);
                          else if (k === '⌫') calc.back();
                          else calc.operator(k);
                        }}>
                        {k}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 6, marginTop: 8 }}>
                <button className="btn" style={{ padding: '12px 0', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--secondary-color)', fontWeight: 700, fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { if (navigator.vibrate) navigator.vibrate(20); calc.clear(); }}>C</button>
                <button className="btn" style={{ padding: '12px 0', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 8, color: 'var(--primary-color)', fontWeight: 700, fontSize: '1.2rem', fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={calc.equal}>=</button>
                <button className="btn btn-primary" style={{ padding: '12px 0', borderRadius: 8, fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCalc(false)}>
                  確認
                </button>
              </div>
            </div>
          </>
        )}

        {type === 'expense' && (
          <div className="form-group">
            <label className="form-label">付款方式</label>
            <select className="form-select" value={pmId} onChange={e => setPmId(e.target.value)}>
              {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">備註（選填）</label>
          <input className="form-input" value={note} onChange={e => setNote(e.target.value)} placeholder="備註…" />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSubmit}>
            <i className="fa-solid fa-check"></i> {isEdit ? '儲存' : '新增'}
          </button>
          <button className="btn" style={{ flex: 1, background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }} onClick={onClose}>取消</button>
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
    setLifeCategories,
  } = useAppStore();

  const [selectedCatId, setSelectedCatId] = useState(null);
  const [sortMode,      setSortMode]      = useState('date-desc');
  const [lifeView,      setLifeView]      = useState('exp');
  const [page,          setPage]          = useState(1);
  const [expModal,      setExpModal]      = useState(null);
  const [newType,       setNewType]       = useState('expense');
  const [showSalary,    setShowSalary]    = useState(false);
  const [showCatManage, setShowCatManage] = useState(false);
  const ym = lifeCurrentMonth;

  // Reset page when month or filter changes
  useEffect(() => { setPage(1); }, [ym, selectedCatId]);

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
      const s = JSON.parse(localStorage.getItem(SALARY_DEFAULT_KEY));
      if (!s) return;
      const alreadyApplied = lifeExpenses.some(e =>
        (e.date || '').startsWith(ym) && (e._autoSalary || e._salaryDefault) && e.categoryId === s.catId
      );
      if (alreadyApplied) return;
      const d = new Date(ym + '-' + String(s.day).padStart(2, '0'));
      const dow = d.getDay();
      if (dow === 0) d.setDate(d.getDate() - 2);
      else if (dow === 6) d.setDate(d.getDate() - 1);
      addLifeExpense({
        id: crypto.randomUUID(), type: 'income',
        categoryId: s.catId, amount: s.amount,
        date: d.toISOString().split('T')[0],
        note: '薪資 (自動)', _autoSalary: true,
      });
    } catch {}
  }, [ym]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const totalSpent   = tExp + fixedMonthly;
  const remain = tInc - totalSpent;
  const pct    = tInc > 0 ? Math.min(Math.round((totalSpent / tInc) * 100), 100) : 0;

  // ── Category summary ──
  const catSummary = lifeCategories.map(cat => {
    const spent  = lifeExpenses.filter(e => e.categoryId === cat.id && (e.date || '').startsWith(ym) && e.type !== 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const budget = lifeBudgets[cat.id + '|' + ym] || 0;
    return { ...cat, spent, budget, isOver: budget > 0 && spent > budget };
  }).filter(c => c.spent > 0);

  // ── Reward map ──
  const rewardMap = {};
  lifeExpenses.forEach(e => {
    if (e.type === 'income' && e._linkedExpenseId) {
      const m = (e.note || '').match(/\(([^)]*%)\)/);
      rewardMap[e._linkedExpenseId] = { amount: e.amount, rate: m ? m[1] : '' };
    }
  });

  // ── Filtered + sorted list ──
  const visibleEntries = lifeExpenses
    .filter(e => {
      if (!(e.date || '').startsWith(ym)) return false;
      if (e.type === 'income' && e._linkedExpenseId) return false;
      if (selectedCatId !== null) return e.categoryId === selectedCatId;
      return true;
    })
    .sort((a, b) =>
      sortMode === 'date-desc'
        ? (b.date.localeCompare(a.date) || (b.id || '').localeCompare(a.id || ''))
        : (a.date.localeCompare(b.date) || (a.id || '').localeCompare(b.id || ''))
    );

  // 依日期分組，分頁時整天不切斷（避免同一天明細被拆到不同頁而誤以為漏記）
  const dayGroups = groupEntriesByDay(visibleEntries);
  const { totalPages, pageGroups } = paginateGroups(dayGroups, page, PAGE_SIZE);
  const pageItems  = pageGroups.flatMap(g => g.entries);

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
    if (entry.id && lifeExpenses.find(e => e.id === entry.id)) {
      updateLifeExpense(entry.id, entry);
      showToast('已更新');
    } else {
      addLifeExpense(entry);
      showToast('已儲存');
    }
    setExpModal(null);
  };
  const handleDelete = async (id) => {
    if (!await confirmDialog({ title: '刪除明細', message: '確定要刪除這筆紀錄嗎？此動作無法復原。', confirmText: '刪除' })) return;
    if (navigator.vibrate) navigator.vibrate(50);
    deleteLifeExpense(id);
    showToast('已刪除');
  };
  const openEdit = (entry) => { if (navigator.vibrate) navigator.vibrate(50); setExpModal(entry); };
  const openNew  = (type)  => { if (navigator.vibrate) navigator.vibrate(50); setNewType(type); setExpModal({}); };

  return (
    <div className="tab-content">
      {/* Month nav */}
      <div className="month-nav">
        <button className="icon-btn" onClick={() => changeMonth(-1)}><i className="fa-solid fa-chevron-left"></i></button>
        <span className="month-nav-label" id="lifeMonthDisplay">{lifeMonthLabel(ym)}</span>
        <button className="icon-btn" onClick={() => changeMonth(1)}><i className="fa-solid fa-chevron-right"></i></button>
      </div>

      {/* Life Hero Card */}
      <div className="life-hero-card">
        <div className="hero-main">
          <div className="hero-label">生活費結餘</div>
          <div className={`hero-amount${remain < 0 ? ' stat-negative' : ' stat-positive'}`} id="lifeMonthRemain">
            NT$ <AnimatedNumber value={Math.abs(Math.round(remain))} format={v => formatAmount(v, 'income')} effect="scroll" />{remain < 0 ? ' (超支)' : ''}
          </div>
          <div className="progress-wrap-hero">
            <div className="progress-bar">
              <BarFill
                id="lifeOverallProgress"
                className={`progress-fill ${pct >= 100 ? 'over-budget' : pct >= 80 ? 'high' : pct >= 60 ? 'medium' : 'low'}`}
                value={Math.min(pct, 100)}
              />
            </div>
            <span className={`progress-pct ${pct >= 100 ? 'over-budget' : pct >= 80 ? 'high' : ''}`} id="lifeOverallPct">支出 {pct}%</span>
          </div>
        </div>
        <div className="hero-details">
          <div className="hero-detail-item">
            <div className="detail-label">
              <i className="fa-solid fa-hand-holding-dollar"></i> 本月實際收入
              <button className="icon-btn" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setShowSalary(true); }} title="設定預設薪資" style={{ fontSize: '0.8rem', padding: '2px 4px', marginLeft: 4 }}>
                <i className="fa-solid fa-gear"></i>
              </button>
            </div>
            <div className="detail-value stat-positive" id="lifeMonthBudget">NT$ <AnimatedNumber value={Math.round(tInc)} format={v => formatAmount(v, 'income')} effect="scroll" /></div>
          </div>
          <div className="hero-detail-item">
            <div className="detail-label"><i className="fa-solid fa-leaf"></i> 本月生活支出</div>
            <div className="detail-value stat-negative" id="lifeMonthSpent">NT$ <AnimatedNumber value={Math.round(tExp)} effect="scroll" /></div>
          </div>
          {fixedMonthly > 0 && (
            <div className="hero-detail-item">
              <div className="detail-label"><i className="fa-solid fa-money-bill-wave"></i> 本月固定支出</div>
              <div className="detail-value stat-fixed" id="lifeMonthFixed">NT$ <AnimatedNumber value={fixedMonthly} effect="scroll" /></div>
            </div>
          )}
        </div>
      </div>

      {/* Shared container: 收支明細 / 預算分類 */}
      <div className="life-shared-container">
        <div className="life-tabs-header">
          <button className={`life-subtab-btn${lifeView === 'exp' ? ' active' : ''}`} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setLifeView('exp'); }}>
            <i className="fa-solid fa-list-ul"></i> 收支明細
          </button>
          <button className={`life-subtab-btn${lifeView === 'cat' ? ' active' : ''}`} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setLifeView('cat'); }}>
            <i className="fa-solid fa-shapes"></i> 預算分類
          </button>
        </div>

        <AnimatePresence mode="wait">
          {lifeView === 'exp' ? (
            <motion.div
              key="exp-view"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="life-view-content active"
            >
              <div className="life-detail-panel" style={{ width: '100%' }}>
                <div className="life-detail-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                  <h3 id="lifeDetailTitle" style={{ margin: 0 }}>
                    <i className="fa-solid fa-book"></i>{' '}
                    {selectedCatId ? (lifeCategories.find(c => c.id === selectedCatId)?.name || '全部明細') : '全部明細'}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="icon-btn" id="lifeExpSortBtn"
                      title={sortMode === 'date-desc' ? '新到舊' : '舊到新'}
                      onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setSortMode(s => s === 'date-desc' ? 'date-asc' : 'date-desc'); setPage(1); }}>
                      <i className={`fa-solid ${sortMode === 'date-desc' ? 'fa-arrow-down-short-wide' : 'fa-arrow-up-short-wide'}`}></i>
                    </button>
                    {selectedCatId !== null && (
                      <button className="icon-btn" id="lifeClearFilter" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setSelectedCatId(null); setPage(1); }} title="清除篩選">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}
                  </div>
                </div>

                <div id="lifeExpList" style={{ height: 450, overflowY: 'auto', paddingRight: 4 }}>
                  {pageItems.length === 0 ? (
                    <div className="empty-state">
                      <span className="empty-icon"><i className="fa-regular fa-note-sticky"></i></span>
                      <strong>本月尚無記錄</strong>
                      <p>點右上角 + 新增收支</p>
                    </div>
                  ) : (
                    <AnimatePresence mode="popLayout">
                      {pageGroups.map(group => {
                        const gParts = (group.date || '').split('-');
                        const gWeek = group.date ? WEEKDAY_NAMES[new Date(group.date + 'T00:00:00').getDay()] : '';
                        return (
                        <div key={group.date}>
                          <div className="life-day-header">
                            <span className="ldh-date">
                              {parseInt(gParts[1])}/{parseInt(gParts[2])}
                              <span className="ldh-week">（{gWeek}）</span>
                            </span>
                            <span className="ldh-total">合計 NT$ {formatAmount(group.total, 'expense')}</span>
                          </div>
                      {group.entries.map((e, idx) => {
                        const rw  = rewardMap[e.id];
                        const isIncome = e.type === 'income';
                        const cat = isIncome 
                          ? (lifeIncomeCategories.find(c => c.id === e.categoryId) || { name: '收入', color: '#3D7A5A' })
                          : (lifeCategories.find(c => c.id === e.categoryId) || { name: '支出', color: '#6B6B6B' });
                        
                        return (
                          <motion.div
                            key={e.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{ duration: 0.15, delay: idx * 0.01, ease: "easeOut" }}
                            className={isIncome ? "life-income-row" : "life-exp-row"}
                          >
                            <div className={isIncome ? "life-income-arrow" : "life-exp-dot"} style={{ background: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {cat.icon && <IconRenderer name={cat.icon} size={14} color={cat.iconColor || "#fff"} />}
                            </div>
                            <div className="life-exp-info">
                              <div className="life-item-main-line">
                                <span className="life-item-cat-name">{cat.name}</span>
                                {e.note && <><span className="life-item-note-sep">·</span><span className="life-item-note" title={e.note}>{e.note}</span></>}
                                {!isIncome && (paymentMethods.find(p => p.id === e.paymentMethod)?.type === 'card' || e.paymentMethod === 'card' || e.paymentMethod === 'credit_card_default') && (
                                  <i className="fa-solid fa-credit-card" style={{ fontSize: '0.7rem', opacity: 0.6, marginLeft: 4 }}></i>
                                )}
                              </div>
                            </div>
                            <div className="life-exp-amount-wrap">
                              <div className={isIncome ? "life-income-amount" : "life-exp-amount stat-negative"}>
                                {isIncome ? '+' : '-'} NT$ <AnimatedNumber value={Math.round(e.amount)} format={v => formatAmount(v, isIncome ? 'income' : 'expense')} />
                              </div>
                              {rw && (
                                <div className="life-exp-reward-inline">
                                  <i className="fa-solid fa-gift"></i> +<AnimatedNumber value={rw.amount} />{rw.rate ? ` (${rw.rate})` : ''}
                                </div>
                              )}
                            </div>
                            <div className="life-item-actions">
                              <button className="icon-btn" onClick={() => openEdit(e)}><i className="fa-solid fa-pen"></i></button>
                              <button className="icon-btn delete" onClick={() => handleDelete(e.id)}><i className="fa-solid fa-trash"></i></button>
                            </div>
                          </motion.div>
                        );
                      })}
                        </div>
                        );
                      })}
                    </AnimatePresence>
                  )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 4, padding: '12px 0', flexWrap: 'wrap' }}>
                    <button className="pagination-btn" disabled={page === 1} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setPage(p => p - 1); }}>
                      <i className="fa-solid fa-chevron-left"></i>
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                      <button key={p} className={`pagination-btn${page === p ? ' active' : ''}`} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setPage(p); }}>{p}</button>
                    ))}
                    <button className="pagination-btn" disabled={page === totalPages} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setPage(p => p + 1); }}>
                      <i className="fa-solid fa-chevron-right"></i>
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="cat-view"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="life-view-content active"
            >
              <div className="life-sidebar" style={{ width: '100%' }}>
                <div className="life-sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="life-sidebar-title">分類</span>
                  <button className="icon-btn" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setShowCatManage(true); }} title="管理分類" style={{ fontSize: '0.9rem', width: 32, height: 32 }}>
                    <i className="fa-solid fa-gear"></i>
                  </button>
                </div>
                <div className="life-cat-list" style={{ height: 450, overflowY: 'auto' }}>
                  <div className={`life-cat-row${selectedCatId === null ? ' active' : ''}`}
                    onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setSelectedCatId(null); setPage(1); setLifeView('exp'); }}>
                    <div className="life-cat-row-left">
                      <div className="life-cat-dot" style={{ background: 'var(--text-muted)' }}></div>
                      <div className="life-cat-row-info"><div className="life-cat-row-name">全部支出</div></div>
                    </div>
                    <div className="life-cat-row-right">
                      <span className="life-cat-row-amt">NT$ <AnimatedNumber value={tExp} /></span>
                    </div>
                  </div>
                  {catSummary.map(cat => {
                    const barPct = cat.budget > 0 ? Math.min(Math.round((cat.spent / cat.budget) * 100), 100) : 0;
                    return (
                      <div key={cat.id}
                        className={`life-cat-row${selectedCatId === cat.id ? ' active' : ''}${cat.isOver ? ' over-budget-row' : ''}`}
                        onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setSelectedCatId(cat.id); setPage(1); setLifeView('exp'); }}>
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
                          <span className={`life-cat-row-amt${cat.isOver ? ' over text-danger' : ''}`}>NT$ <AnimatedNumber value={cat.spent} /></span>
                          {cat.budget > 0 && <span className="life-cat-row-budget-hint">/ <AnimatedNumber value={cat.budget} /></span>}
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

      {/* Modals */}
      {expModal !== null && (
        <ExpenseModal
          lifeCategories={lifeCategories}
          lifeIncomeCategories={lifeIncomeCategories}
          paymentMethods={paymentMethods}
          currentMonth={ym}
          initial={expModal.id ? expModal : { type: newType }}
          onClose={() => setExpModal(null)}
          onSave={handleSaveExp}
        />
      )}
      {showSalary && <SalaryModal lifeIncomeCategories={lifeIncomeCategories} onClose={() => setShowSalary(false)} />}
      {showCatManage && (
        <CategoryManageModal
          categories={lifeCategories}
          type="expense"
          onClose={() => setShowCatManage(false)}
          onSave={cats => {
            setLifeCategories(cats);
          }}
        />
      )}
    </div>
  );
}
