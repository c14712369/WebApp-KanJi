# 旅程分帳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建好旅程的起訖日後，旅程期間的花費依來源自動歸類（Apple Pay、外幣歸旅程；台幣帳單列進「待確認」），日常清單不再跟旅程明細混排。

**Architecture:** 分兩部分。後端是 GAS（`C:\Users\c1471\Desktop\Projects\02.Batch\GAS-繳費通知`）：帳單列取代即時列時，把旅程欄位帶過去；台新、中信的帳單列抓幣別；國外交易服務費連到它前一筆交易。前端是 Kakei：歸屬規則集中在 `src/lib/trips.js` 的 `entryTripId(entry, trips, ctx)`，例外商家另放 `src/lib/tripMerchants.js`，畫面都透過 `useTripContext()` 取得 `ctx`。

**Tech Stack:** React 18 + Vite、zustand store、`node --test`（前端 `.test.mjs`）；GAS 用 node 跑的零依賴測試（`eval` 載入原始檔）。

**Spec:** `docs/superpowers/specs/2026-11-26-trip-ledger-design.md`

## Global Constraints

- 對話、UI 文案、commit message 一律繁體中文。commit 結尾加上 session 規定的 `Co-Authored-By` / `Claude-Session` 兩行。
- 前端在分支 `feat/trip-ledger` 上做；GAS repo 直接在 main 上 commit（照該 repo 慣例）。**push 前端、`clasp push`、`clasp deploy` 之前，都要先問使用者。**
- 改既有檔前先備份：`cp 檔 檔.backup.$(date +%s)`。
- 破壞性寫入四守則：只改單筆或單一 patch，不拿整份清單覆蓋；寫入前先快照；log 記錄「改了什麼、幾筆」；批次寫入上限 200 筆，超過就中止。
- 歸屬規則照 spec 第 5 節的 9 條，由上往下判斷。第 4 條（例外商家）**只對台幣列有效**（沒有 `currency`，或 `currency === 'TWD'`）。
- 收入一律不算旅程。
- `merchantKey` / `normalizeMerchant` 前端和 GAS 必須一致；這次**不改**它們，新的比對函式只放前端。
- UI：短控制項併排、不占滿整列；操作列不放金額；切換狀態時容器尺寸不變（`ops/ref-ui-code-standards.md`）。旅程色用 `TRIP_COLOR`（`#2B9FD8`）。
- GAS 推送前照 memory `gas-live-shortcut-backend` 的三步驟：`clasp pull` 到 scratchpad 跟本機 diff → `clasp show-file-status`（Tracked 只能有 12 個正式檔）→ 才 push。捷徑的部署 id：`AKfycbzyvu9PlYyz0JVEbwZ6ok1UKijz8sMnzu0ikjJU9hfY__F-vtidRM_R-LDkm_8sjRTW`。
- **時程**：Task 1–4（GAS 帶走欄位）要在 12 月信用卡帳單匯入前上線。

## Review Focus

1. **同一份帳單重新解析**：帶過去的 `tripId`、日圓金額不能掉 → Task 2 的測試。
2. **在日本刷 7-11，但台灣的 7-11 已設成例外**：仍算旅程 → Task 6 的測試「例外不影響外幣列」。
3. **改版後第一次開 App**：東京賞楓的總額、筆數跟改版前完全相同 → Task 8 的「移轉前後總額不變」測試，加上 Task 11 的正式站比對。
4. **用「只看支出」篩選時**，日常清單收成一行的旅程列不能被算成「有 N 筆沒顯示」→ Task 9 的測試。
5. **旅程期間扣 Claude 美金訂閱（台新帳單 `CLAUDE.AI SUBSCRIPTION` USD 20.00）**：日圓旅程不算旅費、列入待確認，它的服務費（$9）也跟著不算 → Task 3 用真實樣本測，Task 6 測規則。

---

## Part A：GAS（先做，趕 12 月帳單）

### Task 1：帳單列取代即時列時，把旅程欄位帶過去

**Files:**
- Modify: `02.Batch/GAS-繳費通知/LiveSync.js:97-142`（`matchLiveToStatement`）
- Test: `02.Batch/GAS-繳費通知/test/livesync.test.js`

**Interfaces:**
- Produces：被配對到的帳單列多出 `fromLive: true`、`liveNote: <即時列 note>`，以及即時列上**有值的** `tripId`、`currency`、`originalAmount`、`fxRate`。`amount`、`id`、`note` 維持帳單的值。現有的 `categoryId` 補寫邏輯不變。
- 常數 `LIVE_CARRY_FIELDS_ = ["tripId", "currency", "originalAmount", "fxRate"]`。

- [ ] **Step 1：寫失敗測試**（加在 `test/livesync.test.js`，新區塊 `[matchLiveToStatement — 帶走旅程欄位]`）

