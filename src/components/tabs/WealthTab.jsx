import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Chart, registerables } from 'chart.js';
import { useAppStore } from '../../store/appStore';
import { fetchWithCache, formatAmount, showToast, autoFocusDesktop } from '../../lib/utils';
import { buildProxyUrl, unwrapAllOrigins, twSymbolCandidates } from '../../lib/yahooProxy';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { WEALTH_PARAMS_KEY } from '../../lib/constants';

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
  { symbol: '6488', name: '環球晶', suffix: '.TWO' },
  { symbol: '2886', name: '兆豐金', suffix: '.TW' },
  { symbol: '2884', name: '玉山金', suffix: '.TW' },
  { symbol: '2882', name: '國泰金', suffix: '.TW' },
  { symbol: '2891', name: '中信金', suffix: '.TW' },
  { symbol: '2892', name: '第一金', suffix: '.TW' },
  { symbol: '2880', name: '華南金', suffix: '.TW' },
  { symbol: '2881', name: '富邦金', suffix: '.TW' },
  { symbol: '0050',   name: '元大台灣50',       suffix: '.TW' },
  { symbol: '0056',   name: '元大高股息',        suffix: '.TW' },
  { symbol: '006208', name: '富邦台50',          suffix: '.TW' },
  { symbol: '00662',  name: '富邦NASDAQ',        suffix: '.TW' },
  { symbol: '00631L', name: '元大台灣50正2',      suffix: '.TW' },
  { symbol: '00646',  name: '元大S&P500',        suffix: '.TW' },
  { symbol: '00878',  name: '國泰永續高股息',      suffix: '.TW' },
  { symbol: '00919',  name: '群益台灣精選高息',    suffix: '.TW' },
  { symbol: '00929',  name: '復華台灣科技優息',    suffix: '.TW' },
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

