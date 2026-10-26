# 生活開銷「日曆/清單」雙檢視與記帳狀態紅點 (Calendar View) Implementation Plan (Rev. 2)

> **For Agent:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.
> **CRITICAL USER CONSTRAINT:** 千萬不要執行任何 `git commit` 或 `git push`！所有任務完成後僅進行測試與 build 驗證。

**Goal:** 在生活開銷（LifeTab）的收支明細中提供「清單 / 日曆」雙模式切換，讓使用者透過現代精緻的月曆介面一眼辨識本月哪幾天有記帳（紅點標記支出、綠點標記收入），並支援點選日期即時檢視該日收支明細與快速補記帳。

**Architecture:** 
1. 資料層（`src/lib/lifeGrouping.js`）：新增純函式 `buildMonthCalendar(ym, entries)`，計算當月星期補齊、每日收支合計、記帳項目與標記狀態（hasExpense, hasIncome, totalExpense, totalIncome）。特別排除信用卡回饋折抵（`_linkedExpenseId`），並使用純數值 Date 建構運算防範時區偏移，並附 100% 單元測試覆蓋。
2. 共用列元件（`src/components/tabs/LifeEntryRow.jsx`）：自 `LifeTab.jsx` 抽離出高質感的收支項目單列元件（圖示、分類、備註、金額動畫、回饋金、操作按鈕），徹底落實 DRY 原則。
3. 元件層（`src/components/tabs/CalendarView.jsx`）：實作高質感 Glassmorphism 月曆網格，包含星期標題（日～六）、日期儲存格、紅綠微光狀態點、今日高亮、選中外框特效及點選反饋（Haptic vibration）。下半部共用 `LifeEntryRow` 呈現當日收支與快速補記入口。
4. 整合層（`src/components/tabs/LifeTab.jsx`）：在收支明細頂部提供排版獨立的 Segmented Switcher（條列 ☰ / 日曆 📅），支援跨月份時 `selectedDate` 自動對齊（當月對齊今日，其他月份對齊 1 號），並確保分頁控制項僅在清單模式生效。

**Tech Stack:** React 19, Framer Motion, CSS Design Tokens, Vanilla Node Test Runner (`node test.mjs`)

---

### Task 1: 實作日曆資料運算純函式與單元測試

**Files:**
- Modify: `src/lib/lifeGrouping.js`
- Test: `src/lib/lifeGrouping.test.mjs`

**Step 1: 撰寫失敗測試**
在 `src/lib/lifeGrouping.test.mjs` 中新增 `buildMonthCalendar` 測試情境：
- 測試閏年與一般月份天數與起始星期補齊（2026-02 為 28 天，2024-02 為 29 天，2026-10 為 31 天）
- 測試星期計算無 UTC 時區飄移（跨平台數值 Date 正確）
- 測試當日收支標記：有支出時 `hasExpense = true, totalExpense > 0`；有收入時 `hasIncome = true, totalIncome > 0`
- **【CRITICAL】測試排除回饋金**：若 `entry.type === 'income'` 且具備 `_linkedExpenseId`，不計入收入合計且不觸發 `hasIncome`（避免假綠點）
- 測試空輸入或無效輸入的安全回退

**Step 2: 執行測試確認失敗**
Run: `node src/lib/lifeGrouping.test.mjs`
Expected: FAIL（`buildMonthCalendar is not a function`）

**Step 3: 實作 `buildMonthCalendar` 函式**
在 `src/lib/lifeGrouping.js` 中實作並匯出：
```javascript
export function buildMonthCalendar(ym, entries = []) {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return { paddingDays: 0, days: [] };
  const [yearStr, monthStr] = ym.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  // 防範 UTC 飄移：使用本地年、月數值
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0: 週日 ~ 6: 週六

  // 聚合當月明細
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
    days: Object.values(dayMap)
  };
}
```

**Step 4: 執行測試驗證通過**
Run: `node src/lib/lifeGrouping.test.mjs`
Expected: PASS（全部通過 ✅）

**Step 5: 靜態檢查**
Run: `node -c src/lib/lifeGrouping.js`
Expected: 無語法錯誤（嚴禁 git commit）

---

### Task 2: 抽取 `LifeEntryRow.jsx` 共用元件（DRY 原則）

**Files:**
- Create: `src/components/tabs/LifeEntryRow.jsx`
- Modify: `src/components/tabs/LifeTab.jsx`