```js
test('外幣即時列被取代：tripId、日圓、匯率、原店名帶到帳單列', () => {
  const live = { id: 'live_a', live: true, type: 'expense', date: '2026-11-16', note: '7-ELEVEN', amount: 680,
                 currency: 'JPY', originalAmount: 3200, fxRate: 0.2125, tripId: 't_tokyo', categoryId: 'lc_food' };
  const stmt = { id: 'gmail_s_1', type: 'expense', date: '2026-11-17', note: '[台新] 7-ELEVEN TOKYO', amount: 690, categoryId: 'lc_other' };
  const { rows } = matchLiveToStatement([live, stmt], 'lc_other');
  eq(rows.length, 1);
  const r = rows[0];
  eq(r.id, 'gmail_s_1'); eq(r.amount, 690); eq(r.fromLive, true); eq(r.liveNote, '7-ELEVEN');
  eq(r.tripId, 't_tokyo'); eq(r.currency, 'JPY'); eq(r.originalAmount, 3200); eq(r.fxRate, 0.2125);
});
test('台幣即時列被取代：只多 fromLive 與 liveNote，不憑空產生 tripId', () => {
  const live = { id: 'live_b', live: true, type: 'expense', date: '2026-12-06', note: '7-ELEVEN', amount: 85 };
  const stmt = { id: 'gmail_s_2', type: 'expense', date: '2026-12-07', note: '[台新] 統一超商－京發A3709 TAIPEI', amount: 85 };
  const r = matchLiveToStatement([live, stmt], 'lc_other').rows[0];
  eq(r.fromLive, true); eq(r.liveNote, '7-ELEVEN'); eq('tripId' in r, false); eq('currency' in r, false);
});
test("使用者排除過的即時列（tripId 'none'）也帶過去", () => {
  const live = { id: 'live_c', live: true, type: 'expense', date: '2026-12-06', note: 'X', amount: 100, tripId: 'none' };
  const stmt = { id: 'gmail_s_3', type: 'expense', date: '2026-12-06', note: '[台新] X', amount: 100 };
  eq(matchLiveToStatement([live, stmt], 'lc_other').rows[0].tripId, 'none');
});
```

- [ ] **Step 2：跑測試確認失敗**　`node test/livesync.test.js` → 新的 3 條 ❌（`fromLive` 是 undefined）。
- [ ] **Step 3：實作**。把現有的 `catPatch` 改成通用的 `patch`（statementId → 要合併的欄位物件）：分類照舊條件寫入，`fromLive`、`liveNote`、`LIVE_CARRY_FIELDS_` 則一律寫入（只寫 `!== undefined` 的欄位）。
- [ ] **Step 4：跑測試確認通過**　`node test/livesync.test.js` → `全部通過 ✅`（原本 38 條＋新 3 條）。
- [ ] **Step 5：Commit**（GAS repo）　`git add LiveSync.js test/livesync.test.js && git commit -m "feat: 帳單取代 Apple Pay 即時列時帶走旅程、外幣與原店名"`

### Task 2：同一份帳單重新解析時，帶過去的欄位要保留

**Files:**
- Modify: `02.Batch/GAS-繳費通知/Dedup.js:69-85`（`reconcileItems`）
- Test: `02.Batch/GAS-繳費通知/test_parsers.js`（加在現有 `reconcileItems` 測試旁，約 :145）

**Interfaces:**
- 常數 `STATEMENT_CARRY_FIELDS_ = ["fromLive", "liveNote", "tripId", "currency", "originalAmount", "fxRate"]`（放 Dedup.js）。
- 規則：舊列**沒有** `_editedAt`、但有 `fromLive` → 新解析出的同 id 列，補上舊列這些欄位中「新列沒有的」。新列已有的欄位（例如 Task 3 解析出的 `currency`）以新列為準。不加 `_editedAt`。

- [ ] **Step 1：寫失敗測試**

```js
test('重新解析同一封帳單：fromLive 列的旅程與外幣欄位保留', () => {
  const old = { id: 'gmail_M_x', source: 'gmail_M', amount: 690, note: '[台新] 7-ELEVEN TOKYO', fromLive: true,
                liveNote: '7-ELEVEN', tripId: 't_tokyo', currency: 'JPY', originalAmount: 3200, fxRate: 0.2125 };
  const fresh = { id: 'gmail_M_x', source: 'gmail_M', amount: 690, note: '[台新] 7-ELEVEN TOKYO' };
  const r = reconcileItems([old], [fresh], new Set(['gmail_M']))[0];
  eq(r.tripId, 't_tokyo'); eq(r.currency, 'JPY'); eq(r.originalAmount, 3200); eq(r.liveNote, '7-ELEVEN'); eq(r.fromLive, true);
  eq(r._editedAt, undefined);
});
test('重新解析：新列自己解析出的幣別優先於舊列', () => {
  const old = { id: 'gmail_M_y', source: 'gmail_M', fromLive: true, currency: 'JPY', originalAmount: 3200 };
  const fresh = { id: 'gmail_M_y', source: 'gmail_M', currency: 'JPY', originalAmount: 3210 };
  eq(reconcileItems([old], [fresh], new Set(['gmail_M']))[0].originalAmount, 3210);
});
```

- [ ] **Step 2：跑測試確認失敗**　`node test_parsers.js` → 第一條 ❌（`tripId` 是 undefined）。
- [ ] **Step 3：實作**。在 `existing.forEach` 內，把 `fromLive && !_editedAt` 的列記進 `carried[id]`；`newItems.forEach` 時，若沒有 edited 版本，就把 `carried[id]` 中新列缺的欄位補上。
- [ ] **Step 4：跑測試確認通過**　`node test_parsers.js` → `全部通過 ✅`。
- [ ] **Step 5：Commit**　`git commit -am "fix: 重新解析帳單時保留從即時列帶來的旅程與外幣欄位"`

### Task 3：台新、中信帳單列抓幣別，服務費連到前一筆交易

**Files:**
- Modify: `02.Batch/GAS-繳費通知/Parsers.js:229-265`（`parseTaishin`）、`:273-295`（`parseCTBCStatement`）
- Modify: `02.Batch/GAS-繳費通知/Dedup.js:32-56`（`buildItemsFromParse`）
- Test: `02.Batch/GAS-繳費通知/test_parsers.js`

