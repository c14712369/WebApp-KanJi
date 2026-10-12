import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAppStore } from '../../store/appStore';
import { fetchWithCache, formatAmount, showToast, autoFocusDesktop, confirmDialog } from '../../lib/utils';
import { buildProxyUrl, unwrapAllOrigins, twSymbolCandidates } from '../../lib/yahooProxy';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { WEALTH_PARAMS_KEY } from '../../lib/constants';
import { holdingAllocation, loanPayment, loanPayAt, solveMonthlyBudget } from '../../lib/wealthPlan';

Chart.register(...registerables);

// ── Stock list ────────────────────────────────────────────────────────────────
const STOCK_LIST = [
  { symbol: '2330', name: '台積電', suffix: '.TW' },
  { symbol: '2454', name: '聯發科', suffix: '.TW' },
  { symbol: '2317', name: '鴻海', suffix: '.TW' },
  { symbol: '2308', name: '台達電', suffix: '.TW' },
  { symbol: '2357', name: '華碩', suffix: '.TW' },
  { symbol: '2382', name: '廣達', suffix: '.TW' },
  { symbol: '2303', name: '聯電', suffix: '.TW' },
  { symbol: '2408', name: '南亞科', suffix: '.TW' },
  { symbol: '2301', name: '光寶科', suffix: '.TW' },
  { symbol: '2324', name: '仁寶', suffix: '.TW' },
  { symbol: '2353', name: '宏碁', suffix: '.TW' },
  { symbol: '2356', name: '英業達', suffix: '.TW' },
  { symbol: '2603', name: '長榮', suffix: '.TW' },
  { symbol: '2609', name: '陽明', suffix: '.TW' },
  { symbol: '2615', name: '萬海', suffix: '.TW' },
  { symbol: '2618', name: '長榮航', suffix: '.TW' },
  { symbol: '2610', name: '華航', suffix: '.TW' },
  { symbol: '2002', name: '中鋼', suffix: '.TW' },
  { symbol: '6488', name: '環球晶', suffix: '.TWO' },
  { symbol: '2886', name: '兆豐金', suffix: '.TW' },
  { symbol: '2884', name: '玉山金', suffix: '.TW' },
  { symbol: '2882', name: '國泰金', suffix: '.TW' },
  { symbol: '2891', name: '中信金', suffix: '.TW' },
  { symbol: '2892', name: '第一金', suffix: '.TW' },
  { symbol: '2880', name: '華南金', suffix: '.TW' },
  { symbol: '2881', name: '富邦金', suffix: '.TW' },
  { symbol: '2883', name: '凱基金', suffix: '.TW' },
  { symbol: '2885', name: '元大金', suffix: '.TW' },
  { symbol: '2887', name: '台新金', suffix: '.TW' },
  { symbol: '2888', name: '新光金', suffix: '.TW' },
  { symbol: '2890', name: '永豐金', suffix: '.TW' },
  { symbol: '5880', name: '合庫金', suffix: '.TW' },
  { symbol: '0050',   name: '元大台灣50',       suffix: '.TW' },
  { symbol: '0056',   name: '元大高股息',        suffix: '.TW' },
  { symbol: '006208', name: '富邦台50',          suffix: '.TW' },
  { symbol: '00662',  name: '富邦NASDAQ',        suffix: '.TW' },
  { symbol: '00631L', name: '元大台灣50正2',      suffix: '.TW' },
  { symbol: '00646',  name: '元大S&P500',        suffix: '.TW' },
  { symbol: '00878',  name: '國泰永續高股息',      suffix: '.TW' },
  { symbol: '00919',  name: '群益台灣精選高息',    suffix: '.TW' },
  { symbol: '00929',  name: '復華台灣科技優息',    suffix: '.TW' },
  { symbol: '00939',  name: '統一台灣高息動能',    suffix: '.TW' },
  { symbol: '00940',  name: '元大台灣價值高息',    suffix: '.TW' },
  { symbol: '00981A', name: '主動統一台股增長',    suffix: '.TW' },
  { symbol: '00679B', name: '元大美債20年',       suffix: '.TW' },
  { symbol: '00687B', name: '國泰20年美債',       suffix: '.TW' },
  { symbol: 'SPY', name: 'S&P 500 ETF', suffix: '' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', suffix: '' },
  { symbol: 'VTI', name: 'Vanguard Total Market', suffix: '' },
  { symbol: 'VOO', name: 'Vanguard S&P 500', suffix: '' },
  { symbol: 'NVDA', name: 'NVIDIA', suffix: '' },
  { symbol: 'AAPL', name: 'Apple', suffix: '' },
  { symbol: 'MSFT', name: 'Microsoft', suffix: '' },
  { symbol: 'GOOGL', name: 'Alphabet', suffix: '' },
  { symbol: 'AMZN', name: 'Amazon', suffix: '' },
  { symbol: 'META', name: 'Meta', suffix: '' },
  { symbol: 'TSLA', name: 'Tesla', suffix: '' },
];

const BANK_NAMES = [
  '台灣銀行', '土地銀行', '合作金庫', '第一銀行', '華南銀行',
  '彰化銀行', '兆豐銀行', '台灣企銀', '輸出入銀行',
  '台北富邦', '國泰世華', '中國信託', '玉山銀行', '台新銀行',
  '永豐銀行', '聯邦銀行', '遠東銀行', '元大銀行', '凱基銀行',
  '新光銀行', '陽信銀行', '安泰銀行', '三信銀行',
  '星展銀行', '渣打銀行', '花旗銀行', '匯豐銀行',
  '將來銀行', '樂天銀行', 'LINE Bank', 'Richart（台新）',
  '郵局',
  '美股券商 (Firstrade)', '美股券商 (Interactive Brokers)', '台股券商保留款', '現金',
];

const ACCOUNT_TYPES = ['活存', '定存', '定期儲金', '數位帳戶', '外幣帳戶', '綜合存款', '其他'];

// ── Symbol color (consistent per ticker) ────────────────────────────────────
const SYMBOL_PALETTE = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#06b6d4','#f97316','#ec4899','#14b8a6','#a855f7'];
function symbolColor(sym) {
  let h = 0;
  for (let i = 0; i < sym.length; i++) h = sym.charCodeAt(i) + ((h << 5) - h);
  return SYMBOL_PALETTE[Math.abs(h) % SYMBOL_PALETTE.length];
}

// ── Stock price fetch ─────────────────────────────────────────────────────────
async function fetchStockPrice(rawSymbol, forceRefresh = false) {
  // 上市(.TW)/上櫃(.TWO) 無法事先得知，依序嘗試候選代號，取第一個有價者。
  for (const symbol of twSymbolCandidates(rawSymbol)) {
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    try {
      const data  = unwrapAllOrigins(await fetchWithCache(buildProxyUrl(targetUrl), forceRefresh ? 0 : 6));
      const meta  = data?.chart?.result?.[0]?.meta;
      const price = meta ? (meta.regularMarketPrice || meta.previousClose || null) : null;
      if (price != null) return price;
    } catch { /* 換下一個候選 */ }
  }
  return null;
}

async function fetchCAGR(rawSymbol, years) {
  // 跟取價一樣，上市/上櫃依序嘗試，取第一個有資料者
  for (const symbol of twSymbolCandidates(rawSymbol)) {
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=${years}y`;
    try {
      const data   = unwrapAllOrigins(await fetchWithCache(buildProxyUrl(targetUrl), 24));
      const prices = (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(p => p != null);
      if (prices.length >= 2) return Math.pow(prices[prices.length - 1] / prices[0], 1 / years) - 1;
    } catch { /* 換下一個候選 */ }
  }
  return null;
}

// ── Holding Modal ─────────────────────────────────────────────────────────────
function HoldingModal({ initial, onClose, onSave }) {
  const isEdit = !!initial;
  const [search,    setSearch]    = useState(initial ? `${(initial.symbol || '').replace('.TW', '')} ${initial.name || ''}`.trim() : '');
  const [symbol,    setSymbol]    = useState(initial?.symbol || '');
  const [name,      setName]      = useState(initial?.name || '');
  const [shares,    setShares]    = useState(initial ? String(initial.shares ?? '') : '');
  const [price,     setPrice]     = useState(initial?.lastPrice ?? null);
  const [loading,   setLoading]   = useState(false);
  const [dropdown,  setDropdown]  = useState([]);

  const handleSearchChange = (q) => {
    setSearch(q);
    if (!q) { setDropdown([]); return; }
    const lower = q.toLowerCase();
    let filtered = STOCK_LIST.filter(s => s.symbol.toLowerCase().startsWith(lower) || s.name.toLowerCase().includes(lower));

    const trimmed = q.trim().toUpperCase();
    if (trimmed && !filtered.some(s => s.symbol.toUpperCase() === trimmed)) {
      const isNum = /^\d+$/.test(trimmed);
      filtered = [
        ...filtered,
        {
          symbol: trimmed,
          name: `線上搜尋「${trimmed}」...`,
          suffix: isNum ? '.TW' : '',
          isDynamic: true
        }
      ];
    }
    setDropdown(filtered.slice(0, 8));
  };

  const selectStock = async (stock) => {
    const fullSymbol = stock.symbol + (stock.suffix || '');
    setSymbol(fullSymbol); 
    const displayName = stock.isDynamic ? stock.symbol : stock.name;
    setName(displayName);
    setSearch(`${stock.symbol} ${displayName}`); 
    setDropdown([]);
    setLoading(true); setPrice(null);
    const p = await fetchStockPrice(fullSymbol);
    setPrice(p); setLoading(false);
  };

  const handleEnter = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = search.trim().toUpperCase();
    if (raw) { 
      const isNum = /^\d+$/.test(raw);
      const fullSymbol = raw + (isNum ? '.TW' : '');
      setSymbol(fullSymbol); 
      setName(raw);
      setDropdown([]); 
      setLoading(true); setPrice(null); 
      const p = await fetchStockPrice(fullSymbol); 
      setPrice(p); setLoading(false); 
    }
  };

  const handleSave = () => {
    const sym = symbol || search.trim().toUpperCase();
    if (!sym || !(parseFloat(shares) > 0)) { showToast('請填寫代號與股數', 'error'); return; }
    // 編輯時若未重新抓價，沿用原本的價格與更新時間
    const finalPrice   = price != null ? price : (initial?.lastPrice ?? null);
    const finalUpdated = price != null ? new Date().toISOString() : (initial?.lastUpdated ?? null);
    onSave({
      id: initial?.id || ('h-' + Date.now()),
      symbol: sym, name, shares: parseFloat(shares),
      lastPrice: finalPrice, lastUpdated: finalPrice ? finalUpdated : null,
    });
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-header">
          <h3>{isEdit ? '編輯持股' : '新增持股'}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉"><i className="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div className="form-group" id="stockSearchWrap" style={{ position: 'relative' }}>
          <label className="form-label">搜尋股票代號 / 名稱</label>
          <input className="form-input" autoFocus={autoFocusDesktop} value={search} onChange={e => handleSearchChange(e.target.value)} onKeyDown={handleEnter} placeholder="輸入代號或名稱…" />
          {dropdown.length > 0 && (
            <div id="stockDropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 8, zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
              {dropdown.map((s, i) => (
                <div key={i} className="stock-dropdown-item" style={{ padding: '8px 12px', cursor: 'pointer' }} onClick={() => selectStock(s)}>
                  <span className="stock-dd-symbol" style={{ fontWeight: 600, marginRight: 8 }}>{s.symbol}</span>
                  <span className="stock-dd-name" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">股票/標的名稱</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="例如：台積電、南亞科、標普500..." />
        </div>
        {(price !== null || loading) && (
          <div id="holdingSelectedInfo" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            {loading ? <><i className="fa-solid fa-rotate fa-spin"></i> 抓取股價中…</> : `現價 NT$ ${price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        )}
        <div className="form-group">
          <label className="form-label">股數</label>
          <input className="form-input" type="number" inputMode="decimal" min="0" step="any" value={shares} onChange={e => setShares(e.target.value)} placeholder="0" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}>
            <i className="fa-solid fa-check"></i> {isEdit ? '儲存' : '新增'}
          </button>
          <button className="btn" style={{ flex: 1, background: 'var(--bg-color)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }} onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
}

// ── Bank Modal ────────────────────────────────────────────────────────────────
function parseBankName(combined) {
  const sep = combined?.indexOf(' — ');
  if (sep > -1) return { bank: combined.slice(0, sep), type: combined.slice(sep + 3) };
  return { bank: combined || '', type: '' };
}

function BankModal({ initial, onClose, onSave }) {
  const parsed = parseBankName(initial?.bankName);
  const [bank,     setBank]     = useState(parsed.bank);
  const [accType,  setAccType]  = useState(parsed.type || '活存');
  const [balance,  setBalance]  = useState(initial?.balance || '');
  const [rate,     setRate]     = useState(initial?.rate     || '0');
  const [dropdown, setDropdown] = useState([]);

  const handleSearch = (q) => {
    setBank(q);
    const lower = (q || '').toLowerCase();
    setDropdown(lower ? BANK_NAMES.filter(b => b.toLowerCase().includes(lower)) : BANK_NAMES);
  };

  const isSpecial = (b) => ['現金', '美股券商 (Firstrade)', '美股券商 (Interactive Brokers)', '台股券商保留款'].includes(b);

  const handleSave = () => {
    if (!bank.trim()) { showToast('請填寫銀行名稱', 'error'); return; }
    const combined = isSpecial(bank) ? bank : `${bank} — ${accType}`;
    onSave({ id: initial?.id || 'b-' + Date.now(), bankName: combined, balance: parseFloat(balance) || 0, rate: parseFloat(rate) || 0 });
  };

  return (
    <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <h3>{initial ? '編輯帳戶' : '新增帳戶'}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉"><i className="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </div>
        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label">銀行 / 機構</label>
          <input className="form-input" autoFocus={autoFocusDesktop} value={bank} onChange={e => handleSearch(e.target.value)} onFocus={() => setDropdown(BANK_NAMES)} onBlur={() => setTimeout(() => setDropdown([]), 150)} placeholder="搜尋或輸入…" />
          {dropdown.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 8, zIndex: 100, maxHeight: 200, overflowY: 'auto' }}>
              {dropdown.map((b, i) => (
                <div key={i} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.9rem' }} onMouseDown={() => { setBank(b); setDropdown([]); }}>{b}</div>
              ))}
            </div>
          )}
        </div>
        {!isSpecial(bank) && (
          <div className="form-group">
            <label className="form-label">帳戶類型</label>
            <select className="form-select" value={accType} onChange={e => setAccType(e.target.value)}>
              {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        <div className="form-group">
          <label className="form-label">餘額（NT$）</label>
          <input className="form-input" type="number" inputMode="decimal" min="0" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">年利率（%）</label>
          <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="0" />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>取消</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}>
            <i className="fa-solid fa-check"></i> 儲存
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 規劃頁的摘要列：平常一行，點了才展開編輯 ──
function PlanRow({ id, title, desc, open, onToggle, children }) {
  return (
    <div className={`wl-prow${open ? ' is-open' : ''}`}>
      <button type="button" className="wl-prow-sum" aria-expanded={open} aria-controls={`prow-${id}`} onClick={onToggle}>
        <span className="wl-prow-title">{title}</span>
        <span className="wl-prow-desc">{desc}</span>
        <i className="fa-solid fa-chevron-down wl-prow-chev" aria-hidden="true"></i>
      </button>
      {open && <div className="wl-prow-body" id={`prow-${id}`}>{children}</div>}
    </div>
  );
}

// 摘要用的萬元寫法：26,953 → 2.7 萬、17,000,000 → 1,700 萬
const wan = v => v >= 10000 ? `${(Math.round(v / 1000) / 10).toLocaleString()} 萬` : Math.round(v).toLocaleString();

// ── Wealth Chart ──────────────────────────────────────────────────────────────
function WealthChart({ labels, cashData, investData, totalData, targetFV, targetLabel = '目標金額' }) {
  const theme     = useAppStore(s => s.theme);
  const chartRef  = useRef(null);
  const chartInst = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !labels?.length) { chartInst.current?.destroy(); chartInst.current = null; return; }
    const cs       = getComputedStyle(document.documentElement);
    const tok      = (k, fb) => cs.getPropertyValue(k).trim() || fb;
    const tc       = tok('--text-muted', '#4D687D');
    const gc       = tok('--border-color', '#B5C8D4');
    const cInv     = tok('--primary-color', '#526D82');
    const cCash    = tok('--success-color', '#3D7A5A');
    const cTotal   = tok('--text-main', '#27374D');
    const cTarget  = tok('--accent-color', '#C17B2E');
    const targetArr = new Array(labels.length).fill(targetFV);
    chartInst.current?.destroy();
    chartInst.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '現金/活存累積', data: cashData,   borderColor: cCash, backgroundColor: cCash + '26', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
          { label: '投資部位累積', data: investData, borderColor: cInv, backgroundColor: cInv + '26', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
          { label: '總資產',       data: totalData,  borderColor: cTotal, borderWidth: 2.5, pointRadius: 3, tension: 0.3, fill: false },
          { label: targetLabel,     data: targetArr,  borderColor: cTarget, borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: tc, padding: 16, usePointStyle: true } },
          tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': NT$ ' + Math.round(ctx.raw).toLocaleString() } },
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: tc, callback: v => 'NT$ ' + (v / 10000).toLocaleString() + '萬' }, grid: { color: gc } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });
  }, [labels, cashData, investData, totalData, targetFV, targetLabel, theme]);

  useEffect(() => () => { chartInst.current?.destroy(); chartInst.current = null; }, []);

  return <canvas ref={chartRef}></canvas>;
}

