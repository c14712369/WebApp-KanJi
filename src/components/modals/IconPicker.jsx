import { useEffect, useMemo, useRef, useState } from 'react';
import IconRenderer, { loadAllIcons } from '../../lib/IconRenderer';
import { searchIconGroups } from '../../lib/iconCatalog';
import '../../icon-picker.css';

/**
 * 分類圖示選擇器：200 個圖示依用途分組，連續捲動＋黏頂分組標題，可用中文關鍵字搜尋。
 * 捲動框高度固定，搜尋結果多寡不會讓視窗跳動。
 * 鍵盤：方向鍵在圖示間移動（只有選中的那顆在 Tab 順序裡），搜尋框按 Enter 選第一個結果。
 */
export default function IconPicker({ value, onChange, color, iconColor, labelId }) {
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);
  const groups = useMemo(() => searchIconGroups(query), [query]);
  const flat = useMemo(() => groups.flatMap(g => g.icons.map(i => i.name)), [groups]);
  // 選中的不在目前結果裡 → 第一個結果當 Tab 停點
  const tabStop = flat.includes(value) ? value : flat[0];

  // 平常 App 閒置時就預載好了；萬一還沒（剛開 App 馬上進設定），這裡補載
  useEffect(() => { loadAllIcons(); }, []);

  // 換搜尋字 → 回到最上面（要宣告在下面那段之前：同一次更新裡先歸零、再捲到選中的圖示）
  const prevQuery = useRef(query);
  useEffect(() => {
    if (prevQuery.current === query) return;
    prevQuery.current = query;
    if (boxRef.current) boxRef.current.scrollTop = 0;
  }, [query]);

  // 選中的圖示要看得到（按「編輯」換成某個分類時，它的圖示可能在清單下方）；只捲框內，不捲整頁。
  // 被搜尋濾掉了 → 先清掉搜尋再捲。剛打開（新增分類）時從最上面的「飲食」開始看，不跳到預設圖示。
  const prevValue = useRef(value);
  const pendingReveal = useRef(false);
  useEffect(() => {
    if (prevValue.current !== value) { prevValue.current = value; pendingReveal.current = true; }
    if (!pendingReveal.current) return;
    if (!flat.includes(value)) {
      if (query) setQuery('');            // 清掉後 flat 會變，這段會再跑一次
      else pendingReveal.current = false; // 目錄裡沒有這個名稱（舊資料），不用捲
      return;
    }
    pendingReveal.current = false;
    const box = boxRef.current;
    const btn = box?.querySelector(`[data-icon="${value}"]`);
    if (!box || !btn) return;
    const head = btn.closest('.ip-group')?.querySelector('.ip-group-head');
    const headH = head ? head.offsetHeight : 0;
    const top = btn.offsetTop; // .ip-box 是 position: relative，offsetTop 就是框內位置
    if (top - headH < box.scrollTop) box.scrollTop = Math.max(0, top - headH - 4);
    else if (top + btn.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = top + btn.offsetHeight - box.clientHeight + 4;
    }
  }, [value, flat, query]);

  const moveFocus = (e) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key)) return;
    const btns = [...boxRef.current.querySelectorAll('.ip-cell')];
    const i = btns.indexOf(e.currentTarget);
    if (i < 0) return;
    e.preventDefault();
    let next = null;
    if (e.key === 'ArrowLeft') next = btns[i - 1];
    else if (e.key === 'ArrowRight') next = btns[i + 1];
    else {
      // 上下：找上一列／下一列裡水平位置最接近的那顆（各分組最後一列可能不滿）
      const cur = e.currentTarget.getBoundingClientRect();
      const cx = cur.left + cur.width / 2;
      const down = e.key === 'ArrowDown';
      const rows = btns
        .map(b => ({ b, r: b.getBoundingClientRect() }))
        .filter(({ r }) => (down ? r.top > cur.top + 2 : r.top < cur.top - 2));
      if (rows.length) {
        const rowTop = down ? Math.min(...rows.map(x => x.r.top)) : Math.max(...rows.map(x => x.r.top));
        const row = rows.filter(x => Math.abs(x.r.top - rowTop) < 2);
        next = row.reduce((best, x) =>
          Math.abs(x.r.left + x.r.width / 2 - cx) < Math.abs(best.r.left + best.r.width / 2 - cx) ? x : best).b;
      }
    }
    if (next) { next.focus(); next.scrollIntoView({ block: 'nearest' }); }
  };

  const onSearchKey = (e) => {
    if (e.key === 'Enter' && flat.length) { e.preventDefault(); onChange(flat[0]); }
    if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); }
  };

  return (
    <div className="ip">
      <div className="ip-search">
        <i className="fa-solid fa-magnifying-glass ip-search-icon" aria-hidden="true"></i>
        <input
          type="search"
          className="form-input ip-search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder="搜尋：咖啡、捷運、訂閱…"
          aria-label="搜尋圖示"
          enterKeyHint="search"
        />
        {query && (
          <button type="button" className="ip-search-clear" onClick={() => setQuery('')} aria-label="清除搜尋">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        )}
      </div>

      <div className="ip-box" ref={boxRef} role="group" aria-labelledby={labelId}>
        {groups.length === 0 ? (
          <div className="ip-empty">
            <p>{`找不到「${query.trim()}」的圖示`}</p>
            <button type="button" className="ip-empty-clear" onClick={() => setQuery('')}>看全部圖示</button>
          </div>
        ) : groups.map(g => (
          <section key={g.id} className="ip-group" aria-label={g.label}>
            <div className="ip-group-head" aria-hidden="true">{g.label}</div>
            <div className="ip-grid">
              {g.icons.map(i => {
                const on = i.name === value;
                return (
                  <button
                    key={i.name}
                    type="button"
                    className={`ip-cell${on ? ' is-on' : ''}`}
                    data-icon={i.name}
                    aria-label={i.label}
                    aria-pressed={on}
                    title={i.label}
                    tabIndex={i.name === tabStop ? 0 : -1}
                    onClick={() => onChange(i.name)}
                    onKeyDown={moveFocus}
                    style={on ? { background: color, color: iconColor } : undefined}
                  >
                    <IconRenderer name={i.name} size={20} />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
