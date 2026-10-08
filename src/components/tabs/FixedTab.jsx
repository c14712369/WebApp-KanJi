import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { getCycleLabel, toMonthlyAmount, fetchWithCache, showToast, autoFocusDesktop, confirmDialog } from '../../lib/utils';
import { getNextCharge, toYmd } from '../../lib/nextCharge';
import IconRenderer from '../../lib/IconRenderer';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';

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
  cycle: 'monthly', startDate: '', // 開啟新增視窗時才填今天（本地時間）
  endDate: '', note: '', paymentMethod: 'credit',
};

// ── Item Modal ──────────────────────────────────────────────────────────────
const MAIN_CYCLES = ['monthly', 'yearly'];
const CYCLE_SEG = [
  { value: 'monthly', label: '每月' },
  { value: 'yearly',  label: '每年' },
  { value: 'other',   label: '其他週期' },
];

function ItemModal({ categories, onClose, onSave, onDelete, initial }) {
  const [form, setForm]       = useState(initial || EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [shake, setShake]     = useState(false);
  const [errors, setErrors]   = useState({});
  // 結束日期、備註屬少用欄位：新增時收起，編輯時若已有值就展開
  const [showMore, setShowMore] = useState(!!(initial?.endDate || initial?.note));
  const isEdit = !!form.id;

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => (e[k] ? { ...e, [k]: undefined } : e));
  };

  const twdAmount = Math.round((parseFloat(form.originalAmount) || 0) * (parseFloat(form.exchangeRate) || 1));
  const cycleSeg  = MAIN_CYCLES.includes(form.cycle) ? form.cycle : 'other';

  const handleCurrencyChange = useCallback(async (curr) => {
    set('currency', curr);
    if (curr === 'TWD') { set('exchangeRate', 1); return; }
    setLoading(true);
    try {
      const data = await fetchWithCache(`https://api.frankfurter.app/latest?from=${curr}&to=TWD`);
      if (data?.rates?.TWD) set('exchangeRate', parseFloat(data.rates.TWD.toFixed(4)));
    } catch { setErrors(e => ({ ...e, exchangeRate: '匯率抓取失敗，請手動輸入' })); }
    finally { setLoading(false); }
  }, []);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = '請輸入名稱';
    if (!(parseFloat(form.originalAmount) > 0)) e.originalAmount = '請輸入大於 0 的金額';
    if (!form.startDate) e.startDate = '請選擇首次扣款日';
    if (form.endDate && form.startDate && form.endDate < form.startDate) e.endDate = '結束日期不能早於首次扣款日';
    return e;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      if (e.endDate) setShowMore(true);
      setShake(true);
      setTimeout(() => setShake(false), 400);
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

  const err = (k) => errors[k] && <span className="fx-field-error" id={`fx-err-${k}`} role="alert">{errors[k]}</span>;
  const invalid = (k) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `fx-err-${k}` } : {});

  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal fx-item-modal${shake ? ' shake' : ''}`} role="dialog" aria-modal="true" aria-labelledby="fxItemTitle" onPointerDown={e => e.stopPropagation()}>
        <div className="fx-item-head">
          <div className="settings-grabber" aria-hidden="true"></div>
          <div className="fx-item-head-row">
            <h3 id="fxItemTitle">{isEdit ? '編輯固定支出' : '新增固定支出'}</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="fx-item-form">
          <div className="fx-item-body">
            <div className="form-group">
              <label className="form-label" htmlFor="fxName">名稱</label>
              <input id="fxName" className="form-input" value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="例如：房租、Netflix、壽險" autoFocus={autoFocusDesktop} {...invalid('name')} />
              {err('name')}
            </div>

            {/* 金額是主角：幣別與金額同一列 */}
            <div className="form-group">
              <label className="form-label" htmlFor="fxAmount">金額</label>
              <div className={`fx-amount-field${errors.originalAmount ? ' is-invalid' : ''}`}>
                <select className="fx-currency" value={form.currency} onChange={e => handleCurrencyChange(e.target.value)} aria-label="幣別">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input id="fxAmount" className="fx-amount-input" type="number" inputMode="decimal" min="0" step="any"
                  value={form.originalAmount} onChange={e => set('originalAmount', e.target.value)} placeholder="輸入金額" {...invalid('originalAmount')} />
              </div>
              {err('originalAmount')}
              {form.currency !== 'TWD' && (
                <div className="fx-rate-row">
                  <label htmlFor="fxRate">1 {form.currency} =</label>
                  <input id="fxRate" className="form-input fx-rate-input" type="number" inputMode="decimal" min="0" step="any"
                    value={form.exchangeRate} onChange={e => set('exchangeRate', e.target.value)} {...invalid('exchangeRate')} />
                  <span>TWD</span>
                  <span className="fx-rate-result">{loading ? '抓取匯率中…' : `≈ NT$ ${twdAmount.toLocaleString()}`}</span>
                </div>
              )}
              {err('exchangeRate')}
            </div>

            <div className="form-group">
              <span className="form-label">扣款週期</span>
              <Segmented options={CYCLE_SEG} value={cycleSeg} label="扣款週期"
                onChange={v => set('cycle', v === 'other' ? (MAIN_CYCLES.includes(form.cycle) ? 'quarterly' : form.cycle) : v)} />
              {cycleSeg === 'other' && (
                <select className="form-select fx-cycle-more" value={form.cycle} onChange={e => set('cycle', e.target.value)} aria-label="其他週期">
                  {CYCLES.filter(c => !MAIN_CYCLES.includes(c.value)).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              )}
            </div>

            <div className="fx-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="fxCat">分類</label>
                <select id="fxCat" className="form-select" value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="fxStart">首次扣款日</label>
                <input id="fxStart" className="form-input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} {...invalid('startDate')} />
                {err('startDate')}
              </div>
            </div>

            <div className="form-group">
              <span className="form-label">付款方式</span>
              <div className="pay-method-toggle">
                <button type="button" className={`pay-method-btn${form.paymentMethod === 'credit' ? ' active' : ''}`} aria-pressed={form.paymentMethod === 'credit'} onClick={() => set('paymentMethod', 'credit')}>
                  <i className="fa-solid fa-credit-card"></i> 信用卡
                </button>
                <button type="button" className={`pay-method-btn${form.paymentMethod === 'cash' ? ' active' : ''}`} aria-pressed={form.paymentMethod === 'cash'} onClick={() => set('paymentMethod', 'cash')}>
                  <i className="fa-solid fa-money-bill-wave"></i> 現金
                </button>
              </div>
              <p className="fx-help">
                {form.paymentMethod === 'credit'
                  ? '信用卡帳款由 Gmail 記帳自動匯入明細，不另外計入結餘。'
                  : (form.cycle === 'monthly'
                      ? '現金每月支出將自動計入生活費結餘（獨立顯示，無需手動記帳）。'
                      : '提醒：僅「每月」週期的現金項目會自動計入生活費結餘。')}
              </p>
            </div>

            <button type="button" className="fx-more-toggle" aria-expanded={showMore} onClick={() => setShowMore(v => !v)}>
              <span>更多選項</span>
              {!showMore && <span className="fx-more-hint">結束日期、備註</span>}
              <i className={`fa-solid fa-chevron-${showMore ? 'up' : 'down'}`} aria-hidden="true"></i>
            </button>
            {showMore && (
              <div className="fx-more">
                <div className="fx-grid-2">
                  <div className="form-group">
                    <label className="form-label" htmlFor="fxEnd">結束日期</label>
                    <input id="fxEnd" className="form-input" type="date" value={form.endDate} min={form.startDate || undefined}
                      onChange={e => set('endDate', e.target.value)} {...invalid('endDate')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="fxNote">備註</label>
                    <input id="fxNote" className="form-input" value={form.note} onChange={e => set('note', e.target.value)} placeholder="例如：含管理費" />
                  </div>
                </div>
                {err('endDate')}
              </div>
            )}
          </div>

          <div className="fx-item-foot">
            {onDelete
              ? <button type="button" className="btn btn-ghost fx-modal-delete" onClick={onDelete}><i className="fa-solid fa-trash"></i> 刪除</button>
              : <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>}
            <button type="submit" className="btn btn-primary fx-submit">
              <i className="fa-solid fa-check"></i> {isEdit ? '儲存' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── List helpers ────────────────────────────────────────────────────────────
const SORTS = [
  { value: 'next',        label: '即將扣款' },
  { value: 'amount-desc', label: '金額' },
  { value: 'category',    label: '分類' },
];
const PAY_FILTERS = [
  { value: 'all',    label: '全部' },
  { value: 'credit', label: '信用卡' },
  { value: 'cash',   label: '現金' },
];
const STATUS_FILTERS = [
  { value: 'active', label: '進行中' },
  { value: 'ended',  label: '已結束' },
  { value: 'all',    label: '全部' },
];
const SWIPE_W = 84; // 左滑露出的刪除鈕寬度
const SOON_DAYS = 7;
const ROW_SPRING = { type: 'spring', stiffness: 520, damping: 42 };

const fmtMD = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
const fmtNT = (n) => `NT$ ${Math.round(n).toLocaleString()}`;
const vibrate = (ms = 20) => { if (navigator.vibrate) navigator.vibrate(ms); };

// 7 天內以「相對時間」開頭（最急的資訊先讀到），更遠的只給日期
function chargeText(next) {
  if (next.daysLeft === 0) return '今天扣款';
  if (next.daysLeft === 1) return `明天扣款 · ${fmtMD(next.date)}`;
  if (next.daysLeft <= SOON_DAYS) return `${next.daysLeft} 天後扣款 · ${fmtMD(next.date)}`;
  return `${fmtMD(next.date)} 扣款`;
}

// ── Segmented control（iOS 樣式，共用於工具列與篩選面板）──
function Segmented({ options, value, onChange, label, counts }) {
  return (
    <div className="fx-seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value} type="button" role="radio" aria-checked={value === o.value}
          className={`fx-seg-btn${value === o.value ? ' is-active' : ''}`}
          onClick={() => { vibrate(); onChange(o.value); }}
        >
          {o.label}
          {counts?.[o.value] != null && <span className="fx-seg-count">{counts[o.value]}</span>}
        </button>
      ))}
    </div>
  );
}

// ── 篩選・排序面板 ──
function FilterSheet({ payFilter, setPayFilter, sortMode, setSortMode, onClose }) {
  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-sheet fx-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="fxFilterTitle">
        <div className="settings-grabber" aria-hidden="true"></div>
        <div className="settings-head">
          <h2 id="fxFilterTitle">篩選與排序</h2>
          <button type="button" className="settings-done" onClick={onClose}>完成</button>
        </div>
        <div className="settings-group-label">排序</div>
        <Segmented options={SORTS} value={sortMode} onChange={setSortMode} label="排序方式" />
        <div className="settings-group-label">付款方式</div>
        <Segmented options={PAY_FILTERS} value={payFilter} onChange={setPayFilter} label="付款方式" />
      </div>
    </div>
  );
}

// ── 單列：點整列編輯、左滑刪除 ──
function FixedRow({ item, cat, next, ended, isOpen, onOpen, onClose, onEdit, onDelete }) {
  const monthly = toMonthlyAmount(item);
  const isForeign = item.currency && item.currency !== 'TWD';
  const soon = next && next.daysLeft <= SOON_DAYS;
  const showMonthly = !ended && item.cycle !== 'monthly' && item.cycle !== 'fixed' && monthly > 0;
  const dragged = useRef(false); // 這次按壓有拖曳過 → 放開時不當成點擊
  // 位移用 motion value 明確驅動：拖到一半放手時目標值沒變，宣告式 animate 不會回彈
  const x = useMotionValue(0);
  const settle = (open) => animate(x, open ? -SWIPE_W : 0, ROW_SPRING);
  useEffect(() => { const c = settle(isOpen); return () => c.stop(); }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  let meta;
  if (next) meta = chargeText(next);
  else if (item.endDate && item.endDate < toYmd(new Date())) meta = `已於 ${item.endDate} 結束`;
  else meta = '已無後續扣款';

  return (
    <div className={`fx-row-wrap${isOpen ? ' is-open' : ''}`}>
      <button type="button" className="fx-row-delete" tabIndex={isOpen ? 0 : -1} aria-hidden={!isOpen}
        onClick={() => onDelete(item)}>
        <i className="fa-solid fa-trash" aria-hidden="true"></i>
        <span>刪除</span>
      </button>
      <motion.div
        className={`fx-row${ended ? ' is-ended' : ''}`}
        role="button" tabIndex={0}
        aria-label={`${item.name}，${getCycleLabel(item.cycle)} ${fmtNT(item.amount || 0)}，${meta}。點按編輯`}
        drag="x" dragDirectionLock dragMomentum={false}
        dragConstraints={{ left: -SWIPE_W, right: 0 }} dragElastic={{ left: 0.15, right: 0 }}
        style={{ x }}
        onPointerDown={() => { dragged.current = false; }}
        onDragStart={() => { dragged.current = true; }}
        onDragEnd={(_, info) => {
          const open = info.offset.x < -SWIPE_W / 2 || info.velocity.x < -400;
          if (open) { if (!isOpen) vibrate(10); onOpen(item.id); } else onClose();
          settle(open);
        }}
        onTap={() => { if (dragged.current) return; if (isOpen) onClose(); else onEdit(item); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(item); } if (e.key === 'Delete') onDelete(item); }}
      >
        <span className="fx-row-icon" style={{ background: cat.color }} aria-hidden="true">
          {cat.icon ? <IconRenderer name={cat.icon} size={18} color={cat.iconColor || '#fff'} /> : <i className="fa-solid fa-receipt"></i>}
        </span>
        <span className="fx-row-main">
          <span className="fx-row-name">{item.name}</span>
          <span className="fx-row-meta">
            <span className={soon && !ended ? 'fx-soon' : undefined}>{meta}</span>
            {item.paymentMethod === 'cash' && <span className="fx-tag">現金</span>}
          </span>
          {item.note && <span className="fx-row-note">{item.note}</span>}
        </span>
        <span className="fx-row-amount">
          <span className="fx-row-amount-main">
            {isForeign ? `${item.currency} ${(item.originalAmount || 0).toLocaleString()}` : fmtNT(item.amount || 0)}
          </span>
          <span className="fx-row-amount-sub">
            {isForeign ? `${getCycleLabel(item.cycle)} · ≈ ${fmtNT(item.amount || 0)}` : getCycleLabel(item.cycle)}
          </span>
          {showMonthly && <span className="fx-row-amount-sub">≈ {fmtNT(monthly)}／月</span>}
        </span>
      </motion.div>
    </div>
  );
}

// ── Main FixedTab ───────────────────────────────────────────────────────────
export default function FixedTab() {
  const {
    items, categories, fixedSortMode,
    addItem, updateItem, deleteItem,
    setFixedSortMode,
  } = useAppStore();

  const [statusFilter, setStatus]   = useState('active');
  const [payFilter, setPayFilter]   = useState('all');  // all | credit | cash
  const [modalItem, setModalItem]   = useState(null);   // null=closed, {}=new, item=edit
  const [showFilter, setShowFilter] = useState(false);
  const [openRowId, setOpenRowId]   = useState(null);   // 目前左滑展開的列

  // 舊排序值（日期、金額低→高）併入新選項
  const sortMode = SORTS.some(s => s.value === fixedSortMode) ? fixedSortMode : 'next';

  const now = new Date(); now.setHours(0, 0, 0, 0);
  const todayYmd = toYmd(now);
  const getCat  = (item) => categories.find(c => c.id === item.categoryId) || categories[categories.length - 1] || { color: '#9DB2BF', name: '其他' };

  const matchPay = (item) => payFilter === 'all' || (item.paymentMethod === 'cash' ? 'cash' : 'credit') === payFilter;

  // ── Filter + Sort ──
  // 「已結束」= 結束日已過，或之後不會再扣款（一次性已過、結束日前已扣完最後一期），與下次扣款日同一套判斷
  const withNext = items.map(item => {
    const next = getNextCharge(item, now);
    return { item, next, ended: (!!item.endDate && item.endDate < todayYmd) || (!next && !!item.startDate) };
  });
  const statusCounts = {
    active: withNext.filter(r => !r.ended && matchPay(r.item)).length,
    ended:  withNext.filter(r => r.ended && matchPay(r.item)).length,
  };
  const rows = withNext
    .filter(r => (statusFilter === 'all' || (statusFilter === 'ended') === r.ended) && matchPay(r.item))
    .sort((a, b) => {
      if (a.ended !== b.ended) return a.ended ? 1 : -1; // 已結束一律沉底
      if (sortMode === 'amount-desc') return toMonthlyAmount(b.item) - toMonthlyAmount(a.item);
      if (sortMode === 'category') {
        const ai = categories.findIndex(c => c.id === a.item.categoryId);
        const bi = categories.findIndex(c => c.id === b.item.categoryId);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || toMonthlyAmount(b.item) - toMonthlyAmount(a.item);
      }
      const ad = a.next ? a.next.daysLeft : Infinity;
      const bd = b.next ? b.next.daysLeft : Infinity;
      return ad - bd;
    });

  // ── Totals（進行中 + 付款篩選）──
  const activeRows   = withNext.filter(r => !r.ended && matchPay(r.item));
  const totalMonthly = activeRows.reduce((s, r) => s + toMonthlyAmount(r.item), 0);
  const soonRows     = activeRows.filter(r => r.next && r.next.daysLeft <= SOON_DAYS);
  const soonTotal    = soonRows.reduce((s, r) => s + (Number(r.item.amount) || 0), 0);

  const catMap = {};
  activeRows.forEach(({ item }) => {
    const cat = getCat(item);
    if (!catMap[cat.name]) catMap[cat.name] = { name: cat.name, color: cat.color, monthly: 0 };
    catMap[cat.name].monthly += toMonthlyAmount(item);
  });
  const segments = Object.values(catMap).filter(c => c.monthly > 0).sort((a, b) => b.monthly - a.monthly);

  const filterDirty = payFilter !== 'all';

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

  const handleDelete = async (item) => {
    if (!await confirmDialog({ title: '刪除項目', message: `確定要刪除「${item?.name || '此項目'}」嗎？此動作無法復原。`, confirmText: '刪除' })) return;
    vibrate(50);
    deleteItem(item.id);
    setOpenRowId(null);
    setModalItem(null);
    showToast('刪除成功');
  };

  const openNew = () => { vibrate(50); setOpenRowId(null); setModalItem({ ...EMPTY_FORM, categoryId: categories[0]?.id || '', startDate: toYmd(new Date()) }); };

  const openEdit = (item) => {
    vibrate(20);
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

  const clearFilters = () => { vibrate(); setStatus('active'); setPayFilter('all'); };

  return (
    <div className="tab-content fx-page" onPointerDown={e => { if (openRowId && !e.target.closest('.fx-row-wrap.is-open')) setOpenRowId(null); }}>
      {/* 總覽：每月合計是主角 */}
      {items.length > 0 && <section className="fx-hero" aria-label="固定支出總覽">
        <div className="fx-hero-top">
          <div>
            <div className="fx-hero-label">每月固定支出{filterDirty && `（${PAY_FILTERS.find(p => p.value === payFilter).label}）`}</div>
            <div className="fx-hero-amount">{fmtNT(totalMonthly)}</div>
          </div>
          <div className="fx-hero-side">
            <span>每年 {fmtNT(totalMonthly * 12)}</span>
            <span>{activeRows.length} 項進行中</span>
          </div>
        </div>

        {segments.length > 0 && (
          <>
            <div className="fx-bar" role="img" aria-label={segments.map(s => `${s.name} ${Math.round(s.monthly / totalMonthly * 100)}%`).join('、')}>
              {segments.map(s => (
                <span key={s.name} style={{ flexGrow: s.monthly, background: s.color }} title={`${s.name} ${fmtNT(s.monthly)}／月`} />
              ))}
            </div>
            <ul className="fx-legend">
              {segments.map(s => (
                <li key={s.name}>
                  <i style={{ background: s.color }} aria-hidden="true"></i>
                  <span className="fx-legend-name">{s.name}</span>
                  <span className="fx-legend-amt">{fmtNT(s.monthly)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {soonRows.length > 0 && (
          <div className="fx-hero-soon">
            <i className="fa-regular fa-clock" aria-hidden="true"></i>
            {SOON_DAYS} 天內將扣 <strong>{fmtNT(soonTotal)}</strong>（{soonRows.length} 筆）
          </div>
        )}
      </section>}

      {/* 工具列：狀態 + 篩選排序 */}
      <div className="fx-toolbar">
        <Segmented options={STATUS_FILTERS} value={statusFilter} onChange={setStatus} label="項目狀態" counts={statusCounts} />
        <button type="button" className={`fx-filter-btn${filterDirty ? ' is-dirty' : ''}`} onClick={() => { vibrate(); setShowFilter(true); }}
          aria-label={`篩選與排序，目前依${SORTS.find(s => s.value === sortMode).label}排序${filterDirty ? '，已篩選付款方式' : ''}`}>
          <i className="fa-solid fa-arrow-down-wide-short" aria-hidden="true"></i>
          <span>{SORTS.find(s => s.value === sortMode).label}</span>
        </button>
      </div>

      {/* 列表 */}
      {rows.length === 0 ? (
        items.length === 0 ? (
          <div className="fx-empty">
            <span className="fx-empty-icon" aria-hidden="true"><i className="fa-solid fa-receipt"></i></span>
            <strong>還沒有固定支出</strong>
            <p>房租、訂閱、保險……加進來就能看到每月合計與下次扣款日。</p>
            <button type="button" className="btn btn-primary" onClick={openNew}><i className="fa-solid fa-plus"></i> 新增第一筆</button>
          </div>
        ) : (
          <div className="fx-empty">
            <strong>這個篩選下沒有項目</strong>
            <button type="button" className="fx-link" onClick={clearFilters}>清除篩選</button>
          </div>
        )
      ) : (
        <div className="fx-list">
          <AnimatePresence initial={false}>
            {rows.map(({ item, ended, next }) => (
              <motion.div key={item.id} layout="position"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}>
                <FixedRow
                  item={item} cat={getCat(item)} next={next} ended={ended}
                  isOpen={openRowId === item.id}
                  onOpen={setOpenRowId} onClose={() => setOpenRowId(null)}
                  onEdit={openEdit} onDelete={handleDelete}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {rows.length > 0 && <p className="fx-hint">點一下編輯，向左滑可刪除</p>}

      {/* FAB */}
      <button className="fab" onClick={openNew} aria-label="新增固定支出">
        <i className="fa-solid fa-plus"></i>
      </button>

      {showFilter && (
        <FilterSheet payFilter={payFilter} setPayFilter={setPayFilter} sortMode={sortMode} setSortMode={setFixedSortMode} onClose={() => setShowFilter(false)} />
      )}

      {modalItem !== null && (
        <ItemModal
          categories={categories}
          initial={modalItem}
          onClose={() => setModalItem(null)}
          onSave={handleSaveItem}
          onDelete={modalItem.id ? () => handleDelete(items.find(i => i.id === modalItem.id)) : null}
        />
      )}
    </div>
  );
}
