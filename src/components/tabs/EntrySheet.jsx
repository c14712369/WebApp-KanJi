import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls, useReducedMotion } from 'framer-motion';
import IconRenderer from '../../lib/IconRenderer';
import { OPS, pressKey, evaluateExpr, hasOperator, formatExpr, exprFromAmount } from '../../lib/calcPad';

/**
 * 記一筆／編輯：底部抽屜（參考 MOZE）。
 * 由上而下：支出｜收入切換 → 大號金額（含算式）→ 分類圖示格 → 日期／付款／備註膠囊 → 常駐數字鍵盤＋儲存。
 * 存檔資料格式與舊視窗相同；記住上次的分類與付款方式；編輯時可改類型、可刪除。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
// 手機撥號式排列（1 2 3 在最上排），運算子在右側一欄
const KEYS = ['1', '2', '3', '÷', '4', '5', '6', '×', '7', '8', '9', '−', '.', '0', '⌫', '+'];
const KEY_LABEL = { '÷': '除', '×': '乘', '−': '減', '+': '加', '.': '小數點', '⌫': '刪除一位，長按清除' };
const KEYBOARD_MAP = { '+': '+', '-': '−', '*': '×', 'x': '×', 'X': '×', '/': '÷', '.': '.', 'Backspace': '⌫', 'Delete': 'C', 'c': 'C', 'C': 'C' };
const LAST_ENTRY_KEY = 'LAST_EXPENSE_ENTRY';

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

export default function EntrySheet({
  lifeCategories = [],
  lifeIncomeCategories = [],
  paymentMethods = [],
  currentMonth,
  initial,
  onClose,
  onSave,
  onDelete,
}) {
  const isEdit = !!(initial?.id && initial?.type);
  const initType = initial?.type || 'expense';
  const lastSaved = useMemo(() => (isEdit ? {} : readLastEntry()), [isEdit]);

  const [type, setType] = useState(initType);
  const [catId, setCatId] = useState(
    (initType !== 'income' && initial?.categoryId) || lastSaved.catId || lifeCategories[0]?.id || ''
  );
  const [incCatId, setIncCatId] = useState(
    (initType === 'income' && initial?.categoryId) || lastSaved.incCatId || lifeIncomeCategories[0]?.id || ''
  );
  const [date, setDate] = useState(initial?.date || defaultDate(currentMonth));
  const [note, setNote] = useState(initial?.note || '');
  const [pmId, setPmId] = useState(initial?.paymentMethod || lastSaved.pmId || paymentMethods[0]?.id || 'cash');
  const [expr, setExpr] = useState(exprFromAmount(initial?.amount));
  const [noteEditing, setNoteEditing] = useState(false);
  const [error, setError] = useState('');

  const sheetRef = useRef(null);
  const returnFocusRef = useRef(null);
  const longPressRef = useRef({ timer: null, fired: false });
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();

  const amount = evaluateExpr(expr);
  const showExpr = hasOperator(expr);
  const isIncome = type === 'income';
  const categories = isIncome ? lifeIncomeCategories : lifeCategories;
  const activeCatId = isIncome ? incCatId : catId;
  const payment = paymentMethods.find(p => p.id === pmId);
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

  const press = useCallback((key) => {
    buzz();
    setError('');
    setExpr(prev => pressKey(prev, key));
  }, []);

  const handleSave = () => {
    if (!(amount > 0)) { setError('請輸入金額'); buzz(30); return; }
    if (!date) { setError('請選擇日期'); buzz(30); return; }
    buzz(30);
    if (!isEdit) {
      try { localStorage.setItem(LAST_ENTRY_KEY, JSON.stringify({ catId, incCatId, pmId })); } catch { /* 私密模式等寫不進去時略過 */ }
    }
    onSave({
      id: initial?.id || crypto.randomUUID(),
      type,
      amount,
      categoryId: isIncome ? incCatId : catId,
      date,
      note: note.trim(),
      ...(isIncome ? {} : { paymentMethod: pmId }),
    });
  };

  const switchType = (next) => {
    if (next === type) return;
    buzz(12);
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

  // 鍵盤：Esc 關閉、Tab 鎖在抽屜內、數字與運算子直接輸入、Enter 儲存
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (noteEditing) { setNoteEditing(false); return; }
      onClose();
      return;
    }
    if (e.key === 'Tab') {
      const nodes = sheetRef.current?.querySelectorAll('button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])');
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
      return;
    }
    const tag = e.target.tagName;
    if (noteEditing || tag === 'INPUT' || tag === 'SELECT') return;
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
        onClick={onClose}
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
                  {label}
                </button>
              ))}
            </div>

            <button type="button" className="kk-sheet-icon" onClick={onClose} aria-label="關閉" title="關閉">
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        {/* 金額：有運算子時上方顯示算式，下方即時結果 */}
        <div className="kk-amount" aria-live="polite">
          <div className="kk-amount-expr" aria-hidden={!showExpr}>{showExpr ? formatExpr(expr) : ' '}</div>
          <div className={`kk-amount-value${expr ? '' : ' is-empty'}`}>
            <span className="kk-amount-currency">$</span>
            {amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          </div>
          <div className="kk-amount-error" role="alert">{error}</div>
        </div>

        {/* 分類圖示格 */}
        <div
          className="kk-cat-grid"
          role="radiogroup"
          aria-label={isIncome ? '收入類別' : '支出分類'}
          style={{ '--kk-cat-rows': catRows }}
        >
          {categories.map(c => {
            const active = c.id === activeCatId;
            return (
              <button
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
              </button>
            );
          })}
        </div>

        {/* 日期／付款／備註：短膠囊同一列；日期與付款用原生選擇器（透明疊在膠囊上） */}
        {noteEditing ? (
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
            <label className="kk-pill">
              <i className="fa-regular fa-calendar" aria-hidden="true"></i>
              <span className="kk-pill-text">{dateLabel(date)}</span>
              <input
                type="date"
                className="kk-pill-native"
                value={date}
                onChange={e => { if (e.target.value) setDate(e.target.value); }}
                onClick={e => { try { e.currentTarget.showPicker?.(); } catch { /* 部分瀏覽器不支援 */ } }}
                aria-label={`日期：${dateLabel(date)}`}
              />
            </label>

            {!isIncome && (
              <label className="kk-pill">
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

        {/* 常駐數字鍵盤：備註輸入時收起，讓系統鍵盤出來 */}
        {!noteEditing && (
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
            <button
              type="button"
              className={`kk-key-save${amount > 0 ? '' : ' is-empty'}`}
              onClick={handleSave}
            >
              {isEdit ? '儲存變更' : '儲存'}
            </button>
          </div>
        )}
      </motion.div>
    </>,
    document.body
  );
}
