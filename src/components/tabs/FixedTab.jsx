import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { getCycleLabel, toMonthlyAmount, fetchWithCache, showToast, autoFocusDesktop, confirmDialog } from '../../lib/utils';
import { DEFAULT_CATS } from '../../lib/constants';
import IconRenderer from '../../lib/IconRenderer';
import CategoryManageModal from '../modals/CategoryManageModal';
import { motion, AnimatePresence } from 'framer-motion';

const CYCLES = [
  { value: 'monthly',     label: '每月' },
  { value: 'bimonthly',   label: '每兩個月' },
  { value: 'quarterly',   label: '每季' },
  { value: 'half-yearly', label: '每半年' },
  { value: 'yearly',      label: '每年' },
  { value: 'daily',       label: '每日' },
  { value: 'weekly',      label: '每週' },
  { value: 'fixed',       label: '一次性' },
];

const CURRENCIES = ['TWD', 'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'HKD', 'AUD', 'CAD', 'KRW', 'SGD'];

const EMPTY_FORM = {
  id: '', name: '', categoryId: '', currency: 'TWD',
  originalAmount: '', exchangeRate: 1, amount: 0,
  cycle: 'monthly', startDate: new Date().toISOString().split('T')[0],
  endDate: '', note: '', paymentMethod: 'credit',
};

// ── Item Modal ──────────────────────────────────────────────────────────────
function ItemModal({ categories, onClose, onSave, initial }) {
  const [form, setForm]     = useState(initial || EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [shake, setShake]   = useState(false);
  const isEdit = !!form.id;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const twdAmount = Math.round((parseFloat(form.originalAmount) || 0) * (parseFloat(form.exchangeRate) || 1));

  const handleCurrencyChange = useCallback(async (curr) => {
    set('currency', curr);
    if (curr === 'TWD') { set('exchangeRate', 1); return; }
    setLoading(true);
    try {
      const data = await fetchWithCache(`https://api.frankfurter.app/latest?from=${curr}&to=TWD`);
      if (data?.rates?.TWD) set('exchangeRate', parseFloat(data.rates.TWD.toFixed(4)));
    } catch { showToast('匯率抓取失敗，請手動輸入', 'error'); }
    finally { setLoading(false); }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !(parseFloat(form.originalAmount) > 0)) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      showToast('請填寫完整名稱與正確金額', 'error');
      return;
    }
    onSave({
      ...form,
      originalAmount: parseFloat(form.originalAmount),
      exchangeRate:   parseFloat(form.exchangeRate) || 1,
      amount:         twdAmount,
      paymentMethod:  form.paymentMethod === 'cash' ? 'cash' : 'credit',
    });
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal${shake ? ' shake' : ''}`} style={{ maxWidth: 480 }} onPointerDown={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{isEdit ? '編輯項目' : '新增項目'}</h3>
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">名稱</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="訂閱名稱…" autoFocus={autoFocusDesktop} />
          </div>
          <div className="form-group">
            <label className="form-label">分類</label>
            <select className="form-select" value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">幣別</label>
            <select className="form-select" value={form.currency} onChange={e => handleCurrencyChange(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">金額（{form.currency}）</label>
            <input className="form-input" type="number" inputMode="decimal" min="0" step="any" value={form.originalAmount}
              onChange={e => set('originalAmount', e.target.value)} placeholder="0" />
          </div>
          {form.currency !== 'TWD' && (
            <div className="form-group" id="exchangeRateRow">
              <label className="form-label">匯率（1 {form.currency} = ? TWD）{loading && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}> 抓取中…</span>}</label>
              <input className="form-input" type="number" inputMode="decimal" min="0" step="any" value={form.exchangeRate}
                onChange={e => set('exchangeRate', e.target.value)} />
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                ≈ NT$ {twdAmount.toLocaleString()}
              </div>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">週期</label>
            <select className="form-select" value={form.cycle} onChange={e => set('cycle', e.target.value)}>
              {CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">開始日期</label>
            <input className="form-input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">結束日期（選填）</label>
            <input className="form-input" type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">備註（選填）</label>
            <input className="form-input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="備註…" />
          </div>
          <div className="form-group">
            <label className="form-label">付款方式</label>
            <div className="pay-method-toggle">
              <button type="button" className={`pay-method-btn${form.paymentMethod === 'credit' ? ' active' : ''}`} onClick={() => set('paymentMethod', 'credit')}>
                <i className="fa-solid fa-credit-card"></i> 信用卡
              </button>
              <button type="button" className={`pay-method-btn${form.paymentMethod === 'cash' ? ' active' : ''}`} onClick={() => set('paymentMethod', 'cash')}>
                <i className="fa-solid fa-money-bill-wave"></i> 現金
              </button>
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              {form.paymentMethod === 'credit'
                ? '信用卡帳款由 Gmail 記帳自動匯入明細，不另外計入結餘。'
                : (form.cycle === 'monthly'
                    ? '現金每月支出將自動計入生活費結餘（獨立顯示，無需手動記帳）。'
                    : '提醒：僅「每月」週期的現金項目會自動計入生活費結餘。')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>取消</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }}>
              <i className="fa-solid fa-check"></i> {isEdit ? '儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main FixedTab ───────────────────────────────────────────────────────────
export default function FixedTab() {
  const {
    items, categories, fixedSortMode,
    addItem, updateItem, deleteItem,
    setCategories, setFixedSortMode,
  } = useAppStore();

  const [statusFilter, setStatus]   = useState('all');
  const [payFilter, setPayFilter]   = useState('all');  // all | credit | cash
  const [modalItem, setModalItem]   = useState(null);   // null=closed, {}=new, item=edit
  const [showCatModal, setCatModal] = useState(false);
  const [page, setPage]             = useState(1);
  const [listMinH, setListMinH]     = useState(null);
  const listRef                     = useRef(null);

  const PAGE_SIZE = 5;

  const now = new Date(); now.setHours(0, 0, 0, 0);

  // ── Filter + Sort ──
  const matchPay = (item) => {
    if (payFilter === 'all') return true;
    const pm = item.paymentMethod === 'cash' ? 'cash' : 'credit';
    return pm === payFilter;
  };

  const filtered = items
    .filter(item => {
      const ended = item.endDate && new Date(item.endDate) < now;
      if (statusFilter === 'active' && ended) return false;
      if (statusFilter === 'ended'  && !ended) return false;
      if (!matchPay(item)) return false;
      return true;
    })
    .sort((a, b) => {
      if (fixedSortMode === 'amount-desc') return b.amount - a.amount;
      if (fixedSortMode === 'amount-asc')  return a.amount - b.amount;
      if (fixedSortMode === 'date-desc')   return new Date(b.startDate) - new Date(a.startDate);
      if (fixedSortMode === 'date-asc')    return new Date(a.startDate) - new Date(b.startDate);
      const ai = categories.findIndex(c => c.id === a.categoryId);
      const bi = categories.findIndex(c => c.id === b.categoryId);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 搜尋/篩選/排序變動時回到第一頁
  useEffect(() => { setPage(1); }, [statusFilter, payFilter, fixedSortMode]);

  // 鎖住完整一頁的高度，防止切換頁面時容器跳動
  useEffect(() => {
    if (!listRef.current) return;
    if (pageItems.length === PAGE_SIZE) {
      setListMinH(listRef.current.offsetHeight);
    } else if (filtered.length <= PAGE_SIZE) {
      setListMinH(null);
    }
  });

  // ── Totals ──
  const activeItems = items.filter(i => !(i.endDate && new Date(i.endDate) < now) && matchPay(i));
  const totalMonthly = activeItems.reduce((s, i) => s + toMonthlyAmount(i), 0);

  // ── Summary by category ──
  const catMap = {};
  activeItems.forEach(item => {
    const cat = categories.find(c => c.id === item.categoryId) || categories[categories.length - 1];
    if (!catMap[cat.id]) catMap[cat.id] = { name: cat.name, color: cat.color, icon: cat.icon, iconColor: cat.iconColor, monthly: 0 };
    catMap[cat.id].monthly += toMonthlyAmount(item);
  });
  const summaryRows = Object.values(catMap).sort((a, b) => {
    if (fixedSortMode === 'amount-asc') return a.monthly - b.monthly;
    if (fixedSortMode === 'category') {
      const ai = categories.findIndex(c => c.name === a.name);
      const bi = categories.findIndex(c => c.name === b.name);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return b.monthly - a.monthly; // amount-desc / date-desc → 金額高到低
  });

  // ── Handlers ──
  const handleSaveItem = (data) => {
    if (data.id) {
      updateItem(data.id, data);
      showToast('更新成功');
    } else {
      addItem({ ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
      showToast('新增成功');
    }
    setModalItem(null);
  };

  const handleDelete = async (id) => {
    const item = items.find(i => i.id === id);
    if (!await confirmDialog({ title: '刪除項目', message: `確定要刪除「${item?.name || '此項目'}」嗎？此動作無法復原。`, confirmText: '刪除' })) return;
    if (navigator.vibrate) navigator.vibrate(50);
    deleteItem(id);
    showToast('刪除成功');
  };

  const handleSaveCategories = (cats) => {
    const reassigned = items.map(i => cats.find(c => c.id === i.categoryId) ? i : { ...i, categoryId: 'cat_other' });
    if (reassigned.some((item, idx) => item.categoryId !== items[idx]?.categoryId)) {
      useAppStore.getState().setItems(reassigned);
    }
    setCategories(cats);
    showToast('分類已儲存');
  };

  const openEdit = (item) => {
    if (navigator.vibrate) navigator.vibrate(50);
    setModalItem({
      id: item.id, name: item.name,
      categoryId: item.categoryId,
      currency: item.currency || 'TWD',
      originalAmount: String(item.originalAmount || item.amount),
      exchangeRate: item.exchangeRate || 1,
      amount: item.amount,
      cycle: item.cycle,
      startDate: item.startDate,
      endDate: item.endDate || '',
      note: item.note || '',
      paymentMethod: item.paymentMethod === 'cash' ? 'cash' : 'credit',
    });
  };

  return (
    <div className="tab-content">
      {/* 整合式工具列 */}
      <div className="fixed-toolbar-card" style={{ 
        background: 'var(--card-bg)', 
        borderRadius: 'var(--radius)', 
        padding: '16px', 
        marginBottom: '20px', 
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        {/* 第一層：狀態與設定 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
          <div className="type-toggle" style={{ 
            flex: 'none', 
            background: 'var(--bg-color)', 
            padding: '3px', 
            borderRadius: '8px',
            display: 'flex',
            flexWrap: 'nowrap' // 確保文字不換行
          }}>
            <button className={`type-btn${statusFilter === 'all'    ? ' active' : ''}`} style={{ fontSize: '0.82rem', padding: '6px 10px', whiteSpace: 'nowrap' }} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setStatus('all'); }}>全部</button>
            <button className={`type-btn${statusFilter === 'active' ? ' active' : ''}`} style={{ fontSize: '0.82rem', padding: '6px 10px', whiteSpace: 'nowrap' }} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setStatus('active'); }}>進行中</button>
            <button className={`type-btn${statusFilter === 'ended'  ? ' active' : ''}`} style={{ fontSize: '0.82rem', padding: '6px 10px', whiteSpace: 'nowrap' }} onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setStatus('ended'); }}>已結束</button>
          </div>
          <button className="icon-btn" style={{ 
            width: '36px', 
            height: '36px', 
            flexShrink: 0,
            background: 'var(--bg-color)', 
            borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }} title="管理分類" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setCatModal(true); }}>
            <i className="fa-solid fa-tags" style={{ fontSize: '0.9rem', color: 'var(--primary-color)' }}></i>
          </button>
        </div>

        {/* 第二層：付款方式篩選 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '2px', marginBottom: '10px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
            <i className="fa-solid fa-wallet" style={{ marginRight: '4px' }}></i>付款：
          </span>
          <div className="sort-chips" style={{ display: 'flex', gap: '6px' }}>
            <button className={`sort-chip${payFilter === 'all' ? ' active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setPayFilter('all'); }}>
              全部
            </button>
            <button className={`sort-chip${payFilter === 'credit' ? ' active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setPayFilter('credit'); }}>
              <i className="fa-solid fa-credit-card"></i> 信用卡
            </button>
            <button className={`sort-chip${payFilter === 'cash' ? ' active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setPayFilter('cash'); }}>
              <i className="fa-solid fa-money-bill-wave"></i> 現金
            </button>
          </div>
        </div>

        {/* 第三層：排序選項 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
            <i className="fa-solid fa-arrow-down-wide-short" style={{ marginRight: '4px' }}></i>排序：
          </span>
          <div className="sort-chips" style={{ display: 'flex', gap: '6px' }}>
            <button className={`sort-chip${fixedSortMode === 'category' ? ' active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setFixedSortMode('category'); }}>
              分類
            </button>
            <button
              className={`sort-chip${fixedSortMode === 'amount-desc' || fixedSortMode === 'amount-asc' ? ' active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(50);
                if (fixedSortMode === 'amount-desc') setFixedSortMode('amount-asc');
                else setFixedSortMode('amount-desc');
              }}>
              金額 {fixedSortMode === 'amount-asc' ? '↑' : '↓'}
            </button>
            <button
              className={`sort-chip${fixedSortMode === 'date-desc' || fixedSortMode === 'date-asc' ? ' active' : ''}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(50);
                if (fixedSortMode === 'date-desc') setFixedSortMode('date-asc');
                else setFixedSortMode('date-desc');
              }}>
              日期 {fixedSortMode === 'date-asc' ? '最舊' : '最新'}
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="fixed-layout">
        <div className="fixed-list-col">
        <div ref={listRef} className="fixed-list" id="itemsList" style={listMinH ? { minHeight: listMinH } : {}}>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon"><i className="fa-regular fa-credit-card"></i></span>
              <strong>沒有相符項目</strong>
              <p>嘗試調整搜尋條件或篩選器</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {pageItems.map((item, idx) => {
                const cat   = categories.find(c => c.id === item.categoryId) || categories[categories.length - 1];
                const ended = item.endDate && new Date(item.endDate) < now;
                const dateRange = item.endDate ? `${item.startDate} ~ ${item.endDate}` : item.startDate;
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.15, delay: idx * 0.01, ease: "easeOut" }}
                    className={`item-row${ended ? ' item-row--ended' : ''}`}
                    style={{ '--cat-color': cat.color + '14' }}
                  >
                    <div className="item-row-bar" style={{ background: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {cat.icon && <IconRenderer name={cat.icon} size={14} color={cat.iconColor || "#fff"} style={{ marginTop: 8 }} />}
                    </div>
                    <div className="item-row-main">
                      <div className="item-row-name">
                        {item.name}
                        {ended && <span className="item-row-badge item-row-badge--ended">已結束</span>}
                      </div>
                      <div className="item-row-tags">
                        <span className="item-row-cat" style={{ background: cat.color + '20', color: cat.color }}>
                          {cat.icon && <IconRenderer name={cat.icon} size={12} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />}
                          {cat.name}
                        </span>
                        <span className="item-row-cycle">{getCycleLabel(item.cycle)}</span>
                        {item.paymentMethod === 'cash' && item.cycle === 'monthly' && (
                          <span className="item-row-cycle" style={{ background: 'color-mix(in srgb, var(--primary-color) 12%, transparent)', color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <i className="fa-solid fa-money-bill-wave" style={{ fontSize: '0.7em' }}></i> 現金·計入生活費
                          </span>
                        )}
                      </div>
                      <div className="item-row-date">
                        <i className="fa-regular fa-calendar" style={{ marginRight: 3 }}></i>{dateRange}
                      </div>
                      {item.note && <div className="item-row-note" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}><i className="fa-regular fa-comment"></i> {item.note}</div>}
                    </div>
                    <div className="item-row-amount">
                      {item.currency && item.currency !== 'TWD'
                        ? <>{item.currency} {(item.originalAmount || 0).toLocaleString()} <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>(≈NT${item.amount.toLocaleString()})</span></>
                        : <>NT$ {(item.amount || 0).toLocaleString()}</>
                      }
                    </div>
                    <div className="item-row-actions">
                      <button className="icon-btn" title="編輯" onClick={() => openEdit(item)}><i className="fa-solid fa-pen"></i></button>
                      <button className="icon-btn delete" title="刪除" onClick={() => handleDelete(item.id)}><i className="fa-solid fa-trash"></i></button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, padding: '12px 0', flexWrap: 'wrap' }}>
            <button className="pagination-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className={`pagination-btn${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="pagination-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        )}
        </div>

        {/* Summary sidebar */}
        {summaryRows.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="fixed-summary-col"
          >
            <div className="fixed-summary-panel chart-section" style={{ padding: 16 }}>
              <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: '0.95rem', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-chart-pie" style={{ color: 'var(--primary-color)' }}></i> 支出彙總
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                  {{ category: '依分類', 'amount-desc': '金額高→低', 'amount-asc': '金額低→高', 'date-desc': '金額高→低', 'date-asc': '金額高→低' }[fixedSortMode]}
                </span>
              </h3>
              <div id="fixedSummaryContent" key={fixedSortMode}>
                {summaryRows.map((c, i) => (
                  <motion.div 
                    key={c.name} 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="fixed-summary-row"
                  >
                    <span className="fixed-summary-dot" style={{ background: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {c.icon && <IconRenderer name={c.icon} size={10} color={c.iconColor || "#fff"} />}
                    </span>
                    <span className="fixed-summary-name">{c.name}</span>
                    <span className="fixed-summary-amount">NT$ {Math.round(c.monthly).toLocaleString()}</span>
                  </motion.div>
                ))}
                <div className="fixed-summary-total">
                  <span>每月合計</span>
                  <span>NT$ {Math.round(totalMonthly).toLocaleString()}</span>
                </div>
                <div className="fixed-summary-yearly">每年估計 NT$ {Math.round(totalMonthly * 12).toLocaleString()}</div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => { if (navigator.vibrate) navigator.vibrate(50); setModalItem({ ...EMPTY_FORM, categoryId: categories[0]?.id || '' }); }}>
        <i className="fa-solid fa-plus"></i>
      </button>

      {/* Modals */}
      {modalItem !== null && (
        <ItemModal
          categories={categories}
          initial={modalItem.id ? modalItem : { ...EMPTY_FORM, categoryId: categories[0]?.id || '' }}
          onClose={() => setModalItem(null)}
          onSave={handleSaveItem}
        />
      )}
      {showCatModal && (
        <CategoryManageModal
          categories={categories}
          type="expense"
          onClose={() => setCatModal(false)}
          onSave={(cats) => {
            handleSaveCategories(cats);
          }}
        />
      )}
    </div>
  );
}
