/**
 * 記帳明細「依日期分組」與「分頁時整天不切斷」邏輯（純函式，零依賴，可單元測試）。
 */
import { entryTripId } from './trips.js';

/**
 * 將已過濾、已排序的明細依日期分組（保留原排序）。
 * @param {Array} entries
 * @returns {Array<{date:string, entries:Array, total:number}>} total 為當日支出合計（不含收入）
 */
export function groupEntriesByDay(entries = []) {
  const arr = Array.isArray(entries) ? entries : [];
  const order = [];
  const map = {};
  for (const e of arr) {
    const d = (e && e.date) || '';
    if (!map[d]) { map[d] = { date: d, entries: [], total: 0, incomeTotal: 0, expenseCount: 0, incomeCount: 0 }; order.push(d); }
    map[d].entries.push(e);
    // total 維持「當日支出」（既有語意）；收入另計，只有收入的日子才不會顯示「合計 $0」
    // 筆數另計：同類只有 1 筆時合計等於那筆金額，畫面上不重複顯示
    if (e && e.type !== 'income') { map[d].total += (Number(e.amount) || 0); map[d].expenseCount += 1; }
    else if (e) { map[d].incomeTotal += (Number(e.amount) || 0); map[d].incomeCount += 1; }
  }
  return order.map(d => map[d]);
}

/**
 * 備註分群鍵：去掉開頭的 [卡名] 標籤後取第一個詞（半形/全形空白分隔），不分大小寫。
 * 「伴手禮 小老闆」「伴手禮 芒果乾」→ 都是「伴手禮」。
 */
export function noteGroupKey(note) {
  const s = String(note || '').replace(/^\s*\[[^\]]*\]\s*/, '').trim();
  return (s.split(/[\s　]+/)[0] || '').toLowerCase();
}

/**
 * 明細排序：日期（dir）→ 同日收入在前 → 分類設定順序 → 同分類內「備註同群的黏在一起」，
 * 群組依該群最大一筆金額由大到小，群內也由大到小。不改動輸入陣列。
 * @param {Array} entries
 * @param {{catOrder?: Object<string, number>, dir?: 'asc'|'desc'}} opts
 */
export function sortEntries(entries = [], { catOrder = {}, dir = 'desc' } = {}) {
  const arr = Array.isArray(entries) ? entries : [];
  const amt = e => Number(e.amount) || 0;
  const groupId = e => `${e.date}|${e.type}|${e.categoryId}|${noteGroupKey(e.note)}`;
  const groupMax = {};
  for (const e of arr) {
    const g = groupId(e);
    groupMax[g] = Math.max(groupMax[g] ?? -Infinity, amt(e));
  }
  const sign = dir === 'asc' ? 1 : -1;
  return arr.slice().sort((a, b) =>
    sign * (a.date || '').localeCompare(b.date || '')
    || ((a.type === 'income' ? 0 : 1) - (b.type === 'income' ? 0 : 1))
    || ((catOrder[a.categoryId] ?? 1e9) - (catOrder[b.categoryId] ?? 1e9))
    || (groupMax[groupId(b)] - groupMax[groupId(a)])
    || noteGroupKey(a.note).localeCompare(noteGroupKey(b.note))
    || (amt(b) - amt(a))
    || (a.id || '').localeCompare(b.id || '')
  );
}

/**
 * 以「日」為單位分頁：每頁累積到接近 targetSize 筆就換頁，但同一天的明細永不跨頁。
 * @param {Array} groups - groupEntriesByDay 的結果
 * @param {number} page - 1-based
 * @param {number} targetSize - 每頁目標明細筆數
 * @returns {{totalPages:number, pageGroups:Array}}
 */
export function paginateGroups(groups = [], page = 1, targetSize = 20) {
  const pages = buildPages(groups, targetSize);
  return { totalPages: pages.length || 1, pageGroups: pages[page - 1] || [] };
}

/**
 * 某筆明細落在第幾頁（1-based，規則同 paginateGroups）；不在清單內回 null。
 * 存檔後用來跳到那筆：補記幾天前的帳，常被排到第 2 頁，停在第 1 頁看起來像沒存到。
 */
export function findEntryPage(groups = [], entryId, targetSize = 20) {
  const pages = buildPages(groups, targetSize);
  const i = pages.findIndex(p => p.some(g => (g.entries || []).some(e => e && e.id === entryId)));
  return i === -1 ? null : i + 1;
}

