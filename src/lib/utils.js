// ====== src/lib/utils.js ======
import { useAppStore } from '../store/appStore';
import { fetchRateToTWD } from './fx';

// ─── 純工具函式 ──────────────────────────────────────────────────────────────

export function getCycleLabel(cycle) {
  const map = { monthly: '每月', quarterly: '每季', 'half-yearly': '每半年', yearly: '每年', fixed: '一次性', daily: '每日', weekly: '每週', bimonthly: '每兩個月' };
  return map[cycle] || cycle;
}

export function lifeMonthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${y} 年 ${parseInt(m)} 月`;
}

export function getLifeCat(cats, id) {
  return cats.find(c => c.id === id) || { name: '其他', color: '#8A8A8A' };
}

// 左上角「隱藏收入」只遮收入（2026-11-13 使用者定）：type 為 'income' 的才變 ****。
// 由收入推得出來的數字（還能花／結餘、收入走勢圖的座標軸）也標 'income'；支出、固定、專案、資產照常顯示。
export function formatAmount(val, type) {
  const { isPrivacyMode } = useAppStore.getState();
  if (isPrivacyMode && type === 'income') return '****';
  if (val == null) return '0';
  return Number(val).toLocaleString();
}

// 給 AnimatedNumber 的 format 用：非收入金額（隱私模式不遮）
export const fmtMoney = (v) => formatAmount(v, 'money');
// 給 AnimatedNumber 的 format 用：收入金額（隱私模式遮蔽）
export const fmtIncomeMoney = (v) => formatAmount(v, 'income');

export function toMonthlyAmount(item) {
  const base = Number(item.originalAmount || item.amount) || 0;
  const rate  = Number(item.exchangeRate) || 1;
  const twd   = base * rate;
  switch (item.cycle) {
    case 'daily':       return twd * (365 / 12);
    case 'weekly':      return twd * (52 / 12);
    case 'monthly':     return twd;
    case 'bimonthly':   return twd / 2;
    case 'quarterly':   return twd / 3;
    case 'half-yearly': return twd / 6;
    case 'yearly':      return twd / 12;
    case 'fixed':       return 0;
    default:            return twd;
  }
}

// 計算某月 (ym = "YYYY-MM") 應計入生活費結餘的固定支出總額。
// 僅納入：付款方式為「現金」、週期為每月、且該月落在項目有效期間內的項目。
// 信用卡項目會透過 Gmail 記帳自動匯入明細（已含在生活支出），故不在此重複計入。
export function getFixedLifeMonthly(items, ym) {
  if (!ym || !Array.isArray(items)) return 0;
  const [y, m] = ym.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd   = new Date(y, m, 0); // 該月最後一天
  return items.reduce((sum, item) => {
    if (item.paymentMethod !== 'cash' || item.cycle !== 'monthly') return sum;
    const start = item.startDate ? new Date(item.startDate) : null;
    if (start && start > monthEnd) return sum;            // 尚未開始
    const end = item.endDate ? new Date(item.endDate) : null;
    if (end && end < monthStart) return sum;              // 已結束
    return sum + toMonthlyAmount(item);
  }, 0);
}

export function getBillingDateForMonth(item, year, month) {
  if (!item.startDate) return null;
  const startDay = parseInt(item.startDate.split('-')[2], 10);
  const lastDay  = new Date(year, month, 0).getDate();
  const day      = Math.min(startDay, lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function calculateExpenseForMonth(item, year, month) {
  const ym    = `${year}-${String(month).padStart(2, '0')}`;
  const mStart = new Date(year, month - 1, 1);
  const mEnd   = new Date(year, month, 0);
  const start  = new Date(item.startDate);
  if (start > mEnd) return 0;
  if (item.endDate && new Date(item.endDate) < mStart) return 0;

  const base = Number(item.amount) || 0;
  const daysInMonth = mEnd.getDate();

  switch (item.cycle) {
    case 'monthly':     return base;
    case 'yearly':      return base / 12;
    case 'fixed':       return item.startDate?.startsWith(ym) ? base : 0;
    case 'quarterly':   return (month - 1) % 3 === 0 ? base : 0;
    case 'half-yearly': return (month - 1) % 6 === 0 ? base : 0;
    case 'daily':       return base * daysInMonth;
    case 'weekly':      return base * (daysInMonth / 7);
    case 'bimonthly':   return (month % 2 === 1) ? base : 0;
    default:            return base;
  }
}

// ─── Toast ──────────────────────────────────────────────────────────────────

export function showToast(message, type = 'success', opts = {}) {
  const existing = document.getElementById('_toast');
  if (existing) existing.remove();

  const { actionLabel, onAction, duration } = opts || {};
  const hasAction = !!actionLabel;
  const stayMs = Number(duration) > 0 ? Number(duration) : (hasAction ? 6000 : 2500);

  const toast = document.createElement('div');
  toast.id = '_toast';
  toast.className = `toast toast-${type}`;

  Object.assign(toast.style, {
    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    background: type === 'error' ? '#D46060' : 'var(--primary-color)',
    color: '#fff', padding: hasAction ? '10px 14px 10px 18px' : '10px 20px', borderRadius: '8px',
    zIndex: 9999, fontSize: '0.9rem',
    whiteSpace: hasAction ? 'normal' : 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', opacity: 0, transition: 'opacity 0.2s',
    ...(hasAction ? {
      right: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      maxWidth: 'calc(100vw - 32px)',
      width: 'max-content',
      lineHeight: '1.45',
    } : {}),
  });

  let timer;
  let removed = false;
  const close = () => {
    if (removed) return;
    removed = true;
    clearTimeout(timer);
    toast.style.opacity = 0;
    setTimeout(() => toast.remove(), 200);
  };

  if (hasAction) {
    const text = document.createElement('span');
    text.textContent = message;
    text.style.flex = '1 1 auto';
    text.style.minWidth = '0';
    text.style.overflowWrap = 'anywhere';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = actionLabel;
    Object.assign(btn.style, {
      flex: '0 0 auto',
      whiteSpace: 'nowrap',
      background: 'rgba(255,255,255,0.22)',
      color: '#fff',
      border: '1px solid rgba(255,255,255,0.35)',
      borderRadius: '6px',
      padding: '5px 12px',
      minHeight: '32px',
      fontFamily: 'inherit',
      fontSize: '0.85rem',
      fontWeight: '700',
      cursor: 'pointer',
      lineHeight: '1',
    });
    btn.addEventListener('click', () => {
      if (typeof onAction === 'function') onAction();
      close();
    });
    toast.append(text, btn);
  } else {
    toast.textContent = message;
  }

  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = 1; });
  timer = setTimeout(close, stayMs);
}

// 自製確認對話框（取代瀏覽器原生 confirm）。回傳 Promise<boolean>。
// 沿用 app 既有的 .modal-overlay / .modal 樣式，視覺與其他彈窗一致。
export function confirmDialog({
  title = '確認',
  message = '',
  confirmText = '確定',
  cancelText = '取消',
  danger = true,
} = {}) {
  return new Promise(resolve => {
    document.getElementById('_confirmOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = '_confirmOverlay';
    overlay.className = 'modal-overlay active';

    const modal = document.createElement('div');
    modal.className = 'modal confirm-modal';
    modal.style.maxWidth = '360px';

    const icon = document.createElement('div');
    icon.className = `confirm-modal-icon${danger ? ' danger' : ''}`;
    icon.innerHTML = `<i class="fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i>`;

    const h3 = document.createElement('h3');
    h3.className = 'confirm-modal-title';
    h3.textContent = title;

    const p = document.createElement('p');
    p.className = 'confirm-modal-message';
    p.textContent = message; // textContent 防注入；換行交給 CSS white-space

    const btnRow = document.createElement('div');
    btnRow.className = 'confirm-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn confirm-btn-cancel';
    cancelBtn.textContent = cancelText;

    const okBtn = document.createElement('button');
    okBtn.className = `btn confirm-btn-ok${danger ? ' danger' : ''}`;
    okBtn.textContent = confirmText;

    btnRow.append(okBtn, cancelBtn);
    modal.append(icon, h3, p, btnRow);
    overlay.append(modal);
    document.body.append(overlay);

    let done = false;
    const close = (result) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);

    requestAnimationFrame(() => okBtn.focus());
  });
}

