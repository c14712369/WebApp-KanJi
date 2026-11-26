# 幫大家付 Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支出可標「幫大家付」（均分 N 人／自填我的份），所有花費統計只算使用者自己的份；旅程可設人數。

**Architecture:** 有效花費集中在新檔 `src/lib/share.js` 的 `spendOf(entry, ctx)`，所有加總改呼叫它；`amount` 永不更動。畫面：旅程設定加人數、記一筆加三段切換、清單列顯示我的份。GAS 帶走欄位加 `splitN`、`myShare`。

**Tech Stack:** React + Vite、自訂 node 測試（`node src/lib/<檔>.test.mjs`）、GAS（`node test/livesync.test.js`、`node test_parsers.js`）。

**Spec:** `docs/superpowers/specs/2026-11-27-shared-payment-design.md`

## Global Constraints

- 繁中 UI／commit；分支 `feat/shared-payment`；改既有檔先備份 `.backup.<時間戳>`。
- `amount` 永遠是實付台幣，任何地方都不能為了「我的份」改它。
- `splitN` 與 `myShare` 擇一；設其中一個時要刪掉另一個（用 `undefined`，JSON 會丟掉）。只對支出（`type !== 'income'`）。
- UI：短控制併排、操作列不放數值、切換狀態容器尺寸不變（`~/.claude/ops/ref-ui-code-standards.md`）。

## Review Focus

1. KKday $8,950 ÷ 6 → 旅程總額、本月支出、分類、月曆當日小計都只加 $1,491.67（顯示 $1,492）。
2. Grab 設自填 $0 後，它的國外交易服務費也變 $0（跟著比例）。
3. 外幣換算（`patchLifeExpenses` 改 `amount`）之後，均分的那筆我的份跟著變；自填的不變。
4. 改成「不是」後，`splitN`、`myShare` 都消失，回到全額。
5. Apple Pay 那筆設了均分，被帳單取代後仍是均分（GAS 帶走欄位）。

---

### Task 1：`src/lib/share.js`（純函式）

**Files:** Create `src/lib/share.js`、`src/lib/share.test.mjs`

**Interfaces（Produces）：**
- `spendOf(entry, ctx = {}): number`：照設計「有效花費」4 條（收入回傳 `Number(amount)||0`，不套用分攤）。服務費比例用 `ctx.byId`（同 `getTripContext` 產生的 Map）。
- `isShared(entry): boolean`：有 `myShare`（數字）或 `splitN ≥ 2`。
- `shareLabel(entry): string`：均分 →「幫大家付 $8,950 ÷ 6」；自填 →「幫大家付 $8,950 · 我的份」；否則 ''。金額用 `fmtMoney` 同格式（千分位、整數）。
- `sharePatch(mode, { n, myShare }): object`：`'none'` → `{ splitN: undefined, myShare: undefined }`；`'split'` → `{ splitN: n, myShare: undefined }`（n 取整、至少 2）；`'fixed'` → `{ myShare: 非負數, splitN: undefined }`。
- `bulkShareTargets(entry, entries, trips, ctx = {}): entry[]`：同一趟（`entryTripId` 相同且不為 null）、同一家（`tripMerchantKey(note)` 相同且非空）、`id` 不同、支出、不是服務費（無 `feeOf` 且 note 不含「國外交易服務費」）、還沒設過（`!isShared`）的列。