**Interfaces:**
- Produces：`parseForeignTail_(rest: string) -> { currency: string, originalAmount: number } | null`（Parsers.js）。比對行尾的 `<消費地 2 碼> <幣別 3 碼> <外幣金額>`，幣別是 `TWD` 時回傳 null。外幣金額去掉千分位，保留正負號。
- 解析器的交易物件多出可選的 `currency`、`originalAmount`。
- `buildItemsFromParse` 產生的列：有 `currency` 時寫入 `currency`、`originalAmount`、`fxRate = Math.round(|amount / originalAmount| * 10000) / 10000`；名稱含「國外交易服務費」且前面有列時，寫入 `feeOf: <前一列的 id>`。
- 注意：台新長商家名會換行，幣別欄在**日期列**上（樣本 :62），所以 `parseForeignTail_` 要吃日期列的 `rest`，不是商家行。

- [ ] **Step 1：寫失敗測試**（用真實樣本 `test/fixtures/taishin_202605.txt`）

```js
test('台新：Claude 訂閱列抓到 USD 20', () => {
  const tx = (parseTaishin(fx('taishin_202605.txt'), '2026') || []).find(t => t.amount === 632);
  eq(tx.currency, 'USD'); eq(tx.originalAmount, 20);
});
test('台新：GitHub 退款列抓到 USD -3.67', () => {
  const tx = parseTaishin(fx('taishin_202605.txt'), '2026').find(t => t.amount === -115);
  eq(tx.currency, 'USD'); eq(tx.originalAmount, -3.67);
});
test('台新：只有消費地、沒有幣別的海外列（TAOBAO GB）與台幣列不帶 currency', () => {
  const txs = parseTaishin(fx('taishin_202605.txt'), '2026');
  eq('currency' in txs.find(t => t.amount === 324), false);
  eq('currency' in txs.find(t => t.amount === 85), false);
});
test('中信：版型註解的外幣列抓到 JPY 3200', () => {
  const line = '115/11/16 115/11/18 ｾﾌﾞﾝｲﾚﾌﾞﾝ    680   1234   JP   JPY   3,200';
  const tx = parseCTBCStatement(line, '2026')[0];
  eq(tx.currency, 'JPY'); eq(tx.originalAmount, 3200);
});
test('服務費連到前一筆交易：台新樣本每一筆「國外交易服務費－N」的 feeOf 都指向金額 N 的那列', () => {
  const items = buildItemsFromParse('MSG_TS', parseTaishin(fx('taishin_202605.txt'), '2026'));
  const fees = items.filter(i => i.note.includes('國外交易服務費'));
  ok(fees.length >= 3, '樣本至少 3 筆服務費');
  fees.forEach(f => {
    const base = Number((f.note.match(/－([\d.]+)/) || [])[1]);
    eq(items.find(i => i.id === f.feeOf).amount, base, f.note);
  });
});
test('buildItemsFromParse：外幣列寫入 fxRate', () => {
  const it = buildItemsFromParse('MSG_TS', parseTaishin(fx('taishin_202605.txt'), '2026')).find(i => i.amount === 632);
  eq(it.currency, 'USD'); eq(it.fxRate, 31.6);
});
```

- [ ] **Step 2：跑測試確認失敗**　`node test_parsers.js` → 新的 6 條 ❌。
- [ ] **Step 3：實作** `parseForeignTail_`，在兩個解析器的 `out.push` 帶入；`buildItemsFromParse` 寫入幣別欄位與 `feeOf`。
- [ ] **Step 4：跑測試確認通過**　`node test_parsers.js` → `全部通過 ✅`。核心不變量（金額加總＝本期新增款項）也要維持通過。再跑一次 `node test/livesync.test.js` → 全部通過（外幣帳單列不能影響配對）。
- [ ] **Step 5：Commit**　`git commit -am "feat: 台新與中信帳單列記下原幣別，國外交易服務費連到所屬交易"`

### Task 4：部署 GAS

- [ ] **Step 1**：`clasp pull` 到 scratchpad 的新資料夾，跟本機 diff。除了 Task 1–3 的改動，不能有其他差異；有差異就停下回報。
- [ ] **Step 2**：`clasp show-file-status` → Tracked 只有 12 個正式檔。
- [ ] **Step 3（先問使用者）**：`clasp push`，然後執行 `clasp deploy -i AKfycbzyvu9PlYyz0JVEbwZ6ok1UKijz8sMnzu0ikjJU9hfY__F-vtidRM_R-LDkm_8sjRTW -d "帳單取代即時列帶走旅程欄位、台新中信幣別"`。
- [ ] **Step 4**：`clasp deployments` → 這個 id 的版本號比 @20 大。更新 memory `gas-live-shortcut-backend` 的部署版本與日期。
- [ ] **Step 5**：GAS repo `git push`（先問使用者）。

---

## Part B：Kakei 前端

開分支：`git checkout -b feat/trip-ledger`。測試指令：`node --test src/lib/<檔名>.test.mjs`；全部跑：`node --test $(find src -name "*.test.mjs" -not -path "*backup*")`，基準是 14 pass。

### Task 5：旅程例外商家（`src/lib/tripMerchants.js`）

**Files:**
- Create: `src/lib/tripMerchants.js`、`src/lib/tripMerchants.test.mjs`

**Interfaces:**
- Produces：
  - `tripMerchantKey(name: string): string`：先套 `normalizeMerchant`；命中超商別名表就回傳固定 key（`'7-11'`、`'familymart'`、`'hilife'`、`'okmart'`）；否則回傳去掉分店字尾的 `merchantKey`。空字串回傳 `''`。
  - `isTripExcluded(entry, map): boolean`：外幣列（`currency` 存在且不是 `'TWD'`）一律回傳 false。否則只要 `note` 或 `liveNote` 的 key，在 map 裡是 `on: true`，就回傳 true。
  - `setTripExclusion(map, name, on, now = Date.now()): object`：回傳新物件，`map[key] = { on, at: now, label }`，`label` 是 `normalizeMerchant(name)` 前的原名去掉 `[銀行]` 前綴。key 空白時原樣回傳。
  - `mergeTripExcludes(local, cloud): object`：同一個 key 取 `at` 較大的那份。
  - `activeTripExclusions(map): Array<{ key, label, at }>`：只列 `on: true` 的，依 `at` 新到舊排序。
