import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore } from '../../store/appStore';
import { useLifeEntryActions } from '../../hooks/useLifeEntryActions';
import { useTripContext } from '../../hooks/useTripContext';
import { useTripActions } from '../../hooks/useTripActions';
import {
  summarizeTrip, sortTrips, formatTripRange, tripStatus, validateTrip, pendingEntries,
} from '../../lib/trips';
import { activeTripExclusions } from '../../lib/tripMerchants';
import { tripEntryDraft } from '../../lib/tripActions';
import { CURRENCIES, currencyMeta, formatForeign } from '../../lib/fx';
import { STAY_CATEGORY } from '../../lib/constants';
import { fmtMoney, showToast, confirmDialog, autoFocusDesktop } from '../../lib/utils';
import AnimatedNumber from '../../lib/AnimatedNumber';
import { unconvertedTripEntries, planFxConversion, fxRestorePatches, FX_CONVERT_MAX } from '../../lib/tripFx';
import EntrySheet from './EntrySheet';
import TripFxConvertModal from './TripFxConvert';
import TripEntriesSheet from './TripEntriesSheet';
import '../../entry-sheet.css';

/**
 * 分析 → 旅程：每趟一張卡（總花費、日均、分類拆解、外幣），可新增／編輯／刪除旅程。
 * 歸屬規則在 lib/trips.js：起訖日內的支出自動算進來；出發前先付的在記一筆時選旅程。
 * 明細不展開在卡片裡（多了頁面會超長）：點分類或「全部明細」開明細抽屜，
 * 抽屜裡點一筆就開跟生活頁同一個編輯抽屜。
 */

const FX_SNAPSHOT_KEY = 'sub_mgr_fx_convert_snapshots'; // 換算前快照（保留最近 5 次，手動救資料用）

