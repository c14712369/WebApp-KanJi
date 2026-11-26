import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls, useReducedMotion } from 'framer-motion';
import IconRenderer from '../../lib/IconRenderer';
import { OPS, pressKey, evaluateExpr, hasOperator, formatExpr, exprFromAmount } from '../../lib/calcPad';
import { NO_TRIP, entryTripId, tripForDate, sheetTripDefault, tripIdToSave, sortTrips, formatTripRange } from '../../lib/trips';
import { isShared, sharePatch } from '../../lib/share';
import { bulkShareTargets } from '../../lib/shareBulk';
import { showToast } from '../../lib/utils';
import { useAppStore } from '../../store/appStore';
import { useTripContext } from '../../hooks/useTripContext';
import { useTripActions } from '../../hooks/useTripActions';
import { confirmsTwdOnEdit } from '../../lib/tripFx';
import { CURRENCIES, currencyMeta, formatRate, toTWD, fetchRateToTWD, entryAmountFields } from '../../lib/fx';

/**
 * 記一筆／編輯：底部抽屜（參考 MOZE）。
 * 由上而下：支出｜收入切換 → 幣別＋大號金額（含算式、外幣換算）→ 分類圖示格 → 日期／付款／備註膠囊 → 常駐數字鍵盤＋C／儲存。
 * 外幣：金額存換算後的台幣（統計、預算照舊），另存 currency／originalAmount／fxRate；匯率依記帳日期自動抓，可手動改。
 * 旅程：金額左上角的小標籤；新增時日期落在哪趟就自動選它並帶入該趟幣別，也可改成別趟或「不屬於旅程」。
 * 存檔資料格式與舊視窗相同；記住上次的分類與付款方式；編輯時可改類型、可刪除。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
// 手機撥號式排列（1 2 3 在最上排），運算子在右側一欄
const KEYS = ['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', '.', '0', '⌫', '+'];
const KEY_LABEL = { '÷': '除', '×': '乘', '−': '減', '+': '加', '.': '小數點', '⌫': '刪除一位，長按清除' };
const KEYBOARD_MAP = { '+': '+', '-': '−', '*': '×', 'x': '×', 'X': '×', '/': '÷', '.': '.', 'Backspace': '⌫', 'Delete': 'C', 'c': 'C', 'C': 'C' };
const LAST_ENTRY_KEY = 'LAST_EXPENSE_ENTRY';
const TRIP_RECENT_DAYS = 60; // 結束超過 60 天的旅程不再出現在選單（日期落在裡面或已選的除外）

// 切換支出／收入時分類圖示依序淡入放大（打開抽屜時不播，避免和抽屜滑上來搶戲）
const catGridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.025 } },
};
const catItemVariants = {
  hidden: { opacity: 0, scale: 0.6, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 520, damping: 30 } },
};

const pad2 = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const buzz = (ms = 8) => { if (navigator.vibrate) navigator.vibrate(ms); };
const stripParen = (name = '') => name.replace(/\s*[（(].*?[)）]\s*/g, '').trim();