- 別名表（至少）：7-11 ← `7-ELEVEN`、`7-11`、`統一超商`、`セブン-イレブン`、`ｾﾌﾞﾝｲﾚﾌﾞﾝ`、`SEVEN-ELEVEN`；familymart ← `全家`、`FamilyMart`、`ファミリーマート`；hilife ← `萊爾富`、`Hi-Life`；okmart ← `OK超商`、`OKmart`。

- [ ] **Step 1：寫失敗測試**

```js
const k = tripMerchantKey;
test('7-11 各種寫法都是同一家', () => {
  for (const n of ['7-ELEVEN', '7-ELEVEN 台北門市', '[台新] 統一超商－京發A3709 TAIPEI', '統一超商新營門市', '統一超商中正門市', 'セブン-イレブン'])
    assert.equal(k(n), '7-11', n);
});
test('全家各種寫法都是同一家', () => {
  for (const n of ['全家便利商店台南店', 'FamilyMart', 'ファミリーマート']) assert.equal(k(n), 'familymart', n);
});
test('一般連鎖店的不同分店是同一家', () => { assert.equal(k('路易莎台南中正店'), k('路易莎台南成大店')); });
test('不同店不會撞在一起', () => { assert.notEqual(k('台灣大哥大'), k('台灣高鐵')); assert.notEqual(k('誠品書店'), k('')); });
const on = { '7-11': { on: true, at: 1, label: '7-ELEVEN' } };
test('台幣 7-11 被例外', () => { assert.equal(isTripExcluded({ note: '7-ELEVEN' }, on), true); });
test('例外不影響外幣列（日本的 7-11 仍算旅程）', () => {
  assert.equal(isTripExcluded({ note: '7-ELEVEN', currency: 'JPY' }, on), false);
  assert.equal(isTripExcluded({ note: '7-ELEVEN', currency: 'TWD' }, on), true);
});
test('帳單取代後店名變了，靠 liveNote 仍認得', () => {
  assert.equal(isTripExcluded({ note: '[台新] 某某商店', liveNote: '7-ELEVEN' }, on), true);
});
test('取消後不再例外', () => {
  assert.equal(isTripExcluded({ note: '7-ELEVEN' }, setTripExclusion(on, '7-11', false, 2)), false);
});
test('合併取較新的', () => {
  assert.deepEqual(
    mergeTripExcludes({ a: { on: false, at: 2 } }, { a: { on: true, at: 1 }, b: { on: true, at: 5 } }),
    { a: { on: false, at: 2 }, b: { on: true, at: 5 } });
});
```

- [ ] **Step 2：跑測試確認失敗**　`node --test src/lib/tripMerchants.test.mjs` → FAIL（模組不存在）。
- [ ] **Step 3：實作**。import `normalizeMerchant`、`merchantKey` 自 `./merchantRules.js`，不改它們。
- [ ] **Step 4：跑測試確認通過**　→ 全部 pass。
- [ ] **Step 5：Commit**　`git add src/lib/tripMerchants.* && git commit -m "feat: 旅程例外商家比對（超商別名、分店、只對台幣列）"`

### Task 6：新的歸屬規則（`src/lib/trips.js`）

**Files:**
- Modify: `src/lib/trips.js`（`entryTripId` :32、`summarizeTrip` :46、`sheetTripDefault` :135、`tripOfExpense` :154、`splitMonthSpend` :162、`matchesCatFilter` :189、檔頭註解）
- Test: `src/lib/trips.test.mjs`

**Interfaces:**
- Consumes：Task 5 的 `isTripExcluded`。
- Produces：
  - `entryTripId(entry, trips, ctx = {}): string | null`，`ctx = { exclude?: object, byId?: Map<string, entry> }`。照 spec 第 5 節 1–9 條：匯入列用 `isImportedId`（`./syncMerge.js`）判斷；第 6 條看 `entry.live || entry.fromLive`；第 7 條看 `entry.currency === trip.currency && trip.currency !== 'TWD'`；第 8 條看 `entry.feeOf`，用 `ctx.byId` 找到交易後遞迴判斷（沒有 `byId` 就跳過第 8 條）。
  - `tripPendingId(entry, trips, ctx = {}): string | null`：落在第 9 條（帳單列、日期在旅程內、沒有 `tripId`、不是例外、支出且金額 > 0）時，回傳那趟的 id。
  - `pendingEntries(trip, entries, trips, ctx = {}): entry[]`：新到舊排序。
  - `getTripContext(entries, exclude): { exclude, byId }`：記住上一次的 `(entries, exclude)` 參照；參照都沒變時，回傳同一個物件。
  - 以下函式最後都加上可選的 `ctx` 參數，往下傳給 `entryTripId`：`summarizeTrip(trip, entries, trips, categories, ctx)`、`splitMonthSpend(entries, trips, ym, categories, ctx)`、`matchesCatFilter(entry, filterId, trips, ctx)`、`sheetTripDefault(trips, date, initial, ctx)`。
  - `sheetTripDefault`：新增時（`initial` 沒有 `id`），如果 `initial.tripId` 指向存在的旅程，就回傳它（給 Task 10「從旅程記一筆」用）。
- `src/lib/tripFx.js:31` 不改（外幣即時列不受例外影響）。