- [ ] **Step 1：寫測試**
```js
const T = [{ id: 't_th', name: '泰國', startDate: '2026-10-14', endDate: '2026-10-19', currency: 'THB', groupSize: 6 }];
test('均分 ÷6', () => assert.equal(spendOf({ type: 'expense', amount: 8950, splitN: 6 }), 8950 / 6));
test('自填 0', () => assert.equal(spendOf({ type: 'expense', amount: 166, myShare: 0 }), 0));
test('一般消費＝全額', () => assert.equal(spendOf({ type: 'expense', amount: 120 }), 120));
test('收入不套分攤', () => assert.equal(spendOf({ type: 'income', amount: 500, splitN: 2 }), 500));
test('服務費跟著交易比例', () => {
  const g = { id: 'gmail_g', type: 'expense', amount: 166, myShare: 0 };
  const f = { id: 'gmail_f', type: 'expense', amount: 3, feeOf: 'gmail_g' };
  const k = { id: 'gmail_k', type: 'expense', amount: 600, splitN: 6 };
  const fk = { id: 'gmail_fk', type: 'expense', amount: 12, feeOf: 'gmail_k' };
  const byId = new Map([g, f, k, fk].map(e => [e.id, e]));
  assert.equal(spendOf(f, { byId }), 0); assert.equal(spendOf(fk, { byId }), 2);
  assert.equal(spendOf(fk), 12);   // 沒有 byId 時全額
});
test('換算後均分跟著變', () => assert.equal(spendOf({ type: 'expense', amount: 1200, splitN: 6 }), 200));
test('標籤', () => {
  assert.equal(shareLabel({ amount: 8950, splitN: 6 }), '幫大家付 $8,950 ÷ 6');
  assert.equal(shareLabel({ amount: 166, myShare: 0 }), '幫大家付 $166 · 我的份');
  assert.equal(shareLabel({ amount: 166 }), '');
});
test('sharePatch 互斥', () => {
  assert.deepEqual(sharePatch('split', { n: 6 }), { splitN: 6, myShare: undefined });
  assert.deepEqual(sharePatch('fixed', { myShare: 320 }), { myShare: 320, splitN: undefined });
  assert.deepEqual(sharePatch('none', {}), { splitN: undefined, myShare: undefined });
  assert.equal(sharePatch('split', { n: 1 }).splitN, 2);
});
test('批次套用：同一趟同一家、還沒設過、不含服務費與自己', () => {
  const es = [
    { id: 'gmail_1', type: 'expense', amount: 166, date: '2026-10-15', note: '[台新] WWW.GRAB.COMBANGKO', tripId: 't_th', myShare: 0 },
    { id: 'gmail_2', type: 'expense', amount: 144, date: '2026-10-15', note: '[台新] WWW.GRAB.COMBANGKO', tripId: 't_th' },
    { id: 'gmail_3', type: 'expense', amount: 3206, date: '2026-10-16', note: '[台新] WWW.GRAB.COMBANGKO', tripId: 't_th' },
    { id: 'gmail_4', type: 'expense', amount: 3, date: '2026-10-15', note: '[台新] 國外交易服務費', tripId: 't_th', feeOf: 'gmail_2' },
    { id: 'gmail_5', type: 'expense', amount: 75, date: '2026-10-25', note: '[台新] WWW.GRAB.COMBANGKO' },
    { id: 'gmail_6', type: 'expense', amount: 50, date: '2026-10-16', note: '[台新] WWW.GRAB.COMBANGKO', tripId: 't_th', splitN: 3 },
  ];
  assert.deepEqual(bulkShareTargets(es[0], es, T).map(e => e.id), ['gmail_2', 'gmail_3']);
});
```
- [ ] **Step 2**：`node src/lib/share.test.mjs` 失敗 → 實作 → 通過。

### Task 2：所有加總改用 `spendOf`

**Files:** Modify `src/lib/trips.js`（`summarizeTrip` 總額與分類 :116、:122；`groupTripEntries` 當日小計 :161；`splitMonthSpend` :234）、`src/lib/lifeGrouping.js`（`groupEntriesByDay` 支出 :21、`buildMonthCalendar` :136、`collapseTripEntries` :217、:226）及各自測試。

- 函式最後一個參數已有或新增可選 `ctx`，往下傳給 `spendOf`。`groupEntriesByDay(entries, ctx = {})`、`buildMonthCalendar(ym, entries, ctx = {})` 新增 ctx。
- 外幣原幣小計（`foreign`）照舊用原幣金額，不分攤。排序（金額大到小）照舊用 `amount`。
- 測試：在 `trips.test.mjs` 加「均分後旅程總額與分類」「splitMonthSpend 用有效花費」；`lifeGrouping.test.mjs` 加「當日小計用有效花費」「收合列加總用有效花費」。既有測試都要過。

### Task 3：畫面、store、GAS

**Files:**
- `src/components/tabs/LifeTab.jsx`（`tExp` :268 → `spendOf`；傳 ctx 給 CalendarView 用的函式）
- `src/components/tabs/CalendarView.jsx`（當日小計 :143；`buildMonthCalendar`、`groupEntriesByDay` 傳 ctx——由 props 收 `tripCtx`）
- `src/components/tabs/AnalysisTab.jsx`（:50、:339、:373）、`src/components/tabs/AnnualTab.jsx`（:66）
- `src/components/tabs/LifeEntryRow.jsx`：金額顯示 `spendOf(entry, tripCtx)`；分類那行後面接 `shareLabel(entry)`（有的話）
- `src/components/tabs/TripEntriesSheet.jsx`（待確認列金額 :178 用 `spendOf`）
- `src/components/tabs/TripsView.jsx`：`TripModal` 在幣別旁加「人數」數字欄（1–30，預設 1，存 `groupSize`）；`TripCard` meta 在 `groupSize > 1` 時加「· N 人」
- `src/components/tabs/EntrySheet.jsx`：支出才顯示「幫大家付」三段切換（不是｜均分｜自填）＋人數欄或金額欄，即時顯示「我的份 $X」；存檔帶 `sharePatch(...)`；存檔後若 `bulkShareTargets(...)` 非空，`showToast('同一趟還有 N 筆「店名」，也套用？', 'success', { actionLabel: '好', onAction: () => patchLifeExpenses(targets.map(t => ({ id: t.id, patch: 同樣的 sharePatch }))) })`
- GAS（`C:\Users\c1471\Desktop\Projects\02.Batch\GAS-繳費通知`）：`LiveSync.js` 的 `LIVE_CARRY_FIELDS_`、`Dedup.js` 的 `STATEMENT_CARRY_FIELDS_` 各加 `"splitN", "myShare"`；`test/livesync.test.js` 加一條「均分的即時列被取代後，帳單列帶著 splitN」。

- [ ] 實作 → 全部測試＋`npm run build` 過 → GAS 兩個測試過。

### Task 4（主線）：瀏覽器實測 Review Focus 1–5（360／1280）、上線（先問使用者）。
