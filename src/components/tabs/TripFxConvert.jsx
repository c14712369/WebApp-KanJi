import { useEffect, useState } from 'react';
import { fetchRateToTWD, formatForeign, currencyMeta, toTWD } from '../../lib/fx';
import { fmtMoney } from '../../lib/utils';

/**
 * 旅程 → 「換算成台幣」：列出這趟還沒換算的明細，勾選後依每筆當天匯率換成台幣。
 * Apple Pay 捷徑記的（把「¥3,200」記成 $3,200）預設勾；自己手記的可能本來就是台幣，不預設勾。
 * 實際寫入（快照、逐筆修改、復原）由 TripsView 負責，這裡只負責選與預覽。
 */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const dayLabel = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y) return '';
  return `${m}/${d}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
};
const rateKey = (it) => `${it.code}|${it.entry.date}`;

export default function TripFxConvertModal({ trip, items, onClose, onConfirm }) {
  const [selected, setSelected] = useState(() => new Set(items.filter(i => i.suggested).map(i => i.entry.id)));
  const [rates, setRates] = useState({});   // 'JPY|2026-11-15' → 匯率；抓不到是 null
  const [loading, setLoading] = useState(true);
  const cur = currencyMeta(trip.currency);

  // 每個「幣別＋日期」只抓一次（fx.js 另有永久快取，過去日期不會重抓）
  const keySig = [...new Set(items.map(rateKey))].sort().join(',');
  useEffect(() => {
    let alive = true;
    const keys = keySig ? keySig.split(',') : [];
    setLoading(true);
    Promise.all(keys.map(async (k) => {
      const [code, date] = k.split('|');
      return [k, await fetchRateToTWD(code, date)];
    })).then((pairs) => {
      if (!alive) return;
      setRates(Object.fromEntries(pairs));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [keySig]);

  const chosen = items.filter(it => selected.has(it.entry.id));
  const missing = chosen.filter(it => !(rates[rateKey(it)] > 0));
  const allOn = chosen.length === items.length;
  const totalAfter = chosen.reduce((s, it) => s + (toTWD(it.original, rates[rateKey(it)]) || 0), 0);
  // 預設勾了但被取消的 Apple Pay 筆 → 當作確認是台幣，之後不再提醒（後端待補匯率的一定是外幣，不算）
  const confirmTwd = items.filter(it => it.suggested && !it.entry.fxPending && !selected.has(it.entry.id));
  // 全部取消勾選也能送出：只把它們標成台幣（例如代刷、只是自己的份是台幣）
  const markOnly = chosen.length === 0 && confirmTwd.length > 0;
  const canSubmit = markOnly || (chosen.length > 0 && !loading && missing.length === 0);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(items.map(it => it.entry.id)));

  const submit = () => {
    if (!canSubmit) return;
    onConfirm(chosen, rates, confirmTwd);
  };

  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fx-item-modal tp-fx-modal" role="dialog" aria-modal="true" aria-labelledby="tpFxTitle" onPointerDown={e => e.stopPropagation()}>
        <div className="fx-item-head">
          <div className="settings-grabber" aria-hidden="true"></div>
          <div className="fx-item-head-row">
            <h3 id="tpFxTitle">換算成台幣</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>

        <div className="fx-item-body">
          <p className="fx-help tp-fx-intro">
            {`Apple Pay 記的${cur.name}被當成台幣，已幫你勾好；自己手記的請確認是${cur.name}再勾。`}
          </p>

          <div className="tp-fx-listhead">
            <span>
              已選 {chosen.length} / {items.length} 筆
              {chosen.length > 0 && !loading && missing.length === 0 && <span className="tp-fx-sum"> · 換算後 ${fmtMoney(totalAfter)}</span>}
            </span>
            <button type="button" className="tp-fx-all" onClick={toggleAll}>{allOn ? '全不選' : '全選'}</button>
          </div>

          <ul className="tp-fx-list">
            {items.map((it) => {
              const { entry } = it;
              const rate = rates[rateKey(it)];
              const after = toTWD(it.original, rate);
              const on = selected.has(entry.id);
              return (
                <li key={entry.id}>
                  <label className={`tp-fx-row${on ? ' is-on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(entry.id)} />
                    <span className="tp-fx-main">
                      <span className="tp-fx-title">{entry.note || '未命名'}</span>
                      <span className="tp-fx-sub">
                        {dayLabel(entry.date)}
                        {entry.fxPending
                          ? <span className="tp-fx-tag">匯率待補</span>
                          : it.suggested && <span className="tp-fx-tag">Apple Pay</span>}
                      </span>
                    </span>
                    <span className="tp-fx-amt">
                      <span className="tp-fx-twd">
                        {after !== null ? `$${fmtMoney(after)}` : loading ? '…' : '抓不到匯率'}
                      </span>
                      <span className="tp-fx-orig">{formatForeign(it.original, it.code)}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <p className="fx-help tp-fx-note">
            {`依每筆當天匯率換算，原本的${cur.name}金額會留著，換錯可以復原。沒勾的 Apple Pay 筆會當作台幣，不再提醒。`}
          </p>

          {!loading && missing.length > 0 && (
            <p className="fx-field-error" role="alert">
              {`有 ${missing.length} 筆抓不到當天匯率，請稍後再試或先取消勾選`}
            </p>
          )}
        </div>

        <div className="fx-item-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary fx-submit" onClick={submit} disabled={!canSubmit}>
            {markOnly
              ? <><i className="fa-solid fa-check" aria-hidden="true"></i> 標記為台幣</>
              : loading
                ? <><i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> 抓匯率中</>
                : <><i className="fa-solid fa-check" aria-hidden="true"></i> 換算成台幣</>}
          </button>
        </div>
      </div>
    </div>
  );
}