// 預設日期：看本月 → 今天；看別的月份 → 同一天但不超過該月天數（避免 2/31 這種不存在的日期）
function defaultDate(currentMonth) {
  const now = new Date();
  const [y, m] = String(currentMonth || '').split('-').map(Number);
  if (!y || !m) return toIso(now);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${pad2(m)}-${pad2(Math.min(now.getDate(), lastDay))}`;
}

function dateLabel(iso) {
  if (!iso) return '選擇日期';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (iso === toIso(now)) return '今天';
  if (iso === toIso(yesterday)) return '昨天';
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
}

function readLastEntry() {
  try { return JSON.parse(localStorage.getItem(LAST_ENTRY_KEY)) || {}; } catch { return {}; }
}

const hasMyShareVal = (entry) => {
  const ms = entry?.myShare;
  return ms !== undefined && ms !== null && ms !== ''
    && Number.isFinite(Number(ms)) && Number(ms) >= 0;
};

const initialShareMode = (entry) => {
  if (!entry || entry.type === 'income') return 'none';
  if (hasMyShareVal(entry)) return 'fixed';
  if (Number(entry.splitN) >= 2) return 'split';
  return 'none';
};

const tripDefaultSplitN = (trips, sel) => {
  const t = trips.find(x => x.id === sel);
  const gs = Math.round(Number(t?.groupSize) || 1);
  return gs > 1 ? gs : 2;
};

const sanitizeDecimal = (raw) => {
  const s = String(raw || '').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  return dot === -1 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
};

export default function EntrySheet({
  lifeCategories = [],
  lifeIncomeCategories = [],
  paymentMethods = [],
  trips = [],
  currentMonth,
  initial,
  onClose,
  onSave,
  onDelete,
}) {
  const isEdit = !!(initial?.id && initial?.type);
  const tripCtx = useTripContext();
  const { offerExclusion } = useTripActions();
  const initType = initial?.type || 'expense';
  const lastSaved = useMemo(() => (isEdit ? {} : readLastEntry()), [isEdit]);

  const [type, setType] = useState(initType);
  const [catId, setCatId] = useState(
    (initType !== 'income' && initial?.categoryId) || lastSaved.catId || lifeCategories[0]?.id || ''
  );
  const [incCatId, setIncCatId] = useState(
    (initType === 'income' && initial?.categoryId) || lastSaved.incCatId || lifeIncomeCategories[0]?.id || ''
  );
  const [date, setDate] = useState(() => initial?.date || defaultDate(currentMonth));
  // 旅程選項：旅程 id 或 'none'；新增時跟著日期自動換，使用者自己選過就不再自動
  const [tripSel, setTripSel] = useState(() => sheetTripDefault(trips, date, isEdit ? initial : (initial || null), tripCtx));
  // 帶著旅程打開（編輯有 tripId 的、或從旅程按「記一筆」）→ 改日期不自動換旅程
  const autoTripRef = useRef(!initial?.tripId);
  const curTouchedRef = useRef(isEdit); // 使用者自己選過幣別（或編輯舊筆）→ 換旅程不改幣別
  const [note, setNote] = useState(initial?.note || '');
  const [pmId, setPmId] = useState(initial?.paymentMethod || lastSaved.pmId || paymentMethods[0]?.id || 'cash');
  const initForeign = !!(initial?.currency && initial.currency !== 'TWD');
  const [expr, setExpr] = useState(exprFromAmount(initForeign ? initial.originalAmount : initial?.amount));
  const [noteEditing, setNoteEditing] = useState(false);
  // 幣別：編輯沿用該筆；新增時 24 小時內用過外幣就沿用（旅途中連記）
  // 幣別：編輯照該筆；新增時日期落在旅程裡 → 該趟幣別，否則台幣（不沿用上次，免得補記完日圓後今天的便當也變日圓）
  const [currency, setCurrency] = useState(() => {
    if (initForeign) return initial.currency;
    if (isEdit) return 'TWD';
    // 同 pickTrip：日期在旅程期間才用當地幣別；行前補記（從還沒出發的旅程按記一筆）維持台幣
    const t = trips.find(x => x.id === tripSel);
    return t && date >= t.startDate && date <= t.endDate ? (t.currency || 'TWD') : 'TWD';
  });
  const [rate, setRate] = useState(initForeign ? (Number(initial.fxRate) || null) : null);
  // 自訂過匯率：改日期不重抓；換幣別或清空才回到自動。編輯舊筆時打開不重抓（fxReqRef 預設成該筆的鍵）
  const [rateManual, setRateManual] = useState(initForeign && !!initial.fxCustom && Number(initial.fxRate) > 0);
  const [fxStatus, setFxStatus] = useState(initForeign && Number(initial.fxRate) > 0 ? 'ok' : 'idle');
  const [fxNonce, setFxNonce] = useState(0);
  const [rateEditing, setRateEditing] = useState(false);
  const [rateDraft, setRateDraft] = useState('');
  const [error, setError] = useState('');

  const initShareMode = initialShareMode(isEdit ? initial : null);
  const [shareMode, setShareMode] = useState(initShareMode);
  const [splitNStr, setSplitNStr] = useState(() => (
    initShareMode === 'split'
      ? String(Math.round(Number(initial.splitN)))
      : String(tripDefaultSplitN(trips, tripSel))
  ));
  const [myShareStr, setMyShareStr] = useState(() => (
    initShareMode === 'fixed' ? String(initial.myShare) : ''
  ));
  const splitNTouchedRef = useRef(initShareMode === 'split');
  const [shareOpen, setShareOpen] = useState(false);

  const sheetRef = useRef(null);
  const sharePillRef = useRef(null);
  const sharePopoverRef = useRef(null);
  const returnFocusRef = useRef(null);
  const typeSwitchedRef = useRef(false); // 使用者切換過類型後，分類圖示才播進場動畫
  const longPressRef = useRef({ timer: null, fired: false });
  // 最後一次請求的「幣別|日期|次數」，晚到的舊回應丟掉；編輯舊外幣筆時預設成該筆，打開不重抓
  const fxReqRef = useRef(initForeign && Number(initial.fxRate) > 0 ? `${initial.currency}|${initial.date}|0` : null);
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();

  const amount = evaluateExpr(expr);
  const showExpr = hasOperator(expr);
  const isIncome = type === 'income';
  const categories = isIncome ? lifeIncomeCategories : lifeCategories;
  const activeCatId = isIncome ? incCatId : catId;
  const payment = paymentMethods.find(p => p.id === pmId);
  const isForeign = currency !== 'TWD';
  const selTrip = trips.find(t => t.id === tripSel) || null;
  const tripOptions = useMemo(() => {
    const cut = new Date();
    cut.setDate(cut.getDate() - TRIP_RECENT_DAYS);
    const cutoff = toIso(cut);
    const inDate = tripForDate(trips, date);
    return sortTrips(trips).filter(t => t.endDate >= cutoff || t.id === tripSel || t.id === inDate?.id);
  }, [trips, date, tripSel]);
  const showTrip = !isIncome && tripOptions.length > 0;
  const cur = currencyMeta(currency);
  const twd = isForeign ? toTWD(amount, rate) : amount;
  const effectiveSplitN = Math.max(2, Math.round(Number(splitNStr) || tripDefaultSplitN(trips, tripSel)));
  const splitPreviewText = twd != null
    ? `$${Math.round(twd / effectiveSplitN).toLocaleString('en-US')}`
    : '—';
  const effectiveMyShare = Math.max(0, Number(myShareStr) || 0);
  const myShareDisplayText = `$${effectiveMyShare.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const sharePillText = shareMode === 'split'
    ? `÷${effectiveSplitN} · ${splitPreviewText}`
    : shareMode === 'fixed'
      ? `我的份 ${myShareDisplayText}`
      : '幫大家付';
  const shareAriaLabel = shareMode === 'split'
    ? `幫大家付：目前 均分 ${effectiveSplitN} 人，我的份 ${splitPreviewText}`
    : shareMode === 'fixed'
      ? `幫大家付：目前 自填 ${myShareDisplayText}`
      : '幫大家付：目前 不是';
  const amountText = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const isLongAmount = (cur.symbol + amountText).length > 10;
  const title = `${isEdit ? '編輯' : '新增'}${isIncome ? '收入' : '支出'}`;
  // 分類區高度取「支出、收入兩邊較多的排數」（每排 4 個，最多 3 排、超過就區內捲動），切換類型時抽屜高度不變
  const catRows = Math.min(3, Math.max(1, Math.ceil(lifeCategories.length / 4), Math.ceil(lifeIncomeCategories.length / 4)));

  // 開啟時把焦點放進抽屜（不彈系統鍵盤）；關閉後焦點回到原本按的按鈕
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    sheetRef.current?.focus({ preventScroll: true });
    return () => {
      const el = returnFocusRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, []);

  // 外幣自動匯率：幣別或日期變了就重抓（快取過的瞬間回來）；手動改過匯率就不動
  useEffect(() => {
    if (!isForeign || rateManual) return;
    const key = `${currency}|${date}|${fxNonce}`;
    if (fxReqRef.current === key) return;
    fxReqRef.current = key;
    setRate(null);
    setFxStatus('loading');
    fetchRateToTWD(currency, date).then(r => {
      if (fxReqRef.current !== key) return;
      setRate(r);
      setFxStatus(r ? 'ok' : 'error');
    });
  }, [isForeign, currency, date, rateManual, fxNonce]);

  const applyCurrency = (code) => {
    setRateManual(false);
    setCurrency(code);
  };

  const changeCurrency = (code) => {
    buzz(10);
    setError('');
    curTouchedRef.current = true;
    applyCurrency(code);
  };

  // 換日期：還沒手動選旅程 → 旅程跟著日期走；還沒手動選幣別 → 幣別跟著旅程走
  const changeDate = (next) => {
    setDate(next);
    if (!autoTripRef.current) {
      // 旅程已選定：幣別跟著「日期在不在這趟期間」走（使用者自己選過幣別就不動）
      const t = trips.find(x => x.id === tripSel);
      if (t && !curTouchedRef.current) applyCurrency(next >= t.startDate && next <= t.endDate ? (t.currency || 'TWD') : 'TWD');
      return;
    }
    const t = tripForDate(trips, next);
    const sel = t ? t.id : NO_TRIP;
    if (sel === tripSel) return;
    setTripSel(sel);
    if (!splitNTouchedRef.current) setSplitNStr(String(tripDefaultSplitN(trips, sel)));
    if (!curTouchedRef.current) applyCurrency(t ? (t.currency || 'TWD') : 'TWD');
  };

  const pickTrip = (sel) => {
    buzz(10);
    autoTripRef.current = false;
    setTripSel(sel);
    if (!splitNTouchedRef.current) setSplitNStr(String(tripDefaultSplitN(trips, sel)));
    if (curTouchedRef.current) return;
    const t = trips.find(x => x.id === sel);
    if (!t) { applyCurrency('TWD'); return; }
    // 日期在旅程期間才切當地幣別；行前補記（10 月訂房）通常在台灣用台幣付，維持原幣別
    if (date >= t.startDate && date <= t.endDate) applyCurrency(t.currency || 'TWD');
  };

  const switchShareMode = (next) => {
    if (next === shareMode) return;
    buzz(10);
    setShareMode(next);
    if (next === 'split' && !splitNTouchedRef.current) {
      setSplitNStr(String(tripDefaultSplitN(trips, tripSel)));
    }
  };

  const handleSplitNChange = (e) => {
    splitNTouchedRef.current = true;
    const raw = e.target.value.replace(/\D/g, '');
    setSplitNStr(raw);
  };

  const handleSplitNBlur = () => {
    const n = Math.min(99, Math.max(2, Math.round(Number(splitNStr) || tripDefaultSplitN(trips, tripSel))));
    setSplitNStr(String(n));
  };

  const closeShare = useCallback(() => {
    if (shareMode === 'split') {
      const n = Math.min(99, Math.max(2, Math.round(Number(splitNStr) || tripDefaultSplitN(trips, tripSel))));
      setSplitNStr(String(n));
    }
    setShareOpen(false);
    if (sharePopoverRef.current?.contains(document.activeElement)) {
      sharePillRef.current?.focus({ preventScroll: true });
    }
  }, [shareMode, splitNStr, trips, tripSel]);

  const toggleShare = () => {
    buzz(10);
    if (shareOpen) {
      closeShare();
    } else {
      setNoteEditing(false);
      setRateEditing(false);
      setShareOpen(true);
    }
  };

  const openRateEdit = () => {
    setRateDraft(rateManual && rate ? String(rate) : '');
    setRateEditing(true);
  };

  // 填數字 → 用自訂匯率；清空 → 回到自動（抓失敗時等於重試）
  const commitRate = () => {
    const v = parseFloat(String(rateDraft).replace(/,/g, ''));
    if (v > 0) {
      fxReqRef.current = null;
      setRate(Number(v.toPrecision(6)));
      setRateManual(true);
      setFxStatus('ok');
      setError('');
    } else if (rateManual || !rate) {
      setRateManual(false);
      setFxNonce(n => n + 1);
    }
    setRateEditing(false);
  };

  const press = useCallback((key) => {
    buzz();
    setError('');
    setExpr(prev => pressKey(prev, key));
  }, []);

  const handleSave = () => {
    if (!(amount > 0)) { setError('請輸入金額'); buzz(30); return; }
    if (!date) { setError('請選擇日期'); buzz(30); return; }
    if (isForeign && !(rate > 0)) {
      buzz(30);
      if (fxStatus === 'loading') setError('匯率讀取中，稍等一下');
      else openRateEdit(); // 抓不到匯率：直接請使用者輸入
      return;
    }
    buzz(30);
    if (!isEdit) {
      try { localStorage.setItem(LAST_ENTRY_KEY, JSON.stringify({ catId, incCatId, pmId })); } catch { /* 私密模式等寫不進去時略過 */ }
    }
    const wasInTrip = isEdit && !!entryTripId(initial, trips, tripCtx);
    const nextTripId = isIncome ? undefined : tripIdToSave(tripSel, trips, date);
    const sp = isIncome
      ? sharePatch('none')
      : sharePatch(shareMode, { n: effectiveSplitN, myShare: myShareStr });
    const payload = {
      id: initial?.id || crypto.randomUUID(),
      type,
      ...entryAmountFields(amount, currency, rate, rateManual),
      // Apple Pay 列在台幣下改了金額（代刷外幣、自己只付一部分）→ 標確認台幣，旅程卡不再提醒換算
      ...(confirmsTwdOnEdit(isEdit ? initial : null, amount, currency) ? { currency: 'TWD' } : {}),
      categoryId: isIncome ? incCatId : catId,
      date,
      note: note.trim(),
      ...(isIncome ? {} : { paymentMethod: pmId }),
      tripId: nextTripId,
      ...sp,
    };
    onSave(payload);
    if (wasInTrip && nextTripId === NO_TRIP) {
      offerExclusion(initial);
    } else if (isShared(payload)) {
      const { lifeExpenses, patchLifeExpenses } = useAppStore.getState();
      const targets = bulkShareTargets(payload, lifeExpenses, trips, tripCtx);
      if (targets.length > 0) {
        const shopName = payload.note.replace(/^\s*\[[^\]]*\]\s*/, '').trim() || '這家店';
        showToast(`同一趟還有 ${targets.length} 筆「${shopName}」，也套用？`, 'success', {
          actionLabel: '好',
          onAction: () => patchLifeExpenses(targets.map(t => ({ id: t.id, patch: sp }))),
        });
      }
    }
  };

  const switchType = (next) => {
    if (next === type) return;
    buzz(12);
    typeSwitchedRef.current = true;
    if (next === 'income') setShareOpen(false);
    setType(next);
  };

  // ⌫ 長按 0.5 秒清空
  const startBackspaceHold = () => {
    longPressRef.current.fired = false;
    clearTimeout(longPressRef.current.timer);
    longPressRef.current.timer = setTimeout(() => {
      longPressRef.current.fired = true;
      buzz(20);
      setExpr('');
    }, 500);
  };
  const endBackspaceHold = () => clearTimeout(longPressRef.current.timer);

  // 鍵盤：Esc 關閉、Tab 鎖在抽屜（或幫大家付面板）內、數字與運算子直接輸入、Enter 儲存
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (shareOpen) { closeShare(); return; }
      if (noteEditing) { setNoteEditing(false); return; }
      if (rateEditing) { setRateEditing(false); return; }
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      const scope = shareOpen ? sharePopoverRef.current : sheetRef.current;
      const nodes = scope?.querySelectorAll('button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])');
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || !scope.contains(document.activeElement))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !scope.contains(document.activeElement))) {
        e.preventDefault(); first.focus();
      }
      return;
    }
    const tag = e.target.tagName;
    if (shareOpen || noteEditing || rateEditing || tag === 'INPUT' || tag === 'SELECT') return;
    if (tag === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return; // 讓聚焦中的按鈕自己處理
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); return; }
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); return; }
    const mapped = KEYBOARD_MAP[e.key];
    if (mapped) { e.preventDefault(); press(mapped); }
  };

  const handleDragEnd = (_, info) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
  };

  const sheetTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] };

  // 掛到 body：分頁切換動畫的圖層有 transform、會自成疊層，抽屜放在裡面會被底部導覽壓住
  return createPortal(
    <>
      <motion.div
        className="kk-sheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2 }}
        onClick={shareOpen ? closeShare : onClose}
        aria-hidden="true"
      />

      <motion.div
        ref={sheetRef}
        className={`kk-sheet is-${type}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kkSheetTitle"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={sheetTransition}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={handleDragEnd}
      >
        {/* 頂部：把手（往下拉關閉）＋類型切換 */}
        <div className="kk-sheet-head" onPointerDown={(e) => dragControls.start(e)}>
          <span className="kk-sheet-grabber" aria-hidden="true" />
          <h2 id="kkSheetTitle" className="kk-sr-only">{title}</h2>
          <div className="kk-sheet-toprow">
            {isEdit && onDelete ? (
              <button type="button" className="kk-sheet-icon is-danger" onClick={() => onDelete(initial.id)} aria-label="刪除這筆" title="刪除這筆">
                <i className="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            ) : (
              <span className="kk-sheet-icon-spacer" aria-hidden="true" />
            )}

            <div className="kk-type-seg" role="radiogroup" aria-label="類型">
              {[['expense', '支出'], ['income', '收入']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={type === key}
                  className={`kk-type-btn${type === key ? ` is-active is-${key}` : ''}`}
                  onClick={() => switchType(key)}
                >
                  {/* 白色選取底塊用 layoutId 在兩顆之間滑動 */}
                  {type === key && (
                    <motion.span
                      layoutId="kk-type-pill"
                      className="kk-type-pill"
                      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="kk-type-label">{label}</span>
                </button>
              ))}
            </div>

            <button type="button" className="kk-sheet-icon" onClick={onClose} aria-label="關閉" title="關閉">
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        {/* 金額：有運算子時上方顯示算式；左側幣別膠囊、右側即時結果；
            外幣時下方一行換算台幣（與錯誤提示共用固定高度，切換幣別版面不跳） */}
        <div className="kk-amount" aria-live="polite">
          {/* 第一行：左旅程＋幫大家付膠囊（只對支出顯示）｜右算式；行高固定，標籤出現或消失不推動版面 */}
          <div className={`kk-amount-top${showExpr ? ' has-expr' : ''}`}>
            {(showTrip || !isIncome) && (
              <div className="kk-amount-tags">
                {showTrip && (
                  <label className={`kk-trip${selTrip ? ' is-on' : ''}`}>
                    <i className="fa-solid fa-plane" aria-hidden="true"></i>
                    <span className="kk-trip-name">{selTrip ? selTrip.name : '加入旅程'}</span>
                    <i className="fa-solid fa-chevron-down kk-trip-caret" aria-hidden="true"></i>
                    <select
                      className="kk-pill-native"
                      value={tripSel}
                      onChange={e => pickTrip(e.target.value)}
                      aria-label={`旅程：${selTrip ? selTrip.name : '不屬於旅程'}`}
                    >
                      <option value={NO_TRIP}>不屬於旅程</option>
                      {tripOptions.map(t => <option key={t.id} value={t.id}>{t.name}（{formatTripRange(t)}）</option>)}
                    </select>
                  </label>
                )}
                {!isIncome && (
                  <button
                    ref={sharePillRef}
                    type="button"
                    className={`kk-trip kk-share-pill${shareMode !== 'none' ? ' is-on' : ''}${shareOpen ? ' is-open' : ''}`}
                    onClick={toggleShare}
                    aria-expanded={shareOpen}
                    aria-haspopup="dialog"
                    aria-label={shareAriaLabel}
                  >
                    <i className="fa-solid fa-user-group" aria-hidden="true"></i>
                    <span className="kk-trip-name">{sharePillText}</span>
                    <i className="fa-solid fa-chevron-down kk-trip-caret" aria-hidden="true"></i>
                  </button>
                )}
              </div>
            )}
            <div className="kk-amount-expr" aria-hidden={!showExpr}><span>{showExpr ? formatExpr(expr) : ' '}</span></div>
          </div>
          <div className="kk-amount-row">
            <label className={`kk-cur${isForeign ? ' is-foreign' : ''}`}>
              <span className="kk-cur-code">{currency}</span>
              <i className="fa-solid fa-chevron-down" aria-hidden="true"></i>
              <select
                className="kk-pill-native"
                value={currency}
                onChange={e => changeCurrency(e.target.value)}
                aria-label={`幣別：${cur.name}`}
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
              </select>
            </label>
            <div className={`kk-amount-value${expr ? '' : ' is-empty'}${isLongAmount ? ' is-long' : ''}`}>
              <span className="kk-amount-currency">{cur.symbol}</span>
              {amountText}
            </div>
          </div>
          <div className="kk-amount-sub">
            <span className="kk-amount-error" role="alert">{error}</span>
            {!error && isForeign && (
              <button
                type="button"
                className={`kk-fx${fxStatus === 'error' ? ' is-error' : ''}`}
                onClick={openRateEdit}
                aria-label={fxStatus === 'ok'
                  ? `約新台幣 ${twd?.toLocaleString('en-US')} 元，匯率 1 ${currency} 等於 ${formatRate(rate)}${rateManual ? '（自訂）' : ''}，點一下修改匯率`
                  : fxStatus === 'error' ? '抓不到匯率，點一下手動輸入' : '匯率讀取中'}
              >
                {fxStatus === 'loading' && <span>匯率讀取中…</span>}
                {fxStatus === 'error' && <><i className="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>抓不到匯率，點此輸入</span></>}
                {fxStatus === 'ok' && (
                  <>
                    <span>≈ <strong>NT${twd?.toLocaleString('en-US')}</strong></span>
                    <span className="kk-fx-rate">1 {currency} = {formatRate(rate)}{rateManual ? '（自訂）' : ''}</span>
                    <i className="fa-solid fa-pen" aria-hidden="true"></i>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="kk-sheet-lower">
        {/* 分類圖示格 */}
        <motion.div
          key={type}
          className="kk-cat-grid"
          role="radiogroup"
          aria-label={isIncome ? '收入類別' : '支出分類'}
          style={{ '--kk-cat-rows': catRows }}
          variants={catGridVariants}
          initial={typeSwitchedRef.current && !reduceMotion ? 'hidden' : false}
          animate="show"
        >
          {categories.map(c => {
            const active = c.id === activeCatId;
            return (
              <motion.button
                variants={catItemVariants}
                key={c.id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`kk-cat${active ? ' is-active' : ''}`}
                onClick={() => { buzz(10); (isIncome ? setIncCatId : setCatId)(c.id); }}
              >
                <span className="kk-cat-icon" style={{ background: c.color }} aria-hidden="true">
                  {c.icon
                    ? <IconRenderer name={c.icon} size={20} color={c.iconColor || '#fff'} />
                    : <span className="kk-cat-initial">{(c.name || '?').slice(0, 1)}</span>}
                </span>
                <span className="kk-cat-name">{c.name}</span>
              </motion.button>
            );
          })}
        </motion.div>

        {/* 日期／付款／備註：短膠囊同一列；日期與付款用原生選擇器（透明疊在膠囊上） */}
        {rateEditing ? (
          <div className="kk-note-row">
            <label className="kk-rate-field">
              <span className="kk-rate-affix">1 {currency} =</span>
              <input
                className="kk-rate-input"
                value={rateDraft}
                onChange={e => setRateDraft(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitRate(); } }}
                placeholder={rate && !rateManual ? formatRate(rate) : '例如 0.2062'}
                aria-label={`匯率：1 ${currency} 等於多少台幣，留空用自動匯率`}
                inputMode="decimal"
                enterKeyHint="done"
                autoFocus
              />
              <span className="kk-rate-affix">台幣</span>
            </label>
            <button type="button" className="kk-note-done" onClick={commitRate}>完成</button>
          </div>
        ) : noteEditing ? (
          <div className="kk-note-row">
            <input
              className="kk-note-input"
              value={note}
              onChange={e => setNote(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setNoteEditing(false); } }}
              placeholder="店家、品項…"
              aria-label="備註"
              enterKeyHint="done"
              autoFocus
            />
            <button type="button" className="kk-note-done" onClick={() => setNoteEditing(false)}>完成</button>
          </div>
        ) : (
          <div className="kk-pill-row">
            {/* 新增時日期不是今天（從月曆選了別天再按 ＋）→ 琥珀外框提醒，免得補記到錯的日子 */}
            <label className={`kk-pill is-date${!isEdit && date !== toIso(new Date()) ? ' is-off-today' : ''}`}>
              <i className="fa-regular fa-calendar" aria-hidden="true"></i>
              <span className="kk-pill-text">{dateLabel(date)}</span>
              <input
                type="date"
                className="kk-pill-native"
                value={date}
                onChange={e => { if (e.target.value) changeDate(e.target.value); }}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* 部分瀏覽器不支援 */ } }}
                aria-label={`日期：${dateLabel(date)}`}
              />
            </label>

            {!isIncome && (
              <label className="kk-pill is-pay">
                <i className="fa-regular fa-credit-card" aria-hidden="true"></i>
                <span className="kk-pill-text">{stripParen(payment?.name) || '付款方式'}</span>
                <select
                  className="kk-pill-native"
                  value={pmId}
                  onChange={e => setPmId(e.target.value)}
                  aria-label={`付款方式：${stripParen(payment?.name) || '未選'}`}
                >
                  {paymentMethods.map(pm => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                </select>
              </label>
            )}

            <button
              type="button"
              className={`kk-pill is-note${note ? ' has-value' : ''}`}
              onClick={() => setNoteEditing(true)}
              aria-label={note ? `備註：${note}，點一下修改` : '加備註'}
            >
              <i className="fa-solid fa-pen" aria-hidden="true"></i>
              <span className="kk-pill-text">{note || '備註'}</span>
            </button>
          </div>
        )}

        {/* 常駐數字鍵盤：備註／匯率輸入時收起，讓系統鍵盤出來 */}
        {!noteEditing && !rateEditing && (
          <div className="kk-keypad">
            {KEYS.map(k => {
              const isBack = k === '⌫';
              return (
                <button
                  key={k}
                  type="button"
                  className={`kk-key${OPS.includes(k) ? ' is-op' : ''}${isBack ? ' is-back' : ''}`}
                  aria-label={KEY_LABEL[k] || k}
                  onClick={() => {
                    if (isBack && longPressRef.current.fired) { longPressRef.current.fired = false; return; }
                    press(k);
                  }}
                  onPointerDown={isBack ? startBackspaceHold : undefined}
                  onPointerUp={isBack ? endBackspaceHold : undefined}
                  onPointerLeave={isBack ? endBackspaceHold : undefined}
                >
                  {isBack ? <i className="fa-solid fa-delete-left" aria-hidden="true"></i> : k}
                </button>
              );
            })}
            {/* 最底列：C 清除整個算式｜儲存（佔 3 欄），抽屜高度不變 */}
            <button
              type="button"
              className={`kk-key is-clear${expr ? '' : ' is-idle'}`}
              aria-label="清除金額"
              onClick={() => press('C')}
            >
              C
            </button>
            <button
              type="button"
              className={`kk-key-save${amount > 0 ? '' : ' is-empty'}`}
              onClick={handleSave}
            >
              {isEdit ? '儲存變更' : '儲存'}
            </button>
          </div>
        )}

        {/* 幫大家付浮動小面板：蓋在分類與鍵盤上方，不改變抽屜高度 */}
        <AnimatePresence>
          {!isIncome && shareOpen && (
            <motion.div
              ref={sharePopoverRef}
              className={`kk-share-popover${shareMode !== 'none' ? ' is-shared' : ''}`}
              role="dialog"
              aria-label="幫大家付"
              initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="kk-share-head">
                <span className="kk-share-title">
                  <i className="fa-solid fa-user-group" aria-hidden="true"></i>
                  <span>幫大家付</span>
                </span>
                <div className="kk-share-seg" role="radiogroup" aria-label="幫大家付">
                  {[['none', '不是'], ['split', '均分'], ['fixed', '自填']].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={shareMode === key}
                      className={`kk-share-btn${shareMode === key ? ' is-active' : ''}`}
                      onClick={() => switchShareMode(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="kk-share-body">
                {shareMode === 'none' && (
                  <span className="kk-share-hint">整筆計入我的花費</span>
                )}

                {shareMode === 'split' && (
                  <div className="kk-share-split">
                    <label className="kk-share-field">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={2}
                        max={99}
                        enterKeyHint="done"
                        className="kk-share-num"
                        value={splitNStr}
                        onChange={handleSplitNChange}
                        onBlur={handleSplitNBlur}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); closeShare(); } }}
                        aria-label="均分人數"
                      />
                      <span className="kk-share-unit">人</span>
                    </label>
                    <span className="kk-share-preview">
                      我的份 <strong>{splitPreviewText}</strong>
                    </span>
                  </div>
                )}

                {shareMode === 'fixed' && (
                  <div className="kk-share-fixed">
                    <label className="kk-share-field is-money" htmlFor="kkShareMyInput">
                      <span className="kk-share-unit">我的份 NT$</span>
                      <input
                        id="kkShareMyInput"
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="done"
                        className="kk-share-money"
                        value={myShareStr}
                        placeholder="0"
                        onChange={e => setMyShareStr(sanitizeDecimal(e.target.value))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); closeShare(); } }}
                        aria-label="我的份金額（台幣）"
                      />
                    </label>
                  </div>
                )}
              </div>

              <button type="button" className="kk-share-done" onClick={closeShare}>
                完成
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        </div>

        {/* 點面板外關閉幫大家付（覆蓋抽屜其餘區域，層級低於面板本身） */}
        {!isIncome && shareOpen && (
          <div className="kk-share-scrim" onClick={closeShare} aria-hidden="true" />
        )}
      </motion.div>
    </>,
    document.body
  );
}