- [ ] **Step 1：寫失敗測試**（現有測試全部保留，它們都是手動列，結果不變）

```js
const T = [
  { id: 't_tainan', name: '台南小旅行', startDate: '2026-12-05', endDate: '2026-12-07', currency: 'TWD' },
  { id: 't_tokyo',  name: '東京賞楓',   startDate: '2026-11-14', endDate: '2026-11-22', currency: 'JPY' },
];
const ex = { '7-11': { on: true, at: 1 } };
const X = (o) => ({ type: 'expense', amount: 100, ...o });
test('規則 5：手動列看日期', () => assert.equal(entryTripId(X({ id: 'm1', date: '2026-12-06' }), T), 't_tainan'));
test('規則 6：Apple Pay 台幣列看日期', () => assert.equal(entryTripId(X({ id: 'live_1', live: true, date: '2026-12-06' }), T), 't_tainan'));
test('規則 6：Uber 收據（gmail_ 但 live）', () => assert.equal(entryTripId(X({ id: 'gmail_u', live: true, date: '2026-12-06' }), T), 't_tainan'));
test('規則 6：從即時列換成的帳單列', () => assert.equal(entryTripId(X({ id: 'gmail_s', fromLive: true, date: '2026-12-06' }), T), 't_tainan'));
test('規則 7：日圓帳單列進東京', () => assert.equal(entryTripId(X({ id: 'gmail_j', currency: 'JPY', date: '2026-11-16' }), T), 't_tokyo'));
test('規則 9：美金訂閱在東京期間 → 日常＋待確認', () => {
  const e = X({ id: 'gmail_c', currency: 'USD', date: '2026-11-16', note: '[台新] CLAUDE.AI SUBSCRIPTION' });
  assert.equal(entryTripId(e, T), null); assert.equal(tripPendingId(e, T), 't_tokyo');
});
test('規則 9：台幣帳單列在台南期間 → 日常＋待確認', () => {
  const e = X({ id: 'gmail_t', date: '2026-12-06', note: '[台新] 台灣大哥大' });
  assert.equal(entryTripId(e, T), null); assert.equal(tripPendingId(e, T), 't_tainan');
});
test('規則 8：服務費跟著日圓交易進東京；美金交易的服務費不算', () => {
  const j = X({ id: 'gmail_j', currency: 'JPY', date: '2026-11-16' });
  const fj = X({ id: 'gmail_fj', note: '[台新] 國外交易服務費－680.00', feeOf: 'gmail_j', date: '2026-11-16', amount: 10 });
  const c = X({ id: 'gmail_c', currency: 'USD', date: '2026-11-16' });
  const fc = X({ id: 'gmail_fc', note: '[台新] 國外交易服務費－632.00', feeOf: 'gmail_c', date: '2026-11-16', amount: 9 });
  const ctx = getTripContext([j, fj, c, fc], {});
  assert.equal(entryTripId(fj, T, ctx), 't_tokyo'); assert.equal(entryTripId(fc, T, ctx), null);
  assert.equal(entryTripId(fj, T), null);   // 沒有 byId 就不套第 8 條
});
test('規則 4：台幣 7-11 被例外，不進待確認', () => {
  const e = X({ id: 'live_7', live: true, note: '7-ELEVEN', date: '2026-12-06' });
  const ctx = { exclude: ex };
  assert.equal(entryTripId(e, T, ctx), null); assert.equal(tripPendingId(e, T, ctx), null);
});
test('規則 4：日本 7-11（日圓）不受例外影響', () => {
  assert.equal(entryTripId(X({ id: 'live_8', live: true, note: '7-ELEVEN', currency: 'JPY', date: '2026-11-16' }), T, { exclude: ex }), 't_tokyo');
});
test("規則 1：tripId 'none' 的帳單列不進待確認", () => {
  assert.equal(tripPendingId(X({ id: 'gmail_n', tripId: 'none', date: '2026-12-06' }), T), null);
});
test('收入不算旅程也不待確認', () => {
  const e = { id: 'gmail_i', type: 'income', amount: 100, date: '2026-12-06' };
  assert.equal(entryTripId(e, T), null); assert.equal(tripPendingId(e, T), null);
});
test('待確認的帳單列在每月統計算日常', () => {
  const r = splitMonthSpend([X({ id: 'gmail_t', date: '2026-12-06', categoryId: 'c1' })], T, '2026-12', [{ id: 'c1', name: '通訊' }]);
  assert.equal(r.dailyTotal, 100); assert.equal(r.tripTotal, 0);
});
test('getTripContext 參照沒變就回傳同一個物件', () => {
  const es = [], exc = {}; assert.equal(getTripContext(es, exc), getTripContext(es, exc));
});
test('從旅程記一筆：新增時照 initial.tripId 預設', () => {
  assert.equal(sheetTripDefault(T, '2026-10-01', { type: 'expense', tripId: 't_tokyo' }), 't_tokyo');
});
```

- [ ] **Step 2：跑測試確認失敗**　`node --test src/lib/trips.test.mjs` → 新測試 FAIL（帳單列仍依日期歸入、`tripPendingId` 不存在）。
- [ ] **Step 3：實作**上述介面，並更新檔頭註解的規則說明。
- [ ] **Step 4：跑全部測試**　`node --test $(find src -name "*.test.mjs" -not -path "*backup*")` → 全部 pass（`tripFx.test.mjs`、`lifeGrouping.test.mjs` 也要過）。
- [ ] **Step 5：Commit**　`git commit -am "feat: 旅程歸屬改看來源：Apple Pay 與外幣自動歸，台幣帳單列待確認"`

### Task 7：例外名單進 store 與同步，各畫面帶入 ctx