// ─── FX Rate Helpers ─────────────────────────────────────────────────────────

const _fxRateCache = {};

export async function fetchWithCache(url, ttlHours = 6) {
  const cacheKey = `fx_cache_${url}`;
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.ts < ttlHours * 3600 * 1000) return cached.data;
  } catch {}

  if (!_fxRateCache._pending) _fxRateCache._pending = {};
  if (_fxRateCache._pending[url]) return _fxRateCache._pending[url];

  const promise = fetch(url).then(r => r.json()).then(data => {
    try { localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data })); } catch {}
    delete _fxRateCache._pending[url];
    return data;
  }).catch(e => { delete _fxRateCache._pending[url]; throw e; });

  _fxRateCache._pending[url] = promise;
  return promise;
}

// frankfurter 沒有 TWD（抓了只會 404 → 默默當 1:1），改用 fx.js 的來源；抓不到退回項目存的匯率
export async function fetchHistoricalRate(currency, dateStr) {
  if (currency === 'TWD') return 1;
  return fetchRateToTWD(currency, dateStr);
}

export async function prefetchFXRates(items, yearMonthPairs) {
  const foreignItems = (items || []).filter(i => i.currency && i.currency !== 'TWD');
  if (!foreignItems.length) return;

  const fetches = [];
  for (const item of foreignItems) {
    for (const [year, month] of yearMonthPairs) {
      const dateStr = getBillingDateForMonth(item, year, month);
      if (dateStr) fetches.push(fetchHistoricalRate(item.currency, dateStr).catch(() => 1));
    }
  }
  await Promise.all(fetches);
}

export async function getItemAmountForMonth(item, year, month) {
  if (!item.currency || item.currency === 'TWD') {
    return calculateExpenseForMonth(item, year, month);
  }
  const dateStr = getBillingDateForMonth(item, year, month);
  const rate    = (dateStr && await fetchHistoricalRate(item.currency, dateStr)) || Number(item.exchangeRate) || 1;
  const base    = calculateExpenseForMonth({ ...item, amount: item.originalAmount || item.amount }, year, month);
  return base * rate;
}

// 僅桌機（有 hover + 精準指標）才自動聚焦；手機 autoFocus 會彈鍵盤、頂版面
export const autoFocusDesktop =
  (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
    : false;
