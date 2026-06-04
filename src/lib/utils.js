// ====== src/lib/utils.js ======
import { useAppStore } from '../store/appStore';

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

export function formatAmount(val, type) {
  const { isPrivacyMode } = useAppStore.getState();
  if (isPrivacyMode && (type === 'income' || type === 'asset')) return '****';
  if (val == null) return '0';
  return Number(val).toLocaleString();
}

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

export function showToast(message, type = 'success') {
  const existing = document.getElementById('_toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = '_toast';
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
    background: type === 'error' ? '#D46060' : 'var(--primary-color)',
    color: '#fff', padding: '10px 20px', borderRadius: '8px',
    zIndex: 9999, fontSize: '0.9rem', whiteSpace: 'nowrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)', opacity: 0, transition: 'opacity 0.2s',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = 1; });
  setTimeout(() => { toast.style.opacity = 0; setTimeout(() => toast.remove(), 200); }, 2500);
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

export async function fetchHistoricalRate(currency, dateStr) {
  if (currency === 'TWD') return 1;
  const today = new Date().toISOString().split('T')[0];
  const effectiveDate = dateStr > today ? today : dateStr;
  const cacheKey = `${currency}_${effectiveDate}`;
  if (_fxRateCache[cacheKey]) return _fxRateCache[cacheKey];

  const ttl = effectiveDate < today ? 8760 : 6;
  try {
    const data = await fetchWithCache(`https://api.frankfurter.app/${effectiveDate}?from=${currency}&to=TWD`, ttl);
    const rate = data?.rates?.TWD || 1;
    _fxRateCache[cacheKey] = rate;
    return rate;
  } catch { return 1; }
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
  const rate    = dateStr ? await fetchHistoricalRate(item.currency, dateStr) : 1;
  const base    = calculateExpenseForMonth({ ...item, amount: item.originalAmount || item.amount }, year, month);
  return base * rate;
}

// 僅桌機（有 hover + 精準指標）才自動聚焦；手機 autoFocus 會彈鍵盤、頂版面
export const autoFocusDesktop =
  (typeof window !== 'undefined' && window.matchMedia)
    ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
    : false;