**Files:**
- Modify: `src/lib/constants.js`（:24 旁）、`src/store/appStore.js`（:44-49 state、:176-187 actions、:228-252 `loadFromCloud`）、`src/hooks/useSync.js`（:24 推送、:72-76 與 :163-197 合併）
- Create: `src/hooks/useTripContext.js`
- Modify: `src/components/tabs/LifeTab.jsx:273,307`、`AnalysisTab.jsx:249`、`TripsView.jsx:275`、`LifeEntryRow.jsx:29`、`EntrySheet.jsx:89`

**Interfaces:**
- Consumes：Task 5 的 `setTripExclusion`、`mergeTripExcludes`；Task 6 的 `getTripContext` 與各函式的 `ctx` 參數。
- Produces：
  - `TRIP_EXCLUDE_KEY = 'sub_mgr_trip_exclude_merchants'`
  - store state `tripExcludeMerchants: object`（預設 `{}`）；action `setTripExclusion(name: string, on: boolean)`（內部呼叫 lib 版本，`save` + `stamp`）；`applyCloudMerge` 多收 `tripExcludeMerchants`。
  - `useTripContext(): { exclude, byId }`：從 store 取 `lifeExpenses`、`tripExcludeMerchants`，回傳 `getTripContext(...)`。
- 合併照 `merchantRules` 的寫法：拉雲端時用 `mergeTripExcludes(local, cloud)`；推送時把它放進 payload。

- [ ] **Step 1**：照上面的介面接好 store、sync、hook，並把 `ctx` 傳進 5 個畫面的呼叫點。
- [ ] **Step 2：驗證**　`npm run build` → 成功、沒有新警告；全部測試仍 pass。
- [ ] **Step 3：驗證同步**　`grep -n "tripExcludeMerchants" src/hooks/useSync.js` → 至少出現在推送和兩處合併。
- [ ] **Step 4：Commit**　`git commit -am "feat: 旅程例外商家跨裝置同步，各畫面套用新的歸屬規則"`

### Task 8：一次性移轉（守住東京賞楓的總額）

**Files:**
- Create: `src/lib/tripMigration.js`、`src/lib/tripMigration.test.mjs`
- Modify: `src/store/appStore.js`（新 action）、`src/hooks/useSync.js`（第一次拉完雲端後呼叫）

**Interfaces:**
- Consumes：Task 6 的 `entryTripId`、`getTripContext`。
- Produces：
  - `legacyEntryTripId(entry, trips): string | null`：舊規則的原樣複本（`'none'` > `tripId` 指定 > 依日期），只給移轉用。
  - `planTripMigration(entries, trips, ctx): Array<{ id, tripId }>`：支出、沒有 `tripId`、舊規則有歸入、新規則沒歸入 → `{ id, tripId: 舊規則的旅程 }`。
  - `TRIP_MIGRATION_FLAG = 'sub_mgr_trip_rules_v2'`、`TRIP_MIGRATION_SNAPSHOT = 'sub_mgr_trip_rules_v2_snapshot'`、`TRIP_MIGRATION_MAX = 200`。
  - store action `migrateTripRules()`：有旗標就 return。計畫筆數大於 200 → `console.warn` 加 `showToast(..., 'error')`，不寫入、不設旗標。否則：快照被改的原始列 `{ at, rows }` 到 `TRIP_MIGRATION_SNAPSHOT` → 用 `patchLifeExpenses(plan.map(p => ({ id: p.id, patch: { tripId: p.tripId } })))`（它會替匯入列加 `_editedAt`）→ `console.log('[trips] 規則改版移轉：東京賞楓 N 筆…')` → 設旗標。計畫是 0 筆也設旗標。
  - 呼叫時機：`useSync` 第一次成功拉完雲端、`applyCloudMerge` 之後。

- [ ] **Step 1：寫失敗測試**

```js
const T = [{ id: 't_tokyo', name: '東京賞楓', startDate: '2026-11-14', endDate: '2026-11-22', currency: 'JPY' }];
const rows = [
  { id: 'm1', type: 'expense', amount: 500, date: '2026-11-15' },                    // 手動：新規則仍歸入 → 不動
  { id: 'live_1', live: true, type: 'expense', amount: 680, date: '2026-11-16' },      // 即時列 → 不動
  { id: 'gmail_t', type: 'expense', amount: 300, date: '2026-11-17' },                // 台幣帳單列：舊歸入、新不歸 → 移轉
  { id: 'gmail_j', type: 'expense', amount: 900, currency: 'JPY', date: '2026-11-18' },// 日圓帳單列 → 不動
  { id: 'gmail_n', type: 'expense', amount: 50, tripId: 'none', date: '2026-11-18' },  // 已排除 → 不動
  { id: 'gmail_i', type: 'income', amount: 9, date: '2026-11-18' },                   // 收入 → 不動
];
test('只移轉舊歸入、新不歸入的列', () => {
  assert.deepEqual(planTripMigration(rows, T, {}), [{ id: 'gmail_t', tripId: 't_tokyo' }]);
});
test('移轉前後東京賞楓總額與筆數不變', () => {
  const before = rows.filter(e => e.type !== 'income' && legacyEntryTripId(e, T) === 't_tokyo');
  const plan = new Map(planTripMigration(rows, T, {}).map(p => [p.id, p.tripId]));
  const after = rows.map(e => plan.has(e.id) ? { ...e, tripId: plan.get(e.id) } : e);
  const s = summarizeTrip(T[0], after, T, [], {});
  assert.equal(s.total, before.reduce((a, e) => a + e.amount, 0)); assert.equal(s.count, before.length);
});
test('冪等：套用後再算一次是 0 筆', () => {
  const after = rows.map(e => e.id === 'gmail_t' ? { ...e, tripId: 't_tokyo' } : e);
  assert.deepEqual(planTripMigration(after, T, {}), []);
});
```