**Step 1: 建立 `LifeEntryRow.jsx`**
將原在 `LifeTab.jsx`（第 851-896 行）的明細單列渲染邏輯封裝為獨立元件：
- 傳入 props: `entry`, `isJustSaved`, `reward`, `category`, `paymentMethod`, `onEdit`, `onDelete`
- 包含分類圖示/箭頭、分類名稱、備註、信用卡圖示、金額動畫（`AnimatedNumber`）、回饋金提示與操作按鈕（編輯/刪除）

**Step 2: 在 `LifeTab.jsx` 中改用 `LifeEntryRow`**
- 替換原有的 JSX 區塊，確認清單功能運作完全一致，程式碼簡潔度提升。

**Step 3: 驗證無 build 錯誤**
Run: `npm run build`
Expected: PASS

---

### Task 3: 建立 `CalendarView.jsx` 精緻月曆元件

**Files:**
- Create: `src/components/tabs/CalendarView.jsx`
- Modify: `src/tabs-shared.css`

**Step 1: 實作月曆網格結構**
- 星期標頭：日、一、二、三、四、五、六（文字顏色帶微透明度 `var(--text-muted)`）。
- 前置空白填補：`Array.from({ length: paddingDays })` 產生空白佔位儲存格。
- 日期儲存格：
  - 觸控目標尺寸 ≥ 44x44px。
  - 當天標記（Today）：`isToday` 微柔和圓環。
  - 選中標記（Selected）：`selectedDate === day.date`，帶動態主題外框與卡片微升。
  - 狀態紅點 / 綠點：
    - `day.hasExpense`：小紅點（`var(--danger-color)`）
    - `day.hasIncome`：小綠點（`var(--success-color)`）
    - 點間距優雅、居中排列於日期下方。
  - 每日小計（選配）：當日有支出時，以微小字體在紅點下方呈現整數金額（如 `350`）。
  - 點擊觸發：`onSelectDate(day.date)` + `navigator.vibrate(20)`。

**Step 2: 實作下半部「選定日期明細與補記入口」**
- 頂部日期標題列：顯示選定日期（例如 `10/24（五）`）與當日合計支出。
- 明細清單：使用 `<LifeEntryRow ... />` 渲染該日明細。
- 空狀態：若當天無紀錄，顯示極簡卡片提示「本日無記帳」，並提供「＋ 補記此日」按鈕，點擊觸發 `onQuickAdd(selectedDate)`。

**Step 3: 驗證樣式與佈局**
- 無水平滾動條，適配 Mobile-first（360px ~ 430px）。

---

### Task 4: 在 `LifeTab.jsx` 整合檢視切換與跨月同步

**Files:**
- Modify: `src/components/tabs/LifeTab.jsx`

**Step 1: 狀態管理與記憶性**
- 檢視切換狀態：`const [detailViewMode, setDetailViewMode] = useState(() => localStorage.getItem('LIFE_DETAIL_VIEW_MODE') || 'list');`
- 選取日期狀態：`const [selectedCalDate, setSelectedCalDate] = useState(todayIso);`
- 跨月同步：監聽 `ym` 變化，若切換後的 `ym === currentMonth`，選定日期同步為 `todayIso`；若為其他月份，選定日期同步為 `"${ym}-01"`。

**Step 2: 獨立 Segmented Switcher 排版**
- 在收支明細面板中，於分類/篩選區塊上方或標題列右側，新增精緻切換器：
  `[ 條列 ☰ ]` 與 `[ 日曆 📅 ]`
- 點擊切換時記錄至 `localStorage`。

**Step 3: 條件切換清單 vs 日曆 & 分頁隔離**
- 當 `detailViewMode === 'list'` 時，顯示原有分組清單與分頁控制項（`totalPages > 1`）。
- 當 `detailViewMode === 'calendar'` 時，渲染 `<CalendarView ... />`，並隱藏清單模式的分頁控制項。
- 補記按鈕連動：點擊「補記此日」時，開啟 `ExpenseModal` 並將日期預設為 `selectedCalDate`。

---

### Task 5: 驗證與回歸測試（嚴格禁止 Commit/Push）

**Step 1: 單元測試驗證**
Run: `node src/lib/lifeGrouping.test.mjs`
Expected: 全部測試通過 ✅

**Step 2: 生產建置驗證**
Run: `npm run build`
Expected: 成功無錯誤

**Step 3: Git Status 狀態檢驗**
Run: `git status`
Expected: 確認有修改與新增檔案，但未執行任何 `git commit` 或 `git push`。
