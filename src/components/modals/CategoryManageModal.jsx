import { useEffect, useRef, useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import IconRenderer from '../../lib/IconRenderer';
import { iconLabel } from '../../lib/iconCatalog';
import { showToast, confirmDialog } from '../../lib/utils';
import IconPicker from './IconPicker';
import '../../category-manage.css';

/**
 * 分類管理（設定的子畫面）：兩層，跟設定一樣的 iOS 分組樣式。
 * - 清單：（生活分類才有）支出／收入切換、拖曳或方向鍵排序、點一列編輯、最下面「＋ 新增分類」
 * - 編輯：取消／儲存、圖示預覽＋名稱、色票（含自訂）、圖示顏色、圖示選擇器、刪除（先說會影響幾筆）
 * 抽屜高度固定，切換清單／編輯、支出／收入時不跳動。
 *
 * @param {string} title
 * @param {Array<{ key, label, categories, onSave, usage: (id) => number, orphanNote: (id) => string }>} sets
 *   一組＝一份分類清單；兩組以上才顯示切換（生活：支出／收入）
 */

// 色票：沿用生活分類的大地色系
const SWATCHES = [
  ['#C17B2E', '琥珀'], ['#D4A24C', '芥末黃'], ['#D46060', '磚紅'], ['#B5838D', '乾燥玫瑰'],
  ['#8B5CF6', '紫'], ['#4A6CB3', '藍'], ['#2A6475', '深青'], ['#5A9E7A', '綠'],
  ['#3D7A5A', '森林綠'], ['#6B7A8F', '石板灰'], ['#8A8A8A', '灰'],
];
const ICON_INKS = [['#FFFFFF', '白'], ['#1F2937', '深']];
const DEFAULT_DRAFT = { name: '', color: '#C17B2E', iconColor: '#FFFFFF', icon: 'Utensils' };

const sameColor = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// 圖示與底色對比太低時提醒（WCAG 圖形 3:1）
function contrast(a, b) {
  const lum = (hex) => {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return 1;
    const [r, g, bl] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export default function CategoryManageModal({ title, sets, onClose }) {
  const [setKey, setSetKey] = useState(sets[0].key);
  const [editing, setEditing] = useState(null); // null＝清單；{ id|null, ...draft }＝編輯／新增
  const [nameError, setNameError] = useState('');
  const sheetRef = useRef(null);
  const nameRef = useRef(null);
  const cur = sets.find(s => s.key === setKey) || sets[0];
  const { categories, onSave } = cur;

  const openEditor = (cat) => {
    setNameError('');
    setEditing(cat
      ? { id: cat.id, name: cat.name, color: cat.color, iconColor: cat.iconColor || '#FFFFFF', icon: cat.icon || 'MoreHorizontal' }
      : { id: null, ...DEFAULT_DRAFT });
  };
  const backToList = () => { setEditing(null); setNameError(''); };

  // 換畫面時把焦點放到新畫面的標題（螢幕閱讀器知道換頁了）；新增時直接進名稱欄
  useEffect(() => {
    const el = editing && !editing.id ? nameRef.current : sheetRef.current?.querySelector('h2');
    el?.focus({ preventScroll: true });
  }, [editing?.id, !!editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc：編輯中回清單，清單時關閉（確認框開著時交給確認框處理）
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.confirm-modal')) return;
      e.preventDefault();
      if (editing) backToList(); else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const save = () => {
    const name = editing.name.trim();
    if (!name) { setNameError('請輸入分類名稱'); nameRef.current?.focus(); return; }
    if (categories.some(c => c.id !== editing.id && c.name.trim() === name)) {
      setNameError(`已經有「${name}」了`); nameRef.current?.focus(); return;
    }
    const fields = { name, color: editing.color, iconColor: editing.iconColor, icon: editing.icon };
    if (editing.id) {
      onSave(categories.map(c => (c.id === editing.id ? { ...c, ...fields } : c)));
      showToast('已更新分類');
    } else {
      onSave([...categories, { id: `cat_${crypto.randomUUID().slice(0, 8)}`, ...fields }]);
      showToast('已新增分類');
    }
    backToList();
  };

  const remove = async () => {
    const target = categories.find(c => c.id === editing.id);
    if (!target) return;
    const n = cur.usage ? cur.usage(target.id) : 0;
    const note = typeof cur.orphanNote === 'function' ? cur.orphanNote(target.id) : (cur.orphanNote || '');
    const message = n > 0
      ? `有 ${n} 筆用「${target.name}」。${note ? `\n${note}` : ''}`
      : `「${target.name}」目前沒有被使用。`;
    if (!await confirmDialog({ title: '刪除分類', message, confirmText: '刪除' })) return;
    console.log(`[categories] 刪除分類 ${target.id}（${target.name}），影響 ${n} 筆`);
    onSave(categories.filter(c => c.id !== target.id));
    showToast('已刪除分類');
    backToList();
  };

  // 鍵盤排序：把手上按方向鍵上下移
  const move = (id, dir) => {
    const i = categories.findIndex(c => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= categories.length) return;
    const next = [...categories];
    [next[i], next[j]] = [next[j], next[i]];
    onSave(next);
    requestAnimationFrame(() => sheetRef.current?.querySelector(`[data-handle="${id}"]`)?.focus());
  };

  const set = (patch) => setEditing(d => ({ ...d, ...patch }));
  const lowContrast = editing && contrast(editing.color, editing.iconColor) < 3;
  const customBg = editing && !SWATCHES.some(([c]) => sameColor(c, editing.color));
  const customInk = editing && !ICON_INKS.some(([c]) => sameColor(c, editing.iconColor));

  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div ref={sheetRef} className="modal settings-sheet cm-sheet" role="dialog" aria-modal="true" aria-labelledby="cmTitle">
        <div className="settings-grabber" aria-hidden="true"></div>

        {!editing ? (
          <div className="cm-view" key="list">
            <div className="settings-head">
              <h2 id="cmTitle" tabIndex={-1}>{title}</h2>
              <button type="button" className="settings-done" onClick={onClose}>完成</button>
            </div>

            <div className="cm-body">
              {sets.length > 1 && (
                <div className="fx-seg cm-seg" role="radiogroup" aria-label="分類種類">
                  {sets.map(s => (
                    <button key={s.key} type="button" role="radio" aria-checked={s.key === setKey}
                      className={`fx-seg-btn${s.key === setKey ? ' is-active' : ''}`} onClick={() => setSetKey(s.key)}>
                      {s.label}<span className="fx-seg-count">{s.categories.length}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="settings-group-label">按住 <i className="fa-solid fa-grip-vertical" aria-hidden="true"></i> 拖曳調整順序</div>
              <Reorder.Group axis="y" values={categories} onReorder={onSave} className="settings-group cm-list" as="ul">
                {categories.map(cat => (
                  <CategoryRow key={cat.id} cat={cat} count={cur.usage ? cur.usage(cat.id) : null}
                    onEdit={() => openEditor(cat)} onMove={(dir) => move(cat.id, dir)} />
                ))}
              </Reorder.Group>

              <div className="settings-group cm-add-group">
                <button type="button" className="settings-row cm-add" onClick={() => openEditor(null)}>
                  <span className="cm-add-icon" aria-hidden="true"><i className="fa-solid fa-plus"></i></span>
                  <span className="settings-row-label">新增{sets.length > 1 ? cur.label : ''}分類</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="cm-view" key="edit">
            <div className="settings-head cm-edit-head">
              <button type="button" className="settings-done cm-cancel" onClick={backToList}>取消</button>
              <h2 id="cmTitle" tabIndex={-1}>{editing.id ? '編輯分類' : `新增${sets.length > 1 ? cur.label : ''}分類`}</h2>
              <button type="button" className="settings-done" onClick={save}>儲存</button>
            </div>

            <div className="cm-body">
              <div className="cm-name-row">
                <span className="cm-chip is-lg" style={{ background: editing.color, color: editing.iconColor }} aria-hidden="true">
                  <IconRenderer name={editing.icon} size={24} />
                </span>
                <div className="cm-name-field">
                  <label className="form-label" htmlFor="cmName">名稱</label>
                  <input
                    id="cmName" ref={nameRef} className="form-input" value={editing.name} maxLength={12}
                    onChange={e => { set({ name: e.target.value }); if (nameError) setNameError(''); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                    placeholder="例如：飲食" enterKeyHint="done"
                    aria-invalid={!!nameError} aria-describedby={nameError ? 'cmNameErr' : undefined}
                  />
                  {nameError && <p id="cmNameErr" className="cm-error" role="alert">{nameError}</p>}
                </div>
              </div>

              <div className="form-label cm-label">背景顏色</div>
              <div className="cm-swatches" role="radiogroup" aria-label="背景顏色">
                {SWATCHES.map(([c, n]) => (
                  <button key={c} type="button" role="radio" aria-checked={sameColor(c, editing.color)} aria-label={n} title={n}
                    className={`cm-swatch${sameColor(c, editing.color) ? ' is-on' : ''}`} style={{ '--sw': c }}
                    onClick={() => set({ color: c })} />
                ))}
                <label className={`cm-swatch is-custom${customBg ? ' is-on' : ''}`} title="自訂顏色" style={customBg ? { '--sw': editing.color } : undefined}>
                  <input type="color" value={editing.color} onChange={e => set({ color: e.target.value })} aria-label="自訂背景顏色" />
                  {!customBg && <i className="fa-solid fa-eye-dropper" aria-hidden="true"></i>}
                </label>
              </div>

              <div className="cm-ink-row">
                <span className="form-label cm-label" id="cmInkLabel">圖示顏色</span>
                <div className="fx-seg cm-ink-seg" role="radiogroup" aria-labelledby="cmInkLabel">
                  {ICON_INKS.map(([c, n]) => (
                    <button key={c} type="button" role="radio" aria-checked={sameColor(c, editing.iconColor)}
                      className={`fx-seg-btn${sameColor(c, editing.iconColor) ? ' is-active' : ''}`} onClick={() => set({ iconColor: c })}>
                      <span className="cm-ink-dot" style={{ background: c }} aria-hidden="true"></span>{n}
                    </button>
                  ))}
                  <label className={`fx-seg-btn cm-ink-custom${customInk ? ' is-active' : ''}`}>
                    <input type="color" value={editing.iconColor} onChange={e => set({ iconColor: e.target.value })} aria-label="自訂圖示顏色" />
                    <span className="cm-ink-dot" style={{ background: customInk ? editing.iconColor : 'conic-gradient(#D46060, #D4A24C, #5A9E7A, #4A6CB3, #8B5CF6, #D46060)' }} aria-hidden="true"></span>自訂
                  </label>
                </div>
              </div>
              <p className={`cm-hint${lowContrast ? ' is-warn' : ''}`} aria-live="polite">
                {lowContrast ? '圖示跟底色太接近，可能看不清楚' : ' '}
              </p>

              <div className="form-label ip-label-row cm-label">
                <span id="cmIconLabel">圖示</span>
                <span className="ip-label-current">{iconLabel(editing.icon)}</span>
              </div>
              <IconPicker value={editing.icon} onChange={icon => set({ icon })} color={editing.color} iconColor={editing.iconColor} labelId="cmIconLabel" />

              {editing.id && (
                <div className="settings-group cm-delete-group">
                  <button type="button" className="settings-row is-danger" onClick={remove}
                    disabled={categories.length <= 1} title={categories.length <= 1 ? '至少要留一個分類' : undefined}>
                    <span className="settings-row-label">{categories.length <= 1 ? '至少要留一個分類' : '刪除分類'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ cat, count, onEdit, onMove }) {
  const controls = useDragControls();
  return (
    <Reorder.Item value={cat} dragListener={false} dragControls={controls} className="cm-row" as="li">
      <button
        type="button" className="cm-handle" data-handle={cat.id}
        onPointerDown={e => controls.start(e)}
        onKeyDown={e => {
          if (e.key === 'ArrowUp') { e.preventDefault(); onMove(-1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onMove(1); }
        }}
        aria-label={`調整「${cat.name}」的順序：按住拖曳，或用上下方向鍵`}
      >
        <i className="fa-solid fa-grip-vertical" aria-hidden="true"></i>
      </button>
      <button type="button" className="cm-row-main" onClick={onEdit} aria-label={`編輯「${cat.name}」${count != null ? `，${count} 筆` : ''}`}>
        <span className="cm-chip" style={{ background: cat.color, color: cat.iconColor || '#FFFFFF' }} aria-hidden="true">
          <IconRenderer name={cat.icon} size={16} />
        </span>
        <span className="settings-row-label cm-row-name">{cat.name}</span>
        {count != null && <span className="cm-row-count">{count} 筆</span>}
        <i className="fa-solid fa-chevron-right settings-row-chevron" aria-hidden="true"></i>
      </button>
    </Reorder.Item>
  );
}