- [ ] **Step 2：跑測試確認失敗**　`node --test src/lib/tripMigration.test.mjs` → FAIL。
- [ ] **Step 3：實作** lib 函式、store action，以及 useSync 的呼叫點。
- [ ] **Step 4：跑全部測試** → pass；`npm run build` → 成功。
- [ ] **Step 5：Commit**　`git commit -am "feat: 旅程規則改版一次性移轉，舊旅程總額不變（含快照、上限 200 筆）"`

### Task 9：日常清單把旅程明細收成一行

**Files:**
- Modify: `src/lib/lifeGrouping.js`（新函式）、`src/lib/lifeGrouping.test.mjs`
- Create: `src/components/tabs/TripDayRow.jsx`
- Modify: `src/components/tabs/CalendarView.jsx:282-295`（`renderRow`）、props 加 `onOpenTrip`
- Modify: `src/components/tabs/LifeTab.jsx:302-312`（`calEntries`、`monthEntries`）、加 `TripEntriesSheet`

**Interfaces:**
- Consumes：Task 6 的 `entryTripId`、`summarizeTrip`；Task 7 的 `useTripContext`。
- Produces：
  - `collapseTripEntries(entries, trips, ctx): entry[]`：歸屬旅程的支出，每個「日期＋旅程」換成一筆合成列 `{ id: 'tripday_<tripId>_<date>', _tripDay: true, tripId, date, type: 'expense', amount: <加總>, count, note: <旅程名> }`，放在該組第一筆原本的位置；其他列原樣保留、順序不變。
  - `TripDayRow({ entry, onOpen })`：整列是一個 `<button>`，內容依序是 ✈（`TRIP_COLOR`）、`{旅程名} · {count} 筆`、金額、chevron。`aria-label`：`` `${旅程名} ${count} 筆，NT$ ${金額}，打開旅程明細` ``。高度與 `LifeEntryRow` 相同。
  - LifeTab：篩選是旅程（`tripIdFromFilter(selectedCatId)` 有值）時**不收合**；其他情況，`calEntries` 和傳給 CalendarView 的 `allEntries` 都要先收合，被藏起的筆數才算得對。state `openTripId`，有值時渲染 `TripEntriesSheet`（summary 用 `summarizeTrip(..., ctx)`，`onEditEntry` 打開 LifeTab 原本的 `EntrySheet`）。
  - `buildMonthCalendar` 吃收合後的列：格子的金額不變（合成列帶加總）。

- [ ] **Step 1：寫失敗測試**（`lifeGrouping.test.mjs`）

```js
const T = [{ id: 't_tn', name: '台南小旅行', startDate: '2026-12-05', endDate: '2026-12-07', currency: 'TWD' }];
const E = [
  { id: 'm1', type: 'expense', amount: 300, date: '2026-12-06' },
  { id: 'live_1', live: true, type: 'expense', amount: 85, date: '2026-12-06' },
  { id: 'gmail_t', type: 'expense', amount: 599, date: '2026-12-06', note: '[台新] 台灣大哥大' },
  { id: 'm2', type: 'expense', amount: 1200, date: '2026-12-07' },
  { id: 'i1', type: 'income', amount: 50, date: '2026-12-06' },
];
test('同一天的旅程明細收成一行，金額是加總', () => {
  const out = collapseTripEntries(E, T, {});
  const d6 = out.find(e => e.id === 'tripday_t_tn_2026-12-06');
  assert.equal(d6.amount, 385); assert.equal(d6.count, 2); assert.equal(d6._tripDay, true);
  assert.ok(out.find(e => e.id === 'tripday_t_tn_2026-12-07'));
});
test('待確認的帳單列與收入照常顯示', () => {
  const ids = collapseTripEntries(E, T, {}).map(e => e.id);
  assert.ok(ids.includes('gmail_t')); assert.ok(ids.includes('i1'));
  assert.ok(!ids.includes('m1')); assert.ok(!ids.includes('live_1'));
});
test('當日小計不變', () => {
  const sum = (arr) => arr.filter(e => e.date === '2026-12-06' && e.type !== 'income').reduce((a, e) => a + e.amount, 0);
  assert.equal(sum(collapseTripEntries(E, T, {})), sum(E));
});
test('收合後再分組，合成列在第一筆原本的位置', () => {
  const g = groupEntriesByDay(collapseTripEntries(E, T, {})).find(x => x.date === '2026-12-06');
  assert.equal(g.entries[0].id, 'tripday_t_tn_2026-12-06');
});
```

- [ ] **Step 2：跑測試確認失敗**　`node --test src/lib/lifeGrouping.test.mjs` → FAIL。
- [ ] **Step 3：實作** `collapseTripEntries`，接著做 `TripDayRow`、CalendarView 的 `renderRow`（`e._tripDay` 就渲染 `TripDayRow`），以及 LifeTab 的收合與 `TripEntriesSheet`。
- [ ] **Step 4：驗證**　全部測試 pass；`npm run build` 成功。
- [ ] **Step 5：Commit**　`git commit -am "feat: 日常清單把旅程明細收成每天一行，點開看旅程明細"`

### Task 10：旅程頁：待確認、以後都算日常、從旅程記一筆、例外商家

**Files:**
- Modify: `src/lib/utils.js:105`（`showToast` 加上動作按鈕）
- Modify: `src/components/tabs/TripEntriesSheet.jsx`（待確認區、記一筆）
- Modify: `src/components/tabs/TripsView.jsx`（旅程卡的記一筆、`pendingEntries`、例外商家列表）
- Modify: `src/components/tabs/EntrySheet.jsx:255`（存檔把旅程改成「不屬於旅程」時，回報給呼叫端）
- Modify: CSS `src/tabs-trips.css`