function buildPages(groups, targetSize) {
  const arr = Array.isArray(groups) ? groups : [];
  const pages = [];
  let cur = [], count = 0;
  for (const g of arr) {
    const n = (g.entries && g.entries.length) || 0;
    if (cur.length > 0 && count + n > targetSize) {
      pages.push(cur); cur = []; count = 0;
    }
    cur.push(g);
    count += n;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/**
 * 建立當月日曆網格資料結構（純函式，防範 UTC 偏移，排除折抵回饋金）。
 * @param {string} ym - 格式 'YYYY-MM'
 * @param {Array} entries - 當月明細列表
 * @returns {{paddingDays: number, days: Array<{date: string, day: number, entries: Array, hasExpense: boolean, hasIncome: boolean, totalExpense: number, totalIncome: number}>}}
 */
export function buildMonthCalendar(ym, entries = []) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return { paddingDays: 0, days: [] };
  const [yearStr, monthStr] = ym.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // 防範 UTC 飄移：以本地年、月數值計算
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0: 週日 ~ 6: 週六

  const dayMap = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
    dayMap[dateStr] = {
      date: dateStr,
      day: d,
      entries: [],
      hasExpense: false,
      hasIncome: false,
      totalExpense: 0,
      totalIncome: 0,
    };
  }

  const arr = Array.isArray(entries) ? entries : [];
  for (const e of arr) {
    if (!e || !e.date || !dayMap[e.date]) continue;
    const item = dayMap[e.date];
    item.entries.push(e);
    const amt = Number(e.amount) || 0;
    if (e.type === 'income') {
      // 排除信用卡回饋金折抵，避免虛擬收入綠點
      if (!e._linkedExpenseId) {
        item.hasIncome = true;
        item.totalIncome += amt;
      }
    } else {
      item.hasExpense = true;
      item.totalExpense += amt;
    }
  }

  return {
    paddingDays: firstDayOfWeek,
    days: Object.values(dayMap),
  };
}

/**
 * 同一家店備註大小寫不一（刷卡匯入「7-ELEVEN」、手記或捷徑「7-Eleven」）時統一顯示。
 * 回傳 Map：小寫鍵 → 顯示用寫法。優先取非全大寫的寫法（較好讀），同級取出現最多次；
 * 只有一種寫法就原樣（IKEA 不會變 Ikea）。只影響顯示，不改資料。
 */
export function noteDisplayMap(entries = []) {
  const arr = Array.isArray(entries) ? entries : [];
  const variants = new Map(); // key → Map(寫法 → 次數)
  for (const e of arr) {
    const note = String((e && e.note) || '').trim();
    if (!note) continue;
    const key = note.toLowerCase();
    if (!variants.has(key)) variants.set(key, new Map());
    const v = variants.get(key);
    v.set(note, (v.get(note) || 0) + 1);
  }
  const isAllCaps = (s) => /[A-Z]/.test(s) && s === s.toUpperCase();
  const out = new Map();
  for (const [key, v] of variants) {
    const best = [...v.entries()].sort((a, b) => {
      const capsDiff = Number(isAllCaps(a[0])) - Number(isAllCaps(b[0]));
      return capsDiff !== 0 ? capsDiff : b[1] - a[1];
    })[0][0];
    out.set(key, best);
  }
  return out;
}

/**
 * 月曆收合成單週時，計算總列數與焦點日期所在列（0 起算）。
 * 焦點日期不在本月或為空時回到第一列。
 */
export function calendarFocusRow({ paddingDays = 0, days = [] } = {}, focusDate) {
  const rows = Math.max(1, Math.ceil((paddingDays + days.length) / 7));
  const idx = focusDate ? days.findIndex(d => d.date === focusDate) : -1;
  const row = idx < 0 ? 0 : Math.floor((paddingDays + idx) / 7);
  return { rows, row };
}

/**
 * 將日常清單裡歸屬旅程的支出收成「每天每趟一筆」合成列（不改動輸入陣列）。
 * 合成列放在該組第一筆原本的位置；待確認帳單列與收入原樣保留。
 */
export function collapseTripEntries(entries = [], trips = [], ctx = {}) {
  const arr = Array.isArray(entries) ? entries : [];
  const tripNames = new Map((Array.isArray(trips) ? trips : []).filter(Boolean).map(t => [t.id, t.name || '旅程']));
  const out = [];
  const groups = new Map();
  for (const e of arr) {
    if (!e || e._tripDay || e.type === 'income') {
      out.push(e);
      continue;
    }
    const tid = entryTripId(e, trips, ctx);
    if (!tid) {
      out.push(e);
      continue;
    }
    const date = e.date || '';
    const key = `${tid}\0${date}`;
    const existing = groups.get(key);
    if (existing) {
      existing.amount += Number(e.amount) || 0;
      existing.count += 1;
    } else {
      const row = {
        id: `tripday_${tid}_${date}`,
        _tripDay: true,
        tripId: tid,
        date,
        type: 'expense',
        amount: Number(e.amount) || 0,
        count: 1,
        note: tripNames.get(tid) || '旅程',
      };
      groups.set(key, row);
      out.push(row);
    }
  }
  return out;
}