async function fetchCAGR(symbol, years) {
  const range     = years + 'y';
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=${range}`;
  try {
    const data   = unwrapAllOrigins(await fetchWithCache(buildProxyUrl(targetUrl), 24));
    const prices = (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(p => p != null);
    if (prices.length < 2) return null;
    return Math.pow(prices[prices.length - 1] / prices[0], 1 / years) - 1;
  } catch { return null; }
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
    setDropdown(STOCK_LIST.filter(s => s.symbol.toLowerCase().startsWith(lower) || s.name.toLowerCase().includes(lower)).slice(0, 8));
  };

  const selectStock = async (stock) => {
    const fullSymbol = stock.symbol + (stock.suffix || '');
    setSymbol(fullSymbol); setName(stock.name);
    setSearch(`${stock.symbol} ${stock.name}`); setDropdown([]);
    setLoading(true); setPrice(null);
    const p = await fetchStockPrice(fullSymbol);
    setPrice(p); setLoading(false);
  };

  const handleEnter = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = search.trim().toUpperCase();
    if (raw) { setSymbol(raw); setDropdown([]); setLoading(true); setPrice(null); const p = await fetchStockPrice(raw); setPrice(p); setLoading(false); }
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
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
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
          <button className="icon-btn" onClick={onClose}><i className="fa-solid fa-xmark"></i></button>
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

// ── Wealth Chart ──────────────────────────────────────────────────────────────
function WealthChart({ labels, cashData, investData, totalData, targetFV }) {
  const chartRef  = useRef(null);
  const chartInst = useRef(null);

  useEffect(() => {
    if (!chartRef.current || !labels?.length) { chartInst.current?.destroy(); return; }
    const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
    const tc       = isDark ? '#F0EDE8' : '#1A1A1A';
    const gc       = isDark ? '#2D2B28' : '#E8E5E0';
    const targetArr = new Array(labels.length).fill(targetFV);
    chartInst.current?.destroy();
    chartInst.current = new Chart(chartRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: '現金/活存累積', data: cashData,   borderColor: '#10b981', backgroundColor: '#10b98133', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
          { label: '投資部位累積', data: investData, borderColor: '#3b82f6', backgroundColor: '#3b82f633', borderWidth: 2, pointRadius: 2, tension: 0.3, fill: true },
          { label: '總資產',       data: totalData,  borderColor: '#8b5cf6', backgroundColor: '#8b5cf633', borderWidth: 3, pointRadius: 3, tension: 0.3, fill: false },
          { label: '目標金額',     data: targetArr,  borderColor: '#f59e0b', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false },
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
          y: { ticks: { color: tc, callback: v => 'NT$ ' + (v / 10000).toLocaleString() + '萬' }, grid: { color: gc } },
          x: { ticks: { color: tc }, grid: { display: false } },
        },
      },
    });
  }, [labels, cashData, investData, totalData, targetFV]);

  useEffect(() => () => chartInst.current?.destroy(), []);

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
  const [target,     setTarget]     = useState(savedParams.target     || '10000000');

  // CAGR auto-fetch
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

  // ── Save params ──
  const saveParams = useCallback((patch = {}) => {
    const params = { invRate, invMonthly, cashRate, cashMonthly, target, cagrSearch, cagrYears, cagrLabel, selectedCagrSymbol: selectedCagrSymbol.current, cagrStatus, ...patch };
    localStorage.setItem(WEALTH_PARAMS_KEY, JSON.stringify(params));
    setWealthParams(params);
  }, [invRate, invMonthly, cashRate, cashMonthly, target, cagrSearch, cagrYears, cagrLabel, cagrStatus, setWealthParams]);

  // ── Calc simulation ──
  const simulation = useMemo(() => {
    const inv      = parseFloat(invRate)    / 100 / 12;
    const invM     = parseFloat(invMonthly) || 0;
    const cash     = parseFloat(cashRate)   / 100 / 12;
    const cashM    = parseFloat(cashMonthly)|| 0;
    const tgt      = parseFloat(target)     || 0;

    if (tgt <= 0) return { result: '請輸入有效的目標金額', labels: [], cashData: [], investData: [], totalData: [] };
    if (totalAssets >= tgt) return { result: '您已經達標了！🎉', summary: '當前總資產已達到目標', labels: ['第 0 年'], cashData: [totalCash], investData: [totalInvest], totalData: [totalAssets] };
    if (invM <= 0 && cashM <= 0 && inv <= 0 && cash <= 0) return { result: '無法達標', summary: '無月投入且無報酬增長', labels: [], cashData: [], investData: [], totalData: [] };

    let curInv = totalInvest, curCash = totalCash, total = totalAssets, months = 0;
    const MAX = 1200;
    const labels = ['第 0 年'], cashData = [curCash], investData = [curInv], totalData = [totalAssets];

    while (total < tgt && months < MAX) {
      months++;
      curInv  = curInv  * (1 + inv)  + invM;
      curCash = curCash * (1 + cash) + cashM;
      total   = curInv + curCash;
      if (months % 12 === 0 || total >= tgt) {
        const yr  = Math.ceil(months / 12);
        const rem = months % 12;
        labels.push(`第 ${yr} 年${rem ? ` (${rem}月)` : ''}`);
        cashData.push(curCash); investData.push(curInv); totalData.push(total);
      }
    }

    if (months >= MAX) return { result: '超過 100 年才能達標', labels, cashData, investData, totalData, curInv, curCash };
    const y = Math.floor(months / 12), m = months % 12;
    const timeStr = (y > 0 ? y + ' 年 ' : '') + (m > 0 ? m + ' 個月' : y === 0 ? '不到 1 個月' : '');
    return { result: `約需 ${timeStr}`, labels, cashData, investData, totalData, curInv, curCash };
  }, [invRate, invMonthly, cashRate, cashMonthly, target, totalInvest, totalCash, totalAssets]);

  // ── Holdings actions ──
  const handleSaveHolding = (holding) => {
    const exists = wealthHoldings.some(h => h.id === holding.id);
    setWealthHoldings(exists
      ? wealthHoldings.map(h => h.id === holding.id ? holding : h)
      : [...wealthHoldings, holding]);
    setHoldingModal(null);
    showToast(`${holding.symbol} ${exists ? '已更新' : '已新增'}`);
  };

  const handleDeleteHolding = (id) => {
    if (!confirm('確定刪除此持股？')) return;
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

  const handleDeleteBank = (id) => {
    if (!confirm('確定刪除此帳戶？')) return;
    setWealthBankAccounts(wealthBankAccounts.filter(a => a.id !== id));
    showToast('已刪除');
  };

  // ── CAGR autocomplete ──
  const handleCagrSearch = (q) => {
    setCagrSearch(q);
    saveParams({ cagrSearch: q });
    if (!q) {
      setCagrLabel('');
      selectedCagrSymbol.current = '';
      saveParams({ cagrSearch: '', cagrLabel: '', selectedCagrSymbol: '' });
    }
    const lower = q.toLowerCase();
    setCagrDropdown(lower ? STOCK_LIST.filter(s => s.symbol.toLowerCase().startsWith(lower) || s.name.toLowerCase().includes(lower)).slice(0, 6) : []);
  };

  const selectCagrStock = (stock) => {
    const sym = stock.symbol + (stock.suffix || '');
    const newSearch = `${stock.symbol} ${stock.name}`;
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

      {/* Total assets card */}
      <div className="wealth-total-card chart-section" style={{ display: 'block', padding: '28px 32px', background: 'linear-gradient(135deg, var(--card-bg) 60%, rgba(193,123,46,0.06) 100%)', marginBottom: 12 }}>
        {/* Label + amount */}
        <div className="wealth-total-label" style={{ marginBottom: 6 }}>
          <i className="fa-solid fa-vault"></i> 當前資產總額
        </div>
        <div className="wealth-total-amount" id="wealthTotalAssetsDisplay" style={{ marginBottom: 20 }}>
          NT$ <AnimatedNumber value={totalAssets} format={v => formatAmount(v, 'asset')} effect="scroll" />
        </div>

        {/* Ratio bar */}
        {totalAssets > 0 && (
          <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', marginBottom: 16, background: 'var(--border-color)' }}>
            <div style={{ width: `${Math.round((totalInvest / totalAssets) * 100)}%`, background: '#3b82f6', transition: 'width 0.5s ease' }} />
            <div style={{ flex: 1, background: '#10b981' }} />
          </div>
        )}

        {/* Sub stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.07)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-chart-line" style={{ color: '#3b82f6' }}></i> 投資市值
            </div>
            <div id="wealthTotalInvestSub" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 700, color: '#3b82f6' }}>
              NT$ <AnimatedNumber value={Math.round(totalInvest)} format={v => formatAmount(v, 'asset')} effect="scroll" />
            </div>
            {totalAssets > 0 && (
              <div id="wealthTotalInvestPct" style={{ fontSize: '0.72rem', color: '#3b82f6', opacity: 0.75, marginTop: 3 }}>
                占比 {Math.round((totalInvest / totalAssets) * 100)}%
              </div>
            )}
          </div>
          <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.07)', borderRadius: 10 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-building-columns" style={{ color: '#10b981' }}></i> 現金存款
            </div>
            <div id="wealthTotalCashSub" style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>
              NT$ <AnimatedNumber value={Math.round(totalCash)} format={v => formatAmount(v, 'asset')} effect="scroll" />
            </div>
            {totalAssets > 0 && (
              <div id="wealthTotalCashPct" style={{ fontSize: '0.72rem', color: '#10b981', opacity: 0.75, marginTop: 3 }}>
                占比 {Math.round((totalCash / totalAssets) * 100)}%
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Wealth grid (2×2) */}
      <div className="wealth-grid">

      {/* Holdings panel */}
      <div className="wealth-panel chart-section">
        <div className="wealth-panel-header">
          <div>
            <h3 className="wealth-panel-title"><i className="fa-solid fa-chart-line"></i> 投資持股</h3>
            <div className="wealth-panel-total">總市值：<strong id="holdingsTotalValue">NT$ <AnimatedNumber value={Math.round(totalInvest)} format={v => formatAmount(v, 'asset')} effect="scroll" /></strong></div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => handleRefreshAll()} title="全部更新股價">
              <i className="fa-solid fa-rotate"></i> 更新價格
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setHoldingModal('new')}>
              <i className="fa-solid fa-plus"></i> 新增
            </button>
          </div>
        </div>
        <div id="holdingsList">
          {wealthHoldings.length === 0
            ? <div className="wealth-empty" style={{ padding: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>尚未新增持股，點擊「＋ 新增」開始</div>
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
                      {timeStr && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1 }}>{timeStr}</span>}
                    </div>
                    <div className="wealth-row-value" style={{ color: 'var(--text-main)', fontWeight: 800 }}>{h.lastPrice ? <>NT$ <AnimatedNumber value={Math.round(value)} format={v => formatAmount(v, 'asset')} effect="scroll" /></> : '—'}</div>
                    <div className="wealth-row-actions">
                      <button className="icon-btn" title="更新股價" onClick={() => handleRefreshPrice(h.id)}>
                        <i className={`fa-solid fa-rotate${fetchingId === h.id ? ' fa-spin' : ''}`}></i>
                      </button>
                      <button className="icon-btn" title="編輯" onClick={() => setHoldingModal(h)}>
                        <i className="fa-solid fa-pen"></i>
                      </button>
                      <button className="icon-btn delete" title="刪除" onClick={() => handleDeleteHolding(h.id)}>
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
      <div className="wealth-panel chart-section">
        <div className="wealth-panel-header">
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className="wealth-panel-title" style={{ margin: 0 }}><i className="fa-solid fa-building-columns"></i> 銀行現金</h3>
              <button className="btn btn-primary btn-sm" style={{ flex: 'none' }} onClick={() => { setEditBankId(null); setShowBankModal(true); }}>
                <i className="fa-solid fa-plus"></i> 新增
              </button>
            </div>
            <div className="wealth-panel-total" style={{ marginTop: 4 }}>現金合計：<strong id="bankTotalValue">NT$ <AnimatedNumber value={Math.round(totalCash)} format={v => formatAmount(v, 'asset')} effect="scroll" /></strong></div>
          </div>
        </div>
        <div id="bankAccountsList">
          {wealthBankAccounts.length === 0
            ? <div className="wealth-empty" style={{ padding: 16, color: 'var(--text-muted)', fontSize: '0.85rem' }}>尚未新增帳戶，點擊「＋ 新增」開始</div>
            : wealthBankAccounts.map(a => (
                <div key={a.id} className="wealth-row">
                  <div className="wealth-row-left"><span className="wealth-row-symbol" style={{ fontSize: '0.9rem' }}>{a.bankName}</span></div>
                  <div className="wealth-row-mid"><span className="wealth-row-detail">利率 {a.rate || 0}%</span></div>
                  <div className="wealth-row-value">NT$ <AnimatedNumber value={Math.round(a.balance || 0)} format={v => formatAmount(v, 'asset')} effect="scroll" /></div>
                  <div className="wealth-row-actions">
                    <button className="icon-btn" title="編輯" onClick={() => { setEditBankId(a.id); setShowBankModal(true); }}><i className="fa-solid fa-pen"></i></button>
                    <button className="icon-btn delete" title="刪除" onClick={() => handleDeleteBank(a.id)}><i className="fa-solid fa-trash"></i></button>
                  </div>
                </div>
              ))
          }
        </div>
      </div>

      {/* Calculator — full width */}
      <div className="wealth-panel chart-section" style={{ gridColumn: '1/-1' }}>
        <div className="wealth-panel-header"><span style={{ fontWeight: 600 }}>資產試算</span></div>

        <div className="wealth-form-grid">
          {/* Investment */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#3b82f6', marginBottom: 8 }}>投資部位</div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>現有資產</label>
              <div className="form-input" id="wealthInvestCurrentDisplay" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>NT$ <AnimatedNumber value={Math.round(totalInvest)} format={v => formatAmount(v, 'asset')} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>每月投入（NT$）</label>
              <input className="form-input" id="wealthInvestMonthlyInput" type="number" inputMode="decimal" min="0" value={invMonthly} onChange={e => { setInvMonthly(e.target.value); saveParams({ invMonthly: e.target.value }); }} />
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>預期年化報酬率（%）</label>
              <input className="form-input" id="wealthInvestRateInput" type="number" inputMode="decimal" min="0" step="0.1" value={invRate} onChange={e => { setInvRate(e.target.value); saveParams({ invRate: e.target.value }); }} />
            </div>
            {/* CAGR auto-fetch */}
            <div className="form-group" style={{ marginBottom: 4, position: 'relative' }} id="cagrSearchWrap">
              <label className="form-label" style={{ fontSize: '0.75rem' }}>CAGR 自動抓取</label>
              <div style={{ display: 'flex', width: '100%', gap: 8, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '3 1 0%', minWidth: 0 }}>
                  <input className="form-input" id="wealthInvestTickerSearch" value={cagrSearch} onChange={e => handleCagrSearch(e.target.value)} placeholder="代號搜尋…" style={{ width: '100%', fontSize: '16px' }} />
                  {cagrDropdown.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: 6, zIndex: 100 }}>
                      {cagrDropdown.map((s, i) => (
                        <div key={i} style={{ padding: '6px 10px', cursor: 'pointer' }} onClick={() => selectCagrStock(s)}>
                          <strong>{s.symbol}</strong> {s.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ flex: '1 1 0%', minWidth: 0 }}>
                  <select className="form-select" id="wealthInvestRangeSelect" style={{ width: '100%', paddingLeft: 8, paddingRight: 24 }} value={cagrYears}
                  onChange={e => {
                    setCagrYears(e.target.value);
                    saveParams({ cagrYears: e.target.value });
                    if (selectedCagrSymbol.current) refreshCagrNow(selectedCagrSymbol.current, e.target.value);
                  }}>
                  <option value="3">3 年</option>
                  <option value="5">5 年</option>
                  <option value="10">10 年</option>
                </select>
                </div>
              </div>
              {cagrLabel && (
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary-color)', marginTop: 4 }}>
                  {cagrLabel}
                </div>
              )}
              {cagrStatus && <div id="wealthCAGRStatus" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>{cagrStatus}</div>}
            </div>
          </div>

          {/* Cash */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#10b981', marginBottom: 8 }}>現金 / 存款</div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>現有資產</label>
              <div className="form-input" id="wealthCashCurrentDisplay" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>NT$ <AnimatedNumber value={Math.round(totalCash)} format={v => formatAmount(v, 'asset')} /></div>
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>每月存入（NT$）</label>
              <input className="form-input" id="wealthCashMonthlyInput" type="number" inputMode="decimal" min="0" value={cashMonthly} onChange={e => { setCashMonthly(e.target.value); saveParams({ cashMonthly: e.target.value }); }} />
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label" style={{ fontSize: '0.75rem' }}>年利率（%）</label>
              <input className="form-input" id="wealthCashRateInput" type="number" inputMode="decimal" min="0" step="0.01" value={cashRate} onChange={e => { setCashRate(e.target.value); saveParams({ cashRate: e.target.value }); }} />
            </div>
          </div>
        </div>

        {/* Target */}
        <div className="form-group" style={{ marginTop: 8 }}>
          <label className="form-label">目標資產（NT$）</label>
          <input className="form-input" id="wealthTargetInput" type="number" inputMode="decimal" min="0" value={target} onChange={e => { setTarget(e.target.value); saveParams({ target: e.target.value }); }} />
        </div>

        {/* Result */}
        <div className="wealth-result-card" style={{ marginTop: 12, padding: 16, background: 'var(--bg-secondary)', borderRadius: 10 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary-color)' }} id="wealthResultText">{simulation.result}</div>
          {simulation.curInv != null && (
            <div id="wealthSummaryText" style={{ marginTop: 8, fontSize: '0.85rem' }}>
              <div>總結累積：<strong>NT$ <AnimatedNumber value={Math.round((simulation.curInv || 0) + (simulation.curCash || 0))} format={v => formatAmount(v, 'asset')} /></strong></div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                現金：NT$ <AnimatedNumber value={Math.round(simulation.curCash || 0)} format={v => formatAmount(v, 'asset')} /> ｜ 投資：NT$ <AnimatedNumber value={Math.round(simulation.curInv || 0)} format={v => formatAmount(v, 'asset')} />
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        {simulation.labels?.length > 0 && (
          <div style={{ height: 260, position: 'relative', marginTop: 16 }} id="wealthChart">
            <WealthChart
              labels={simulation.labels}
              cashData={simulation.cashData}
              investData={simulation.investData}
              totalData={simulation.totalData}
              targetFV={parseFloat(target) || 0}
            />
          </div>
        )}
      </div>

      </div>{/* end wealth-grid */}

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