**Interfaces:**
- Consumes：Task 6 的 `pendingEntries`、`sheetTripDefault`（`initial.tripId`）；Task 7 的 store action `setTripExclusion`、`updateLifeExpense`；Task 5 的 `activeTripExclusions`、`tripMerchantKey`。
- Produces：
  - `showToast(message, type = 'success', opts = {})`，`opts = { actionLabel?: string, onAction?: () => void, duration?: number }`。有動作時預設停留 6000ms，按下後立刻關閉。原本的兩參數呼叫行為不變。
  - `TripEntriesSheet` 新 props：`pending: entry[]`、`onDecide(entry, decision: 'trip' | 'daily')`、`onAddEntry()`。
  - 待確認區位置在合計列下面、清單上面。標題 `待確認 {N} 筆 · 旅程期間的刷卡，是旅費嗎？`；每列依序是店名、`M/D`、金額、`[日常]`、`[算旅費]`，兩顆按鈕併排。N 是 0 時整區不顯示。
  - `onDecide`：`'trip'` → `updateLifeExpense(id, { tripId: trip.id })`；`'daily'` → `updateLifeExpense(id, { tripId: 'none' })`，接著如果是台幣列，再跳 `showToast('已移到日常。以後「{label}」在旅程期間也都算日常？', 'success', { actionLabel: '好', onAction: () => setTripExclusion(note, true) })`。
  - 「移到日常」走原本的編輯：在 `EntrySheet` 把旅程膠囊改成「不屬於旅程」並存檔。原本歸旅程、改成 `'none'` 的台幣列，跳同一個提示。不另外加每列按鈕。
  - 記一筆：旅程卡和抽屜標題列各一顆「記一筆」，打開 `EntrySheet`，`initial = { type: 'expense', tripId, date }`，`date` 在旅程進行中或還沒出發時是今天，已結束是 `trip.endDate`。
  - 旅程頁最下方一列 `旅程例外商家（{N}）`，N 是 0 時不顯示。點開後列出 `activeTripExclusions`，每列是 label 加一顆「移除」，按下 → `setTripExclusion(key, false)`。

- [ ] **Step 1：寫失敗測試**（showToast 是 DOM，改測純函式；`trips.test.mjs`）

```js
test('pendingEntries 只列台南期間的台幣帳單列，新到舊', () => {
  const es = [
    { id: 'gmail_a', type: 'expense', amount: 599, date: '2026-12-05' },
    { id: 'gmail_b', type: 'expense', amount: 85, date: '2026-12-06' },
    { id: 'gmail_c', type: 'expense', amount: 85, date: '2026-12-06', tripId: 'none' },
    { id: 'live_d', live: true, type: 'expense', amount: 85, date: '2026-12-06' },
  ];
  assert.deepEqual(pendingEntries(T[0], es, T).map(e => e.id), ['gmail_b', 'gmail_a']);
});
```

- [ ] **Step 2：跑測試確認失敗或通過**　Task 6 若已實作 `pendingEntries`，這條會直接 pass，算是回歸保護。
- [ ] **Step 3：實作** `showToast` 的 opts、待確認區、記一筆、`EntrySheet` 改成不屬於旅程時的提示、例外商家列表，以及 CSS。
- [ ] **Step 4：驗證**　全部測試 pass；`npm run build` 成功。
- [ ] **Step 5：Commit**　`git commit -am "feat: 旅程頁待確認、以後這家都算日常、從旅程記一筆、例外商家管理"`

### Task 11：瀏覽器實測與真實資料核對

照 memory `kakei-browser-verify`（localStorage 放測試資料、先 open 再設 viewport），用 `agent-browser`。

- [ ] **Step 1：真實店名**　在正式站的 localStorage `lifeExpenses` 撈 note 或 liveNote 符合 `/7-?11|eleven|統一超商|セブン/i` 的列，列出所有不重複的店名。每一個都要讓 `tripMerchantKey` 回傳 `'7-11'`；有不符合的，就補進 Task 5 的測試和別名表，再 commit。
- [ ] **Step 2：上線前記下基準**　在正式站記下東京賞楓目前的總額和筆數（截圖）。
- [ ] **Step 3：本機 360px 和 1280px**，用測試資料「台南小旅行」（手動 1 筆、Apple Pay 1 筆、台幣帳單 2 筆、7-11 Apple Pay 1 筆）逐項確認：
  1. 生活頁那天收成一行，當日小計正確。
  2. 點那一行會打開旅程明細，待確認 2 筆，兩顆按鈕併排、不折行。
  3. 按「日常」會跳提示，按「好」後例外商家出現 1 家，移除後消失。
  4. 用「只看支出」篩選時，沒有出現「N 筆沒顯示」。
  5. 從旅程按「記一筆」，旅程膠囊已選好。
- [ ] **Step 4：截圖**存到 scratchpad，回報時附上路徑。

### Task 12：上線

- [ ] **Step 1**：全部測試 pass、`npm run build` 成功（貼出輸出）。
- [ ] **Step 2（先問使用者）**：合併到 main 並 push，Vercel 會自動部署。
- [ ] **Step 3**：正式站確認東京賞楓的總額和筆數，跟 Task 11 Step 2 的基準相同；console 有 `[trips] 規則改版移轉` 的 log。
- [ ] **Step 4**：更新 memory `project-foreign-currency-trip`：改版已上線（commit、GAS 版本），移除「設計待核可」那條。