/** 換算前把原始明細存一份；寫不進去就回傳 false，呼叫端不做換算 */
function saveFxSnapshot(trip, before) {
  try {
    const list = JSON.parse(localStorage.getItem(FX_SNAPSHOT_KEY) || '[]');
    list.unshift({ ts: Date.now(), tripId: trip.id, tripName: trip.name, entries: before });
    localStorage.setItem(FX_SNAPSHOT_KEY, JSON.stringify(list.slice(0, 5)));
    return true;
  } catch {
    return false;
  }
}
const pad2 = (n) => String(n).padStart(2, '0');
const toIso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function CurrencyOptions() {
  return (
    <>
      <optgroup label="常用">
        {CURRENCIES.filter(c => c.common).map(c => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
      </optgroup>
      <optgroup label="其他">
        {CURRENCIES.filter(c => !c.common).map(c => <option key={c.code} value={c.code}>{c.code} {c.name}</option>)}
      </optgroup>
    </>
  );
}

// ── 新增／編輯旅程 ───────────────────────────────────────────────────────────
function TripModal({ initial, onClose, onSave, onDelete }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(() => initial || { name: '', startDate: toIso(new Date()), endDate: toIso(new Date()), currency: 'JPY' });
  const [errors, setErrors] = useState({});
  const [shake, setShake] = useState(false);

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      // 出發日移到回程之後 → 回程跟著移，不必再改一次
      if (k === 'startDate' && v && next.endDate && next.endDate < v) next.endDate = v;
      return next;
    });
    setErrors(e => (e[k] ? { ...e, [k]: undefined } : e));
  };

  const submit = (ev) => {
    ev.preventDefault();
    const e = validateTrip(form);
    if (Object.keys(e).length) {
      setErrors(e);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    onSave({ ...form, name: form.name.trim() });
  };

  const err = (k) => errors[k] && <span className="fx-field-error" id={`tp-err-${k}`} role="alert">{errors[k]}</span>;
  const invalid = (k) => (errors[k] ? { 'aria-invalid': true, 'aria-describedby': `tp-err-${k}` } : {});

  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal fx-item-modal${shake ? ' shake' : ''}`} role="dialog" aria-modal="true" aria-labelledby="tpModalTitle" onPointerDown={e => e.stopPropagation()}>
        <div className="fx-item-head">
          <div className="settings-grabber" aria-hidden="true"></div>
          <div className="fx-item-head-row">
            <h3 id="tpModalTitle">{isEdit ? '編輯旅程' : '新增旅程'}</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>

        <form onSubmit={submit} noValidate className="fx-item-form">
          <div className="fx-item-body">
            {/* 名稱（長）＋幣別（短）同一列 */}
            <div className="tp-grid-name">
              <div className="form-group">
                <label className="form-label" htmlFor="tpName">名稱</label>
                <input id="tpName" className="form-input" value={form.name} onChange={e => set('name', e.target.value)}
                  placeholder="例如：東京賞楓" autoFocus={autoFocusDesktop} {...invalid('name')} />
                {err('name')}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="tpCur">幣別</label>
                <select id="tpCur" className="form-select" value={form.currency} onChange={e => set('currency', e.target.value)}>
                  <CurrencyOptions />
                </select>
              </div>
            </div>

            <div className="fx-grid-2">
              <div className="form-group">
                <label className="form-label" htmlFor="tpStart">出發</label>
                <input id="tpStart" className="form-input" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} {...invalid('startDate')} />
                {err('startDate')}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="tpEnd">回程</label>
                <input id="tpEnd" className="form-input" type="date" value={form.endDate} min={form.startDate || undefined}
                  onChange={e => set('endDate', e.target.value)} {...invalid('endDate')} />
                {err('endDate')}
              </div>
            </div>

            <p className="fx-help">
              {`這幾天記的支出會自動算進這趟（刷卡匯入的也算），記帳時也會自動切成${currencyMeta(form.currency).name}。出發前先付的住宿、機票，記帳時在金額左上角選這趟旅程。`}
            </p>
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

// ── 例外商家管理 ─────────────────────────────────────────────────────────────
function TripExclusionsModal({ items, onRemove, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay active settings-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal fx-item-modal" role="dialog" aria-modal="true" aria-labelledby="tpExclTitle" onPointerDown={e => e.stopPropagation()}>
        <div className="fx-item-head">
          <div className="settings-grabber" aria-hidden="true"></div>
          <div className="fx-item-head-row">
            <h3 id="tpExclTitle">旅程例外商家</h3>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="關閉"><i className="fa-solid fa-xmark"></i></button>
          </div>
        </div>

        <div className="fx-item-body">
          <p className="fx-help tp-fx-intro">旅程期間在這些店的台幣消費算日常</p>
          {items.length === 0 ? (
            <p className="tp-empty-note">目前沒有例外商家</p>
          ) : (
            <ul className="tp-excl-list">
              {items.map(it => (
                <li key={it.key} className="tp-excl-row">
                  <span className="tp-excl-label">{it.label}</span>
                  <button type="button" className="btn btn-ghost btn-sm tp-excl-remove" onClick={() => onRemove(it.key)}>移除</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="fx-item-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}

// ── 一趟旅程的卡片 ───────────────────────────────────────────────────────────
function TripCard({ trip, summary, today, onEdit, onAddEntry, onOpenEntries, pendingCount = 0, fxItems, fxDone, onOpenFx, onUndoFx }) {
  const status = tripStatus(trip, today);
  const cur = currencyMeta(trip.currency || 'TWD');
  // 只有 Apple Pay 列（或後端待補匯率的）才提醒；只剩手記列時不吵，要換到明細裡一筆筆改
  const fxSuggested = fxItems.filter(it => it.suggested).length;

  return (
    <article className="an-card tp-card">
      <div className="tp-card-head">
        <div className="tp-card-titles">
          <h3 className="tp-card-name">
            <i className="fa-solid fa-plane" aria-hidden="true"></i>
            <span>{trip.name}</span>
          </h3>
          <p className="tp-card-meta">
            {formatTripRange(trip)} · {summary.days} 天 · {cur.name}
            {status.kind === 'ongoing' && <span className="tp-badge is-live">進行中・第 {status.day} 天</span>}
            {status.kind === 'upcoming' && <span className="tp-badge">還有 {status.daysUntil} 天</span>}
          </p>
        </div>
        <div className="tp-card-actions">
          <button type="button" className="btn btn-ghost btn-sm tp-card-add" onClick={onAddEntry}>
            <i className="fa-solid fa-plus" aria-hidden="true"></i> 記一筆
          </button>
          <button type="button" className="icon-btn tp-edit" onClick={onEdit} aria-label={`編輯旅程「${trip.name}」`}>
            <i className="fa-solid fa-pen" aria-hidden="true"></i>
          </button>
        </div>
      </div>

      {/* 外幣換算提醒：總花費在換算前是錯的，所以放在總花費上面 */}
      {fxDone ? (
        <div className="tp-hint tp-fx-hint is-done" role="status">
          <span className="tp-hint-icon tp-fx-hint-icon is-done" aria-hidden="true"><i className="fa-solid fa-check"></i></span>
          <p className="tp-hint-text">
            <strong>{fxDone.count ? `已換算 ${fxDone.count} 筆` : '已標記為台幣'}</strong>
            <span>{fxDone.count ? '總花費已改用台幣計算' : '這幾筆之後不再提醒'}</span>
          </p>
          <button type="button" className="btn btn-ghost tp-hint-btn" onClick={onUndoFx}>復原</button>
        </div>
      ) : fxSuggested > 0 && (
        <div className="tp-hint tp-fx-hint">
          <span className="tp-hint-icon tp-fx-hint-icon" aria-hidden="true">{cur.symbol.trim()}</span>
          <p className="tp-hint-text">
            <strong>{fxSuggested} 筆還是{cur.name}金額</strong>
            <span>總花費還不準</span>
          </p>
          <button type="button" className="btn btn-ghost tp-hint-btn" onClick={onOpenFx}>換算</button>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="tp-hint tp-fx-hint tp-pending-hint">
          <span className="tp-hint-icon tp-pending-hint-icon" aria-hidden="true">
            <i className="fa-solid fa-circle-question"></i>
          </span>
          <p className="tp-hint-text">
            <strong>{pendingCount} 筆刷卡待確認</strong>
            <span>旅程期間的台幣刷卡，是旅費嗎？</span>
          </p>
          <button type="button" className="btn btn-ghost tp-hint-btn" onClick={() => onOpenEntries(null)}>確認</button>
        </div>
      )}

      <div className="tp-total">
        <span className="tp-total-label">總花費</span>
        <span className="tp-total-value">$<AnimatedNumber value={summary.total} format={fmtMoney} /></span>
      </div>

      <dl className="tp-stats">
        <div><dt>日均</dt><dd>${fmtMoney(summary.perDay)}</dd></div>
        <div><dt>筆數</dt><dd>{summary.count}</dd></div>
        {summary.foreign.map(f => (
          <div key={f.code}><dt>{currencyMeta(f.code).name}支出</dt><dd>{formatForeign(f.original, f.code)}</dd></div>
        ))}
      </dl>

      {summary.count === 0 ? (
        <p className="tp-empty-note">
          還沒有明細。記帳時日期選在 {formatTripRange(trip)} 之間，就會自動算進這趟。
        </p>
      ) : (
        <>
          {/* 分類比例：一條堆疊長條＋圖例（金額、占比） */}
          <div className="tp-bar" role="img" aria-label={summary.byCategory.map(c => `${c.name} ${c.pct}%`).join('、')}>
            {summary.byCategory.map(c => (
              <span key={c.id} style={{ flexGrow: c.amount, background: c.color }} />
            ))}
          </div>
          {/* 分類列點一下 → 明細抽屜只看該分類；明細不展開在卡片裡，頁面不會被撐長 */}
          <ul className="tp-cats">
            {summary.byCategory.map(c => (
              <li key={c.id}>
                <button type="button" className="tp-cat-row" onClick={() => onOpenEntries(c.id)} aria-label={`只看${c.name}的明細，${c.pct}%，${fmtMoney(c.amount)} 元`}>
                  <span className="tp-cat-dot" style={{ background: c.color }} aria-hidden="true" />
                  <span className="tp-cat-name">{c.name}</span>
                  <span className="tp-cat-pct">{c.pct}%</span>
                  <span className="tp-cat-amt">${fmtMoney(c.amount)}</span>
                  <i className="fa-solid fa-chevron-right tp-cat-go" aria-hidden="true"></i>
                </button>
              </li>
            ))}
          </ul>

          <button type="button" className="tp-all-entries" onClick={() => onOpenEntries(null)}>
            <span>全部明細</span>
            <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
        </>
      )}
    </article>
  );
}

// ── 主畫面 ───────────────────────────────────────────────────────────────────
export default function TripsView() {
  const {
    trips, lifeExpenses, lifeCategories, lifeIncomeCategories, paymentMethods, tripExcludeMerchants,
    addTrip, updateTrip, removeTrip, setLifeCategories, patchLifeExpenses, setTripExclusion,
  } = useAppStore();
  const [fxTripId, setFxTripId] = useState(null); // 開著「換算成台幣」的那趟
  const [fxDone, setFxDone] = useState({});       // tripId → { count, before }：剛換算完，可復原
  const [modal, setModal] = useState(null); // null | {} 新增 | trip 編輯
  const [editingEntry, setEditingEntry] = useState(null); // 正在編輯的明細（開記一筆抽屜）
  const [justSavedId, setJustSavedId] = useState(null);   // 剛改完的那筆閃一下
  const [entriesSheet, setEntriesSheet] = useState(null); // 明細抽屜：{ tripId, catId }（catId null＝全部）
  const [excludeModalOpen, setExcludeModalOpen] = useState(false);
  const { saveEntry, deleteEntry } = useLifeEntryActions();
  const { decide } = useTripActions();
  const tripCtx = useTripContext();
  const today = toIso(new Date());

  useEffect(() => {
    if (!justSavedId) return;
    const t = setTimeout(() => setJustSavedId(null), 1600);
    return () => clearTimeout(t);
  }, [justSavedId]);

  const openEntry = (entry) => { if (navigator.vibrate) navigator.vibrate(50); setEditingEntry(entry); };
  const saveEditedEntry = (entry) => {
    saveEntry(entry);
    setJustSavedId(entry.id);
    setEditingEntry(null);
  };

  const list = useMemo(() => sortTrips(trips).map(t => ({
    trip: t,
    summary: summarizeTrip(t, lifeExpenses, trips, lifeCategories, tripCtx),
    fxItems: unconvertedTripEntries(t, lifeExpenses, trips, tripCtx),
    pending: pendingEntries(t, lifeExpenses, trips, tripCtx),
  })), [trips, lifeExpenses, lifeCategories, tripCtx]);
  const exclusions = useMemo(() => activeTripExclusions(tripExcludeMerchants), [tripExcludeMerchants]);
  const fxOpen = fxTripId ? list.find(x => x.trip.id === fxTripId) : null;
  const sheetOpen = entriesSheet ? list.find(x => x.trip.id === entriesSheet.tripId) : null;

  // 換算：快照 → log → 逐筆修改（同一次存檔）→ 卡片顯示「已換算・復原」
  const confirmFx = (trip, chosen, rates, confirmTwd) => {
    const plan = planFxConversion(chosen, rates, { confirmTwd });
    if (plan.tooMany) { showToast(`一次最多換算 ${FX_CONVERT_MAX} 筆，請分次勾選`, 'error'); return; }
    if (plan.missingDates.length) { showToast(`${plan.missingDates.length} 天抓不到匯率，請稍後再試`, 'error'); return; }
    if (!plan.patches.length) { setFxTripId(null); return; }

    const ids = new Set(plan.patches.map(p => p.id));
    const before = useAppStore.getState().lifeExpenses.filter(e => ids.has(e.id)).map(e => ({ ...e }));
    if (!saveFxSnapshot(trip, before)) { showToast('存不了換算前的備份，先不換算', 'error'); return; }
    console.info(`[旅程換算] ${trip.name}：修改 ${before.length} 筆`, before.map(e => `${e.date} ${e.note || ''} $${e.amount}`));

    patchLifeExpenses(plan.patches);
    setFxDone(d => ({ ...d, [trip.id]: { count: chosen.length, before } }));
    setFxTripId(null);
    showToast(chosen.length ? `已換算 ${chosen.length} 筆` : '已標記為台幣');
  };

  const undoFx = (trip) => {
    const done = fxDone[trip.id];
    if (!done) return;
    console.info(`[旅程換算] ${trip.name}：復原 ${done.before.length} 筆`);
    patchLifeExpenses(fxRestorePatches(done.before));
    setFxDone(d => { const next = { ...d }; delete next[trip.id]; return next; });
    showToast('已復原');
  };

  const hasStay = lifeCategories.some(c => c.name === '住宿');

  const addStayCategory = () => {
    const cats = useAppStore.getState().lifeCategories;
    if (cats.some(c => c.name === '住宿')) return;
    const id = cats.some(c => c.id === STAY_CATEGORY.id) ? `lc_stay_${Date.now()}` : STAY_CATEGORY.id;
    const stay = { ...STAY_CATEGORY, id };
    // 放在「其他」前面，記帳分類格裡跟其他常用分類排在一起
    const otherIdx = cats.findIndex(c => c.name === '其他');
    const next = otherIdx >= 0 ? [...cats.slice(0, otherIdx), stay, ...cats.slice(otherIdx)] : [...cats, stay];
    setLifeCategories(next);
    showToast('已新增「住宿」分類');
  };

  const save = (form) => {
    if (form.id) {
      updateTrip(form.id, form);
      showToast('旅程已更新');
    } else {
      addTrip({ ...form, id: `trip_${crypto.randomUUID()}`, createdAt: Date.now() });
      showToast(`已新增「${form.name}」`);
    }
    setModal(null);
  };

  const remove = async (trip) => {
    const ok = await confirmDialog({
      title: `刪除「${trip.name}」？`,
      message: '只刪除這趟旅程，明細不會刪掉；原本算在這趟的支出會變回一般支出。',
      confirmText: '刪除旅程',
    });
    if (!ok) return;
    removeTrip(trip.id);
    setModal(null);
    showToast('旅程已刪除');
  };

  return (
    <div className="tp-page">
      <div className="tp-head">
        <p className="tp-intro">旅程期間的支出會自動算進來</p>
        <button type="button" className="btn btn-primary tp-add" onClick={() => setModal({})}>
          <i className="fa-solid fa-plus" aria-hidden="true"></i> 新增旅程
        </button>
      </div>

      {!hasStay && (
        <div className="tp-hint">
          <span className="tp-hint-icon" style={{ background: STAY_CATEGORY.color }} aria-hidden="true">
            <i className="fa-solid fa-bed"></i>
          </span>
          <p className="tp-hint-text"><strong>加一個「住宿」分類</strong><span>不用再塞進「其他」</span></p>
          <button type="button" className="btn btn-ghost tp-hint-btn" onClick={addStayCategory}>新增分類</button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="an-card tp-empty">
          <span className="tp-empty-icon" aria-hidden="true"><i className="fa-solid fa-plane-departure"></i></span>
          <h3>還沒有旅程</h3>
          <p>建立一趟旅程（例如 11/14–11/22 東京），那幾天記的帳就會自動歸進來，還能看總花費、日均和住宿占多少。</p>
          <button type="button" className="btn btn-primary" onClick={() => setModal({})}>
            <i className="fa-solid fa-plus" aria-hidden="true"></i> 建立第一趟旅程
          </button>
        </div>
      ) : (
        list.map(({ trip, summary, fxItems, pending }) => (
          <TripCard
            key={trip.id}
            trip={trip}
            summary={summary}
            today={today}
            pendingCount={pending.length}
            fxItems={fxItems}
            fxDone={fxDone[trip.id]}
            onOpenFx={() => setFxTripId(trip.id)}
            onUndoFx={() => undoFx(trip)}
            onEdit={() => setModal(trip)}
            onAddEntry={() => openEntry(tripEntryDraft(trip, today))}
            onOpenEntries={(catId) => { if (navigator.vibrate) navigator.vibrate(20); setEntriesSheet({ tripId: trip.id, catId }); }}
          />
        ))
      )}

      {exclusions.length > 0 && (
        <button type="button" className="an-card tp-exclude-entry" onClick={() => setExcludeModalOpen(true)}>
          <span>旅程例外商家（{exclusions.length}）</span>
          <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      )}

      {/* 明細抽屜（層級在記一筆抽屜下面，點明細編輯時疊在上面） */}
      <AnimatePresence>
        {sheetOpen && (
          <TripEntriesSheet
            key={`trip-entries-${sheetOpen.trip.id}`}
            trip={sheetOpen.trip}
            summary={sheetOpen.summary}
            pending={sheetOpen.pending}
            initialCatId={entriesSheet.catId}
            onClose={() => setEntriesSheet(null)}
            onEditEntry={openEntry}
            onDecide={(e, d) => decide(e, sheetOpen.trip, d)}
            onAddEntry={() => openEntry(tripEntryDraft(sheetOpen.trip, today))}
            justSavedId={justSavedId}
            entrySheetOpen={!!editingEntry}
            lifeCategories={lifeCategories}
            lifeIncomeCategories={lifeIncomeCategories}
            paymentMethods={paymentMethods}
          />
        )}
      </AnimatePresence>

      {excludeModalOpen && (
        <TripExclusionsModal
          items={exclusions}
          onRemove={(key) => setTripExclusion(key, false)}
          onClose={() => setExcludeModalOpen(false)}
        />
      )}

      {modal && (
        <TripModal
          initial={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={save}
          onDelete={modal.id ? () => remove(modal) : undefined}
        />
      )}

      {fxOpen && fxOpen.fxItems.length > 0 && (
        <TripFxConvertModal
          trip={fxOpen.trip}
          items={fxOpen.fxItems}
          onClose={() => setFxTripId(null)}
          onConfirm={(chosen, rates, confirmTwd) => confirmFx(fxOpen.trip, chosen, rates, confirmTwd)}
        />
      )}

      {/* 明細編輯：跟生活頁同一個抽屜、同一套存檔規則 */}
      <AnimatePresence>
        {editingEntry && (
          <EntrySheet
            key="entry-sheet"
            lifeCategories={lifeCategories}
            lifeIncomeCategories={lifeIncomeCategories}
            paymentMethods={paymentMethods}
            trips={trips}
            currentMonth={(editingEntry.date || '').slice(0, 7)}
            initial={editingEntry}
            onClose={() => setEditingEntry(null)}
            onSave={saveEditedEntry}
            onDelete={async (id) => { if (await deleteEntry(id)) setEditingEntry(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