// ── Animated Number ───────────────────────────────────────────────────────────

// ── Main WealthTab ────────────────────────────────────────────────────────────
export default function WealthTab() {
  const {
    wealthHoldings, wealthBankAccounts,
    setWealthHoldings, setWealthBankAccounts, setWealthParams,
  } = useAppStore();

  const savedParams = (() => { try { return JSON.parse(localStorage.getItem(WEALTH_PARAMS_KEY)) || {}; } catch { return {}; } })();

  const [holdingModal, setHoldingModal] = useState(null); // null=關閉, 'new'=新增, holding 物件=編輯
  const [editBankId,       setEditBankId]       = useState(null);
  const [showBankModal,    setShowBankModal]     = useState(false);
  const [fetchingId,       setFetchingId]        = useState(null);
  const [isRefreshing,     setIsRefreshing]      = useState(false);

  // Calculator inputs
  const [invRate,    setInvRate]    = useState(savedParams.invRate    || '7');
  const [invMonthly, setInvMonthly] = useState(savedParams.invMonthly || '5000');
  const [cashRate,   setCashRate]   = useState(savedParams.cashRate   || '1.5');
  const [cashMonthly, setCashMonthly] = useState(savedParams.cashMonthly || '5000');
  // 人生目標規劃：買車/買房等目標 + 退休，回推每月要能挪出多少（貸款從這筆錢裡扣）
  const [planGoals, setPlanGoals] = useState(() => savedParams.planGoals || [
    { id: 'g-car',   name: '買車', years: '5',  cash: '500000',  loan: '1500000',  loanRate: '3',   loanYears: '5' },
    { id: 'g-house', name: '買房', years: '10', cash: '3000000', loan: '17000000', loanRate: '2.2', loanYears: '30' },
  ]);
  const [planRetire, setPlanRetire] = useState(() => ({
    age: '30', retireAge: '65', lifeAge: '85', monthlySpend: '40000', pension: '20000', inflation: '2', postReturn: '3',
    ...(savedParams.planRetire || {}),
  }));
  // CAGR auto-fetch
  // 試算頁分兩頁：我的資產 / 目標規劃（只是畫面偏好，存本機即可）
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('wealth_view') || 'assets'; } catch { return 'assets'; } });
  const setView = (v) => { setViewState(v); try { localStorage.setItem('wealth_view', v); } catch { /* 無痕模式等 */ } };

  const [cagrSearch,   setCagrSearch]   = useState(savedParams.cagrSearch || '');
  const [cagrDropdown, setCagrDropdown] = useState([]);
  const [cagrStatus,   setCagrStatus]   = useState(savedParams.cagrStatus || '');
  const [cagrYears,    setCagrYears]    = useState(savedParams.cagrYears || '5');
  const [cagrLabel,    setCagrLabel]    = useState(savedParams.cagrLabel || '');   // display ticker near year select
  const selectedCagrSymbol = useRef(savedParams.selectedCagrSymbol || '');

  // Derived values
  const totalInvest = wealthHoldings.reduce((s, h) => s + h.shares * (h.lastPrice || 0), 0);
  const totalCash   = wealthBankAccounts.reduce((s, a) => s + (a.balance || 0), 0);
  const totalAssets = totalInvest + totalCash;
  const investPct   = totalAssets > 0 ? Math.round((totalInvest / totalAssets) * 100) : 0;

  // ── Save params ──
  const saveParams = useCallback((patch = {}) => {
    const params = { invRate, invMonthly, cashRate, cashMonthly, planGoals, planRetire, cagrSearch, cagrYears, cagrLabel, selectedCagrSymbol: selectedCagrSymbol.current, cagrStatus, ...patch };
    localStorage.setItem(WEALTH_PARAMS_KEY, JSON.stringify(params));
    setWealthParams(params);
  }, [invRate, invMonthly, cashRate, cashMonthly, planGoals, planRetire, cagrSearch, cagrYears, cagrLabel, cagrStatus, setWealthParams]);

  const allocation = useMemo(() => holdingAllocation(wealthHoldings), [wealthHoldings]);

  const num = v => parseFloat(v) || 0;
  const goalsNum = useMemo(() => planGoals.map(g => ({
    id: g.id, name: g.name, years: num(g.years), cash: num(g.cash), loan: num(g.loan), loanRate: num(g.loanRate), loanYears: num(g.loanYears),
  })), [planGoals]);
  const retireNum = useMemo(() => Object.fromEntries(Object.entries(planRetire).map(([k, v]) => [k, num(v)])), [planRetire]);

  // 存下來的錢照「目前定期定額 : 存款」的比例分配；兩者都 0 就各半
  const curInv = num(invMonthly), curCashM = num(cashMonthly);
  const invShare = curInv + curCashM > 0 ? curInv / (curInv + curCashM) : 0.5;

  const life = useMemo(() => {
    const p = {
      inv0: totalInvest, cash0: totalCash, invRate: num(invRate), cashRate: num(cashRate),
      invShare, goals: goalsNum, retire: retireNum,
    };
    const { budget, sim } = solveMonthlyBudget(p);
    if (budget == null) return { budget: null, sim };
    const b = Math.ceil(budget / 100) * 100;  // 進位到百元，照存一定夠
    // 依「付頭期 / 貸款還完 / 退休」切出各階段，列出每段要還多少、還能存多少
    const R = sim.horizon, age0 = retireNum.age;
    const cuts = new Set([0, R]);
    goalsNum.forEach(g => {
      const gm = Math.round(g.years * 12), lm = Math.round(g.loanYears * 12);
      if (gm < R) cuts.add(gm);
      if (g.loan > 0 && gm + lm < R) cuts.add(gm + lm);
    });
    const pts = [...cuts].sort((a, z) => a - z);
    const phases = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const pay = loanPayAt(pts[k] + 1, goalsNum);
      phases.push({ from: age0 + pts[k] / 12, to: age0 + pts[k + 1] / 12, pay, free: b - pay });
    }
    const series = sim.series;
    return {
      budget: b, sim, phases,
      labels: series.map(x => `${Math.round(age0 + x.month / 12)} 歲`),
      cashData: series.map(x => x.cash), investData: series.map(x => x.inv), totalData: series.map(x => x.inv + x.cash),
      current: curInv + curCashM,
    };
  }, [goalsNum, retireNum, invShare, totalInvest, totalCash, invRate, cashRate, invMonthly, cashMonthly]);

  const updateGoal = (id, patch) => {
    const next = planGoals.map(g => g.id === id ? { ...g, ...patch } : g);
    setPlanGoals(next); saveParams({ planGoals: next });
  };
  // 一次只展開一列（目標 id / 'retire' / 'assume'）
  const [openRow, setOpenRow] = useState(null);
  const toggleRow = key => setOpenRow(o => (o === key ? null : key));
  const addGoal = () => {
    const id = 'g-' + Date.now();
    const next = [...planGoals, { id, name: '新目標', years: '3', cash: '300000', loan: '0', loanRate: '2', loanYears: '0' }];
    setPlanGoals(next); saveParams({ planGoals: next });
    setOpenRow(id);
  };
  const removeGoal = async (id) => {
    const g = planGoals.find(x => x.id === id);
    if (!await confirmDialog({ title: '刪除目標', message: `確定要刪除「${g?.name || '此目標'}」嗎？`, confirmText: '刪除' })) return;
    const next = planGoals.filter(x => x.id !== id);
    setPlanGoals(next); saveParams({ planGoals: next });
  };
  const updateRetire = (patch) => {
    const next = { ...planRetire, ...patch };
    setPlanRetire(next); saveParams({ planRetire: next });
  };
  // ── Holdings actions ──
  const handleSaveHolding = (holding) => {
    const exists = wealthHoldings.some(h => h.id === holding.id);
    setWealthHoldings(exists
      ? wealthHoldings.map(h => h.id === holding.id ? holding : h)
      : [...wealthHoldings, holding]);
    setHoldingModal(null);
    showToast(`${holding.symbol} ${exists ? '已更新' : '已新增'}`);
  };

  const handleDeleteHolding = async (id) => {
    const h = wealthHoldings.find(x => x.id === id);
    if (!await confirmDialog({ title: '刪除持股', message: `確定要刪除「${h?.symbol || '此持股'}」嗎？`, confirmText: '刪除' })) return;
    setWealthHoldings(wealthHoldings.filter(h => h.id !== id));
    showToast('已刪除');
  };

  const handleRefreshPrice = async (id) => {
    const h = wealthHoldings.find(x => x.id === id);
    if (!h) return;
    setFetchingId(id);
    try {
      const price = await fetchStockPrice(h.symbol, true);
      if (price !== null) {
        setWealthHoldings(wealthHoldings.map(x => x.id === id ? { ...x, lastPrice: price, lastUpdated: new Date().toISOString() } : x));
        showToast(`${h.symbol} 更新至 NT$ ${formatAmount(price, 'asset')}`);
      } else {
        showToast(`${h.symbol} 無法取得股價`, 'error');
      }
    } catch { showToast('股價抓取失敗', 'error'); }
    finally { setFetchingId(null); }
  };

  const handleRefreshAll = useCallback(async (isAuto = false) => {
    const isManual = isAuto === false;
    const lastUpdate = parseInt(localStorage.getItem('last_wealth_price_update') || '0', 10);
    const now = Date.now();
    const COOLDOWN = 3 * 60 * 1000; // 3 minutes

    if (now - lastUpdate < COOLDOWN) {
      if (isManual) {
        const remaining = Math.ceil((COOLDOWN - (now - lastUpdate)) / 1000 / 60);
        showToast(`請稍候再更新 (冷卻中，剩餘約 ${remaining} 分鐘)`, 'error');
      }
      return;
    }
    
    if (!wealthHoldings.length) {
      if (isManual) showToast('尚未新增持股', 'error');
      return;
    }

    setIsRefreshing(true);
    if (isManual) showToast('更新中…');
    const updated = [...wealthHoldings];
    for (const h of updated) {
      try {
        const price = await fetchStockPrice(h.symbol, true);
        if (price !== null) {
          h.lastPrice = price;
          h.lastUpdated = new Date().toISOString();
        }
      } catch (err) {
        console.error(`Failed to refresh ${h.symbol}:`, err);
      }
    }
    setWealthHoldings(updated);
    localStorage.setItem('last_wealth_price_update', Date.now().toString());
    setIsRefreshing(false);
    showToast('股價已全部更新');
  }, [wealthHoldings, setWealthHoldings]);

  // Auto-refresh on mount
  useEffect(() => {
    handleRefreshAll(true);
  }, [handleRefreshAll]);

  // ── Bank actions ──
  const handleSaveBank = (acc) => {
    const exists = wealthBankAccounts.find(a => a.id === acc.id);
    if (exists) setWealthBankAccounts(wealthBankAccounts.map(a => a.id === acc.id ? acc : a));
    else setWealthBankAccounts([...wealthBankAccounts, acc]);
    setShowBankModal(false); setEditBankId(null);
    showToast(exists ? '帳戶已更新' : '帳戶已新增');
  };

  const handleDeleteBank = async (id) => {
    const a = wealthBankAccounts.find(x => x.id === id);
    if (!await confirmDialog({ title: '刪除帳戶', message: `確定要刪除「${a?.bankName || '此帳戶'}」嗎？`, confirmText: '刪除' })) return;
    setWealthBankAccounts(wealthBankAccounts.filter(a => a.id !== id));
    showToast('已刪除');
  };

  // ── CAGR autocomplete ──
  const handleCagrSearch = (q) => {
    // 一改字就作廢先前的選擇，避免標籤顯示 B、實際卻拿 A 算
    selectedCagrSymbol.current = '';
    setCagrSearch(q);
    setCagrLabel('');
    saveParams({ cagrSearch: q, cagrLabel: '', selectedCagrSymbol: '' });
    const lower = q.trim().toLowerCase();
    if (!lower) { setCagrDropdown([]); return; }
    const list = STOCK_LIST.filter(s => s.symbol.toLowerCase().startsWith(lower) || s.name.toLowerCase().includes(lower)).slice(0, 6);
    // 清單外的代號（如 VT、00713）也能直接線上查
    const raw = q.trim().toUpperCase();
    if (/^[A-Z0-9.^-]+$/.test(raw) && !list.some(s => s.symbol.toUpperCase() === raw)) {
      list.push({ symbol: raw, name: `線上查詢「${raw}」`, suffix: '', isDynamic: true });
    }
    setCagrDropdown(list);
  };

  // 有選過就用選的；沒選就拿輸入框第一段當代號（數字代號由 fetchCAGR 補 .TW/.TWO）
  const resolveCagrSymbol = () => selectedCagrSymbol.current || (cagrSearch.trim().split(/\s+/)[0] || '').toUpperCase();

  const selectCagrStock = (stock) => {
    const sym = stock.symbol + (stock.suffix || '');
    const newSearch = stock.isDynamic ? stock.symbol : `${stock.symbol} ${stock.name}`;
    selectedCagrSymbol.current = sym;
    setCagrSearch(newSearch);
    setCagrLabel(newSearch);
    setCagrDropdown([]);
    saveParams({ cagrSearch: newSearch, cagrLabel: newSearch, selectedCagrSymbol: sym });
    refreshCagrNow(sym);
  };

  const refreshCagrNow = async (sym, overrideYears) => {
    const yrs = parseInt(overrideYears ?? cagrYears) || 5;
    const loadingMsg = `正在計算 ${yrs}Y 年化報酬率…`;
    setCagrStatus(loadingMsg);
    saveParams({ cagrStatus: loadingMsg });
    const cagr = await fetchCAGR(sym, yrs);
    if (cagr !== null) {
      const pct = (cagr * 100).toFixed(2);
      const successMsg = `過去 ${yrs}Y 年化報酬率: ${pct}%`;
      setInvRate(pct);
      setCagrStatus(successMsg);
      saveParams({ invRate: pct, cagrStatus: successMsg });
    } else {
      const failMsg = '無法取得數據，請手動輸入';
      setCagrStatus(failMsg);
      saveParams({ cagrStatus: failMsg });
    }
  };

  return (
    <div className="tab-content">
      {/* Loading mask */}
      <div className={`loading-overlay${isRefreshing ? ' active' : ''}`}>
        <div className="spinner"></div>
        <div className="loading-text">正在更新持股價格…</div>
      </div>

      {/* 分頁切換：我的資產 / 目標規劃 */}
      <div className="wl-view-switch" role="tablist" aria-label="試算分頁">
        {[['assets', '我的資產', 'fa-wallet'], ['plan', '目標規劃', 'fa-flag-checkered']].map(([id, label, icon]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'is-active' : ''} onClick={() => setView(id)}>
            <i className={`fa-solid ${icon}`} aria-hidden="true"></i> {label}
          </button>
        ))}
      </div>

      {view === 'assets' && (
        <>
          {/* Total assets hero */}
          <section className="wl-hero" aria-label="資產總覽">
            <div className="wl-hero-label">當前資產總額</div>
            <div className="wl-hero-amount" id="wealthTotalAssetsDisplay">
              <span className="wl-hero-cur">NT$</span><AnimatedNumber value={totalAssets} format={v => formatAmount(v, 'asset')} effect="scroll" />
            </div>

            {totalAssets > 0 && (
              <div className="wl-bar" role="img" aria-label={`投資 ${investPct}%、現金 ${100 - investPct}%`}>
                <span className="is-invest" style={{ width: `${investPct}%` }} />
                <span className="is-cash" />
              </div>
            )}

            <div className="wl-hero-split">
              <div className="wl-hero-cell is-invest">
                <div className="wl-hero-cell-label"><i aria-hidden="true"></i>投資市值</div>
                <div className="wl-hero-cell-value" id="wealthTotalInvestSub">
                  NT$ <AnimatedNumber value={Math.round(totalInvest)} format={v => formatAmount(v, 'asset')} effect="scroll" />
                </div>
                {totalAssets > 0 && <div className="wl-hero-cell-pct" id="wealthTotalInvestPct">占比 {investPct}%</div>}
              </div>
              <div className="wl-hero-cell is-cash">
                <div className="wl-hero-cell-label"><i aria-hidden="true"></i>現金存款</div>
                <div className="wl-hero-cell-value" id="wealthTotalCashSub">
                  NT$ <AnimatedNumber value={Math.round(totalCash)} format={v => formatAmount(v, 'asset')} effect="scroll" />
                </div>
                {totalAssets > 0 && <div className="wl-hero-cell-pct" id="wealthTotalCashPct">占比 {100 - investPct}%</div>}
              </div>
            </div>
          </section>

          <div className="wealth-grid">
          {/* Holdings panel */}
          <div className="wealth-panel chart-section wl-panel">
            <div className="wl-panel-head">
              <div className="wl-panel-head-main">
                <h3 className="wl-panel-title"><i className="fa-solid fa-chart-line" aria-hidden="true"></i> 投資持股</h3>
                <div className="wl-panel-sub">
                  總市值 <strong id="holdingsTotalValue">NT$ <AnimatedNumber value={Math.round(totalInvest)} format={v => formatAmount(v, 'asset')} effect="scroll" /></strong>
                  {wealthHoldings.length > 0 && <span className="wl-count">{wealthHoldings.length} 檔</span>}
                </div>
              </div>
              <div className="wl-panel-actions">
                <button type="button" className="wl-icon-btn" onClick={() => handleRefreshAll()} title="全部更新股價" aria-label="全部更新股價">
                  <i className="fa-solid fa-rotate"></i>
                </button>
                <button type="button" className="wl-add-btn" onClick={() => setHoldingModal('new')}>
                  <i className="fa-solid fa-plus"></i> 新增
                </button>
              </div>
            </div>
            {allocation.length > 0 && (
              <div className="wl-alloc">
                <div className="wl-alloc-bar" role="img" aria-label={'持倉比重：' + allocation.map(h => `${h.name || h.symbol} ${h.pct.toFixed(1)}%`).join('、')}>
                  {allocation.map(h => (
                    <span key={h.id} style={{ flexGrow: h.pct, background: symbolColor(h.symbol) }} title={`${h.name || h.symbol} ${h.pct.toFixed(1)}%`} />
                  ))}
                </div>
                <ul className="wl-alloc-legend">
                  {allocation.map(h => (
                    <li key={h.id}>
                      <i style={{ background: symbolColor(h.symbol) }} aria-hidden="true"></i>
                      <span className="wl-alloc-name">{h.name || h.symbol}</span>
                      <span className="wl-alloc-pct">{h.pct.toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div id="holdingsList" className="wealth-scroll-list">
              {wealthHoldings.length === 0
                ? <div className="wealth-empty wl-empty"><i className="fa-solid fa-seedling" aria-hidden="true"></i><span>還沒有持股，按右上「新增」加入第一檔</span></div>
                : wealthHoldings.map(h => {
                    const value   = h.shares * (h.lastPrice || 0);
                    const timeStr = h.lastUpdated ? new Date(h.lastUpdated).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                    return (
                      <div key={h.id} className="wealth-row" data-id={h.id}>
                        <div className="wealth-row-left">
                          <span className="wealth-row-symbol" style={{ background: symbolColor(h.symbol), color: '#fff', fontWeight: 700, padding: '2px 8px', borderRadius: 6, fontSize: '0.8rem', letterSpacing: '0.04em', display: 'inline-block', flexShrink: 0 }}>{h.symbol}</span>
                          <span className="wealth-row-name">{h.name || ''}</span>
                        </div>
                        <div className="wealth-row-mid">
                          <span className="wealth-row-detail" style={{ color: 'var(--text-muted)' }}>{h.shares.toLocaleString()} 股</span>
                          <span className="wealth-row-price" style={{ color: 'var(--primary-color)' }}>
                            {h.lastPrice ? <>NT$ <AnimatedNumber value={h.lastPrice} format={v => formatAmount(v, 'asset')} effect="scroll" /></> : '—'}
                          </span>
                          {timeStr && <span className="wl-row-time">{timeStr}</span>}
                        </div>
                        <div className="wealth-row-value" style={{ color: 'var(--text-main)', fontWeight: 800 }}>{h.lastPrice ? <>NT$ <AnimatedNumber value={Math.round(value)} format={v => formatAmount(v, 'asset')} effect="scroll" /></> : '—'}</div>
                        <div className="wealth-row-actions">
                          <button type="button" className="icon-btn" title="更新股價" aria-label="更新股價" onClick={() => handleRefreshPrice(h.id)}>
                            <i className={`fa-solid fa-rotate${fetchingId === h.id ? ' fa-spin' : ''}`}></i>
                          </button>
                          <button type="button" className="icon-btn" title="編輯" aria-label="編輯" onClick={() => setHoldingModal(h)}>
                            <i className="fa-solid fa-pen"></i>
                          </button>
                          <button type="button" className="icon-btn delete" title="刪除" aria-label="刪除" onClick={() => handleDeleteHolding(h.id)}>
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    );
                  })
              }
            </div>
          </div>

          {/* Bank accounts panel */}
          <div className="wealth-panel chart-section wl-panel">
            <div className="wl-panel-head">
              <div className="wl-panel-head-main">
                <h3 className="wl-panel-title"><i className="fa-solid fa-building-columns" aria-hidden="true"></i> 銀行現金</h3>
                <div className="wl-panel-sub">
                  現金合計 <strong id="bankTotalValue">NT$ <AnimatedNumber value={Math.round(totalCash)} format={v => formatAmount(v, 'asset')} effect="scroll" /></strong>
                  {wealthBankAccounts.length > 0 && <span className="wl-count">{wealthBankAccounts.length} 個帳戶</span>}
                </div>
              </div>
              <div className="wl-panel-actions">
                <button type="button" className="wl-add-btn" onClick={() => { setEditBankId(null); setShowBankModal(true); }}>
                  <i className="fa-solid fa-plus"></i> 新增
                </button>
              </div>
            </div>
            <div id="bankAccountsList" className="wealth-scroll-list">
              {wealthBankAccounts.length === 0
                ? <div className="wealth-empty wl-empty"><i className="fa-solid fa-piggy-bank" aria-hidden="true"></i><span>還沒有帳戶，按右上「新增」加入第一個</span></div>
                : wealthBankAccounts.map(a => (
                    <div key={a.id} className="wealth-row">
                      <div className="wealth-row-left"><span className="wealth-row-symbol" style={{ fontSize: '0.9rem' }}>{a.bankName}</span></div>
                      <div className="wealth-row-mid"><span className="wealth-row-detail">利率 {a.rate || 0}%</span></div>
                      <div className="wealth-row-value">NT$ <AnimatedNumber value={Math.round(a.balance || 0)} format={v => formatAmount(v, 'asset')} effect="scroll" /></div>
                      <div className="wealth-row-actions">
                        <button type="button" className="icon-btn" title="編輯" aria-label="編輯" onClick={() => { setEditBankId(a.id); setShowBankModal(true); }}><i className="fa-solid fa-pen"></i></button>
                        <button type="button" className="icon-btn delete" title="刪除" aria-label="刪除" onClick={() => handleDeleteBank(a.id)}><i className="fa-solid fa-trash"></i></button>
                      </div>
                    </div>
                  ))
              }
            </div>
          </div>

          </div>
        </>
      )}

      {view === 'plan' && (
        <div className="wl-plan-layout">
          <div className="wl-plan-main">
            <section className="wealth-panel chart-section wl-panel">
              <div className="wl-panel-head">
                <div className="wl-panel-head-main">
                  <h3 className="wl-panel-title"><i className="fa-solid fa-flag-checkered" aria-hidden="true"></i> 人生目標</h3>
                  <div className="wl-panel-sub">點一下展開修改；之後的貸款也從每月挪出的錢裡付</div>
                </div>
              </div>
              <div className="wl-prows">
                {planGoals.map(g => {
                  const pay = loanPayment(num(g.loan), num(g.loanRate), num(g.loanYears));
                  const atAge = Math.round(num(planRetire.age) + num(g.years));
                  return (
                    <PlanRow key={g.id} id={g.id} title={g.name || '未命名'} open={openRow === g.id} onToggle={() => toggleRow(g.id)}
                      desc={`${atAge} 歲・頭期 ${wan(num(g.cash))}${num(g.loan) > 0 ? `・貸 ${wan(num(g.loan))}・月付 ${wan(pay)}` : ''}`}>
                      <div className="form-group">
                        <label className="form-label" htmlFor={`${g.id}-name`}>名稱</label>
                        <input className="form-input" id={`${g.id}-name`} value={g.name} onChange={e => updateGoal(g.id, { name: e.target.value })} />
                      </div>
                      <div className="wl-life-grid">
                        {[
                          ['cash', '頭期現金', '10000', 1], ['loan', '貸款金額', '10000', 1],
                          ['years', '幾年後', '0.5'], ['loanRate', '貸款利率 %', '0.1'], ['loanYears', '貸款年限', '1'],
                        ].map(([k, label, step, wide]) => (
                          <div className={`form-group${wide ? ' is-wide' : ''}`} key={k}>
                            <label className="form-label" htmlFor={`${g.id}-${k}`}>{label}</label>
                            <input className="form-input" id={`${g.id}-${k}`} type="number" inputMode="decimal" min="0" step={step} value={g[k]} onChange={e => updateGoal(g.id, { [k]: e.target.value })} />
                          </div>
                        ))}
                      </div>
                      <button type="button" className="wl-prow-delete" onClick={() => removeGoal(g.id)}>
                        <i className="fa-solid fa-trash" aria-hidden="true"></i> 刪除這個目標
                      </button>
                    </PlanRow>
                  );
                })}
                <button type="button" className="wl-life-add" onClick={addGoal}><i className="fa-solid fa-plus" aria-hidden="true"></i> 新增目標</button>
              </div>
            </section>

            <section className="wealth-panel chart-section wl-panel wl-calc">
              <div className="wl-panel-head">
                <div className="wl-panel-head-main">
                  <h3 className="wl-panel-title"><i className="fa-solid fa-sliders" aria-hidden="true"></i> 退休與假設</h3>
                </div>
              </div>
              <div className="wl-prows">
                <PlanRow id="retire" title="退休" open={openRow === 'retire'} onToggle={() => toggleRow('retire')}
                  desc={`${Math.round(num(planRetire.age))} → ${Math.round(num(planRetire.retireAge))} 歲退休，用到 ${Math.round(num(planRetire.lifeAge))} 歲・月花 ${wan(num(planRetire.monthlySpend))}（勞保勞退 ${wan(num(planRetire.pension))}）`}>
                  <p className="wl-prow-note">月花費、勞保勞退請用「今天的錢」填，會依通膨自動換算</p>
                  <div className="wl-life-grid">
                    {[
                      ['age', '現在年齡', '1'], ['retireAge', '退休年齡', '1'], ['lifeAge', '預計活到', '1'],
                      ['monthlySpend', '退休後月花費', '1000', 1], ['pension', '勞保勞退月領', '1000', 1],
                      ['inflation', '通膨 %', '0.1', 1], ['postReturn', '退休後報酬 %', '0.1', 1],
                    ].map(([k, label, step, wide]) => (
                      <div className={`form-group${wide ? ' is-wide' : ''}`} key={k}>
                        <label className="form-label" htmlFor={`retire-${k}`}>{label}</label>
                        <input className="form-input" id={`retire-${k}`} type="number" inputMode="decimal" min="0" step={step} value={planRetire[k]} onChange={e => updateRetire({ [k]: e.target.value })} />
                      </div>
                    ))}
                  </div>
                </PlanRow>
                <PlanRow id="assume" title="報酬假設" open={openRow === 'assume'} onToggle={() => toggleRow('assume')}
                  desc={`投資 ${num(invRate)}%・存款 ${num(cashRate)}%・目前每月存 ${wan(curInv + curCashM)}`}>
                  <p className="wl-prow-note">從現有資產 NT$ {formatAmount(Math.round(totalAssets), 'asset')} 起算；每月存的錢照目前定期定額與存款的比例分配</p>
                  <div className="wl-calc-groups">
                  {/* Investment */}
                  <fieldset className="wl-group is-invest">
                    <legend className="wl-group-head">
                      <span className="wl-group-title"><i aria-hidden="true"></i>投資部位</span>
                      <span className="wl-group-current" id="wealthInvestCurrentDisplay">現有 NT$ <AnimatedNumber value={Math.round(totalInvest)} format={v => formatAmount(v, 'asset')} /></span>
                    </legend>
                    <div className="wl-grid-2">
                      <div className="form-group">
                        <label className="form-label" htmlFor="wealthInvestMonthlyInput">目前每月定期定額</label>
                        <input className="form-input" id="wealthInvestMonthlyInput" type="number" inputMode="decimal" min="0" value={invMonthly} onChange={e => { setInvMonthly(e.target.value); saveParams({ invMonthly: e.target.value }); }} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="wealthInvestRateInput">年化報酬率（%）</label>
                        <input className="form-input" id="wealthInvestRateInput" type="number" inputMode="decimal" min="0" step="0.1" value={invRate} onChange={e => { setInvRate(e.target.value); saveParams({ invRate: e.target.value }); }} />
                      </div>
                      {/* CAGR auto-fetch */}
                      <div className="form-group wl-cagr-search" id="cagrSearchWrap">
                        <label className="form-label" htmlFor="wealthInvestTickerSearch">CAGR 代號</label>
                        <input className="form-input" id="wealthInvestTickerSearch" value={cagrSearch} onChange={e => handleCagrSearch(e.target.value)} placeholder="代號搜尋…" autoComplete="off"
                          onKeyDown={e => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            const sym = resolveCagrSymbol();
                            if (!sym) return;
                            selectedCagrSymbol.current = sym;
                            setCagrLabel(cagrSearch.trim()); setCagrDropdown([]);
                            saveParams({ cagrLabel: cagrSearch.trim(), selectedCagrSymbol: sym });
                            refreshCagrNow(sym);
                          }} />
                        {cagrDropdown.length > 0 && (
                          <div className="wl-dropdown">
                            {cagrDropdown.map((s, i) => (
                              <button type="button" key={i} className="wl-dropdown-item" onClick={() => selectCagrStock(s)}>
                                <strong>{s.symbol}</strong> <span>{s.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="wealthInvestRangeSelect">回看期間</label>
                        <select className="form-select" id="wealthInvestRangeSelect" value={cagrYears}
                          onChange={e => {
                            setCagrYears(e.target.value);
                            saveParams({ cagrYears: e.target.value });
                            const sym = resolveCagrSymbol();
                            if (sym) refreshCagrNow(sym, e.target.value);
                            else { setCagrStatus('先輸入代號，才會依回看期間計算'); }
                          }}>
                          <option value="3">3 年</option>
                          <option value="5">5 年</option>
                          <option value="10">10 年</option>
                        </select>
                      </div>
                    </div>
                    {(cagrLabel || cagrStatus) && (
                      <div className="wl-cagr-note">
                        {cagrLabel && <span className="wl-cagr-label">{cagrLabel}</span>}
                        {cagrStatus && <span id="wealthCAGRStatus">{cagrStatus}</span>}
                      </div>
                    )}
                  </fieldset>

                  {/* Cash */}
                  <fieldset className="wl-group is-cash">
                    <legend className="wl-group-head">
                      <span className="wl-group-title"><i aria-hidden="true"></i>現金 / 存款</span>
                      <span className="wl-group-current" id="wealthCashCurrentDisplay">現有 NT$ <AnimatedNumber value={Math.round(totalCash)} format={v => formatAmount(v, 'asset')} /></span>
                    </legend>
                    <div className="wl-grid-2">
                      <div className="form-group">
                        <label className="form-label" htmlFor="wealthCashMonthlyInput">目前每月存款</label>
                        <input className="form-input" id="wealthCashMonthlyInput" type="number" inputMode="decimal" min="0" value={cashMonthly} onChange={e => { setCashMonthly(e.target.value); saveParams({ cashMonthly: e.target.value }); }} />
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="wealthCashRateInput">年利率（%）</label>
                        <input className="form-input" id="wealthCashRateInput" type="number" inputMode="decimal" min="0" step="0.01" value={cashRate} onChange={e => { setCashRate(e.target.value); saveParams({ cashRate: e.target.value }); }} />
                      </div>
                    </div>
                  </fieldset>
                  </div>
                </PlanRow>
              </div>
            </section>
          </div>

            <div className="wl-goal-result is-plan wl-life-result wl-plan-side" aria-live="polite">
              <div className="wl-goal-result-label">每月要能挪出</div>
              {life.budget == null ? (
                <div className="wl-goal-result-main">目標太大，無法達成</div>
              ) : (
                <>
                  <div className="wl-goal-result-main">NT$ <AnimatedNumber value={life.budget} format={v => formatAmount(v, 'asset')} /></div>
                  <div className="wl-goal-summary">
                    <span>退休時要備 <strong>NT$ {formatAmount(Math.round(life.sim.need), 'asset')}</strong></span>
                    <span className="wl-goal-summary-sub">{Math.round(num(planRetire.retireAge))} 歲退休，用到 {Math.round(num(planRetire.lifeAge))} 歲</span>
                  </div>
                  <ol className="wl-life-phases">
                    {life.phases.map((ph, k) => (
                      <li key={k}>
                        <span className="wl-life-phase-age">{Math.round(ph.from)}–{Math.round(ph.to)} 歲</span>
                        <span className="wl-life-phase-desc">
                          {ph.pay > 0 && <>還貸 NT$ {formatAmount(Math.round(ph.pay), 'asset')}，</>}
                          {ph.free >= 0
                            ? <>存 <strong>NT$ {formatAmount(Math.round(ph.free), 'asset')}</strong></>
                            : <strong className="is-short">每月要從存款補 NT$ {formatAmount(Math.round(-ph.free), 'asset')}</strong>}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <div className="wl-plan-compare">
                    <span className={life.budget > life.current ? 'is-short' : 'is-ok'}>
                      {life.budget > life.current
                        ? `目前每月存 NT$ ${formatAmount(life.current, 'asset')}，還差 NT$ ${formatAmount(life.budget - life.current, 'asset')}`
                        : `目前每月存 NT$ ${formatAmount(life.current, 'asset')} 已足夠`}
                    </span>
                  </div>
                </>
              )}
            </div>


          {life.budget != null && life.labels.length > 1 && (
          <section className="wealth-panel chart-section wl-panel wl-plan-chart">
            <div className="wl-panel-head">
              <div className="wl-panel-head-main">
                <h3 className="wl-panel-title"><i className="fa-solid fa-chart-line" aria-hidden="true"></i> 資產走勢</h3>
                <div className="wl-panel-sub">照每月挪出的金額存到退休，虛線是退休那天要備的錢</div>
              </div>
            </div>
            <div className="wl-chart">
              <WealthChart labels={life.labels} cashData={life.cashData} investData={life.investData} totalData={life.totalData}
                targetFV={life.sim.need} targetLabel="退休所需" />
            </div>
          </section>
          )}
        </div>
      )}


      {/* Modals */}
      {holdingModal && <HoldingModal initial={holdingModal === 'new' ? null : holdingModal} onClose={() => setHoldingModal(null)} onSave={handleSaveHolding} />}
      {showBankModal && (
        <BankModal
          initial={editBankId ? wealthBankAccounts.find(a => a.id === editBankId) : null}
          onClose={() => { setShowBankModal(false); setEditBankId(null); }}
          onSave={handleSaveBank}
        />
      )}
    </div>
  );
}
