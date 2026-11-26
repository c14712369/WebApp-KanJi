# 旅程頁清單＋展開 Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 旅程頁改成「依年份分組的清單，一次只展開一趟（預設目前這趟）」。

**Architecture:** 純函式放 `src/lib/trips.js`（挑預設展開、依年份分組），畫面在 `src/components/tabs/TripsView.jsx` 新增收起列元件 `TripRow`，樣式加在 `src/tabs-trips.css`。

**Tech Stack:** React + Vite、framer-motion、自訂 `node` 測試（`node src/lib/trips.test.mjs`）。

**Spec:** `docs/superpowers/specs/2026-11-27-trips-list-layout-design.md`

## Global Constraints

- 繁體中文 UI 與 commit；分支 `feat/trips-list`；改既有檔前先備份（`.backup.<時間戳>`）。
- 不改 `TripCard` 的內容與明細抽屜；不改歸屬規則。
- UI 規範：`~/.claude/ops/ref-ui-code-standards.md`「使用者定的版面習慣」（資料列可放數值、操作列不放；對齊；不重複資訊）。
- 動畫尊重 `prefers-reduced-motion`。

## Review Focus

1. 點清單下方的一趟時，上方原本展開的大卡收起，頁面往上縮約 500px → 新展開的卡要被捲進畫面，不能讓使用者找不到。
2. 同時有「進行中」與「即將出發」→ 預設展開進行中那趟。
3. 收起的那一行有待確認／需換算時看得出來；兩者都有時只顯示「需換算」。
4. 新增旅程後，新的那趟展開；刪除展開中的那趟後，回到預設。
5. 360px 下長旅程名稱不會把金額擠掉（名稱省略號）。

---

### Task 1：純函式（挑預設展開、依年份分組）

**Files:** Modify `src/lib/trips.js`；Test `src/lib/trips.test.mjs`

**Interfaces（Produces）：**
- `featuredTripId(trips, today): string | null`：進行中（`startDate <= today <= endDate`）取 `startDate` 最晚；否則即將出發（`startDate > today`）取 `startDate` 最早；否則取 `endDate` 最晚；沒有旅程回傳 null。
- `groupTripsByYear(items): Array<{ year: string, count: number, total: number, items }>`：`items` 是 TripsView 現有的 `list` 元素（`{ trip, summary, ... }`），已是新到舊；依 `trip.startDate.slice(0, 4)` 分組、保持順序；`total` 為該組 `summary.total` 加總。

- [ ] **Step 1：寫失敗測試**
```js
const FT = [
  { id: 'past', startDate: '2026-07-03', endDate: '2026-07-07' },
  { id: 'old', startDate: '2025-10-02', endDate: '2025-10-06' },
  { id: 'now', startDate: '2026-11-24', endDate: '2026-11-28' },
  { id: 'soon', startDate: '2026-12-20', endDate: '2026-12-24' },
  { id: 'later', startDate: '2027-02-01', endDate: '2027-02-05' },
];
test('預設展開：進行中優先', () => assert.equal(featuredTripId(FT, '2026-11-26'), 'now'));
test('預設展開：沒有進行中 → 最快出發的', () => assert.equal(featuredTripId(FT.filter(t => t.id !== 'now'), '2026-11-26'), 'soon'));
test('預設展開：都結束了 → 回程日最晚的', () => assert.equal(featuredTripId(FT.filter(t => ['past', 'old'].includes(t.id)), '2026-11-26'), 'past'));
test('預設展開：沒有旅程 → null', () => assert.equal(featuredTripId([], '2026-11-26'), null));
test('依年份分組：出發年、保持順序、年合計', () => {
  const items = [
    { trip: { id: 'a', startDate: '2026-12-30', endDate: '2027-01-03' }, summary: { total: 100 } },
    { trip: { id: 'b', startDate: '2026-07-03', endDate: '2026-07-07' }, summary: { total: 50 } },
    { trip: { id: 'c', startDate: '2025-10-02', endDate: '2025-10-06' }, summary: { total: 30 } },
  ];
  const g = groupTripsByYear(items);
  assert.deepEqual(g.map(x => [x.year, x.count, x.total]), [['2026', 2, 150], ['2025', 1, 30]]);
  assert.deepEqual(g[0].items.map(x => x.trip.id), ['a', 'b']);
});
```
- [ ] **Step 2**：`node src/lib/trips.test.mjs` → 新測試失敗。
- [ ] **Step 3**：實作兩個函式。
- [ ] **Step 4**：`node src/lib/trips.test.mjs` → `全部通過 ✅`。

### Task 2：TripsView 清單＋展開

**Files:** Modify `src/components/tabs/TripsView.jsx`（主畫面約 :311–470 的列表區）、`src/tabs-trips.css`

**Interfaces（Consumes）：** Task 1 的 `featuredTripId`、`groupTripsByYear`；現有 `TripCard`、`formatTripRange`、`tripDays`、`fmtMoney`、`TRIP_COLOR`。

- state `expandedId`（預設 null）；實際展開的 id = `expandedId` 存在於 trips 時用它，否則 `featuredTripId(trips, today)`。
- 新增旅程成功後 `setExpandedId(新 id)`。
- 列表改成 `groupTripsByYear(list).map(group => <section>年份標題 + items</section>)`；item 是展開的那趟 → 原本的 `<TripCard …/>`（props 不變，外層加 `id="trip-<id>"`）；否則 → `<TripRow …/>`。
- `TripRow({ trip, summary, pendingCount, needsFx, onOpen })`：整行 `<button type="button" aria-expanded="false" aria-label="展開「名稱」，日期，總花費 $X">`；內容依設計第 4 點。`needsFx` = `fxItems.some(it => it.suggested)`（跟卡片上換算提醒的條件一致），而且沒有 `fxDone`。
- 點 `TripRow`：`setExpandedId(trip.id)`，下一個 frame 對 `#trip-<id>` 做 `scrollIntoView({ block: 'nearest', behavior: 減少動態 ? 'auto' : 'smooth' })`。
- 年份標題：`<h3 className="tp-year">`，左 `{year} · {count} 趟`、右 `$` 合計（`fmtMoney`）。
- 新 CSS class 前綴 `tp-row`、`tp-year`；列高、左右留白、字級對齊現有 `tp-cat-row` 與 `LifeEntryRow`；標記用卡片上待確認提醒的顏色。

- [ ] **Step 1**：實作。
- [ ] **Step 2**：全部測試（`node --test` 所有非 backup 的 `*.test.mjs`）全過；`npm run build` 成功。
- [ ] **Step 3（主線做）**：瀏覽器 360px 與 1280px 實測 Review Focus 1–5，截圖。
