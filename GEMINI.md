# Project: Kakei（原 Kanji，資料夾與 repo 名稱未改）

## Tech Stack
- React (Vite/CRA), Tailwind CSS

## Commands
- Dev: `npm run dev` 
- Build: `npm run build`

## Code Conventions
- Functional components with hooks
- Colocate tests

---

# 全局 AI 協作與開發規範 (Global AI Collaboration & Development Guidelines)

## 跨平台同步規則
- `~/.claude/CLAUDE.md` 與 `~/.gemini/GEMINI.md` 的**全域設定部分**（核心溝通原則、身份與目標、UI 設計規範、程式碼規範）必須保持同步。
- 當你修改其中一個檔案的上述內容時，**必須同步更新另一個檔案**的對應部分。

## 核心溝通與協作原則
- **語言**：請一律使用**繁體中文**與我對答及撰寫 Commit Message。
- **主動與審美**：實作 UI 或功能前，若有設計或架構判斷需要選擇，**直接給出你認為最佳/最美觀的方案**，不需要反覆詢問。
- **直言不諱**：主動指出任何視覺上或架構上可以更好的地方。若我的指令會導致 UI 變醜或程式碼劣化，請直接說出來並提供替代方案。
- **權限與執行**：除了刪除（Delete/Remove）檔案或重要資料的操作外，預設允許所有權限與指令執行（包含 PowerShell 腳本如 `Get-ChildItem`）。執行前不需額外確認權限，僅需簡要說明意圖以保持高效率。

## 身份與目標
我主要開發 PWA（Progressive Web App）形式的個人工具程式。**UI 美觀是最高優先事項**：每個介面都要達到現代、順眼、精緻的水準，對標頂級商業應用的視覺品質。

## UI 設計核心規範

### 技術棧 (必須遵守)
- **樣式**：Tailwind CSS v4（優先）。全面啟用 CSS-first 主題配置，將 design tokens 封裝於全局 CSS 的 `@theme` 區塊中。
- **元件庫**：shadcn/ui（優先），或手工打造符合以下規範的元件
- **動畫**：Framer Motion（需要動畫時）
- **圖示**：Lucide React
- **字型**：Google Fonts — 內文用 `Inter`，標題可搭配 `Geist` 或 `Plus Jakarta Sans`

### 視覺風格
- **整體氛圍**：現代簡約（Modern Minimal）+ 微妙深度感
- **背景**：優先用深色模式（dark mode first），亦支援 light mode
- **色彩**：
  - 主色調：藍紫色系（indigo / violet）或依專案調整
  - 使用 CSS custom properties 管理 design token
  - 避免純黑背景，用 `zinc-900` / `slate-900` 等帶色相的深色
- **卡片 / 容器**：半透明毛玻璃（glassmorphism）— `backdrop-blur + bg-white/10`
- **陰影**：細膩柔和，避免生硬投影，優先用 `shadow-xl` 搭配顏色透明度
- **圓角**：`rounded-xl` 或 `rounded-2xl`，維持一致
- **間距節奏**：嚴格遵守 4px 基礎格（Tailwind spacing scale），不使用隨意 px 值

### 排版
- **標題層級**：清晰區分（例：`text-3xl font-bold` → `text-xl font-semibold` → `text-base font-medium`）
- **內文行距**：`leading-relaxed`（1.625）
- **說明文字/標籤**：`text-sm text-muted-foreground`（避免純灰，使用帶色相的灰色）
- **限制**：禁止使用 `text-xs` 於主要內容

### 互動回饋
- 所有可點擊元素必須有 `hover:` 狀態，且搭配 `transition-all duration-200` 確保順滑
- **按鈕**：明確的按壓感（例：`active:scale-95`）
- **輸入框 (Focus)**：明顯的 focus ring 效果（例：`focus-visible:ring-2 focus-visible:ring-violet-500`）
- **載入狀態**：必須實作骨架屏（skeleton）或 spinner，禁止只有空白畫面

### 響應式 & PWA
- Mobile-first 開發思維，使用 `sm:` / `md:` / `lg:` 斷點逐步增強
- 觸控目標尺寸最小 44x44px
- 考慮安全區域：使用 `safe-area-inset-*` 為瀏海或 Home bar 預留空間
- 絕對避免出現非預期的水平滾動條
- **滾動行為**：實作 `overscroll-behavior-y: contain`（防止 iOS 拉動背景）與 `-webkit-overflow-scrolling: touch`。
- **原生感手勢**：加入 `select-none`（禁止長按選單）及 `-webkit-tap-highlight-color: transparent`（消除行動端點擊高亮）。

## 程式碼與架構規範
- **語言**：TypeScript 優先（`.ts`, `.tsx`），確保型別安全。
- **架構**：元件盡量小且專注（單一職責原則）。
- **樣式管理**：不直接在元件內寫 hardcode 顏色數值，統一透過 Tailwind class 或 CSS token 管理。
- **狀態處理**：每個頁面/元件都必須有完整的 Loading（載入中）、Empty（空狀態）、Error（錯誤）狀態處理邏輯。
- **Commit 規範**：請使用繁體中文撰寫清晰、具描述性的 Commit Message (例如: `feat: 新增個人設定頁面毛玻璃效果`)。
- **Windows 腳本編碼 (CRITICAL)**：含中文的 PowerShell `.ps1` 檔**必須存成 UTF-8 with BOM**。Windows PowerShell 5.1 讀取「無 BOM」的 `.ps1` 會用系統 ANSI（台灣為 Big5/cp950）解碼，導致中文變亂碼、字串引號被打斷而 ParserError——連解析都過不了，雙擊執行時視窗一閃即關、看似「沒反應」。反之 `.bat` 批次檔**不可加 BOM**（cmd 會把開頭 BOM 當指令噴錯），中文顯示改用檔首 `chcp 65001`。用編輯器產生或修改腳本後，務必確認存檔編碼正確。

## 知識自動化歸檔與 Obsidian 連結 (Knowledge Archiving)
- **自動歸檔指令**：在每次任務完成、或與使用者的會話即將結束前，必須主動執行「知識提取」。
- **內容範圍**：提取本次會話中產生的新知識、技術決策、專案架構分析或解決問題的關鍵步驟。
- **寫入目標**：將提取內容格式化為 Markdown 並寫入 `C:\Obisidian筆記`。
- **強化連結**：主動搜尋筆記庫中的現有關鍵字，並使用 `[[雙向連結]]` 與 `#標籤` 進行關聯，確保知識網路持續擴張。
- **狀態透明**：若遇到搜尋失敗或 API 配額限制，必須在報告中明確標註錯誤訊息。

## Skills 自動感知與調用規則 (Auto-Skill Orchestration)

<EXTREMELY-IMPORTANT>
**核心原則：Skill 優先 (Skill-First Response)**
在回答使用者任何問題、提供建議或開始撰寫程式碼之前，你必須先根據情境自動調用最適用的 Skill。
</EXTREMELY-IMPORTANT>

### 1. 自動觸發流程 (Trigger Pipeline)
1.  **情境識別 (Context Identification)**: 分析使用者訊息中的關鍵字、技術棧與任務意圖。
2.  **預載入 (Pre-loading)**: 調用 `activate_skill` 載入對應 Skill。
3.  **遵循規範 (Adherence)**: 嚴格依照該 Skill 的 `SKILL.md` 指示進行後續動作。

### 2. 情境映射表 (Scenario Mapping)

| 如果任務涉及... | 則自動調用 (activate_skill) |
| :--- | :--- |
| **對話開始 (必備監控)** | `using-superpowers` (確立全局感知) |
| **UI 設計 / 前端開發** | `ui-ux-pro-max`, `web-design-guidelines`, `frontend-design` |
| **React / Next.js** | `vercel-react-best-practices`, `vercel-composition-patterns` |
| **Bug / 錯誤 / 測試失敗** | `systematic-debugging` (修復前分析) |
| **新功能實作 / 修復計畫** | `writing-plans` (生成 PLAN.md), `test-driven-development` |
| **Obsidian 筆記 / 知識庫** | `obsidian-markdown`, `obsidian-cli`, `json-canvas` |
| **性能優化** | `performance-optimization`, `context-engineering-collection` |
| **專案管理 / 角色諮詢** | `alirezarezvani/claude-skills` (選擇對應專業角色) |
| **宣告完成 / 發 PR** | `verification-before-completion`, `requesting-code-review` |

### 3. 禁止與限制 (Guardrails)
- **按需觸發**: 涉及新功能實作、重構、Bug 修復或多檔案變動時，強制觸發 Skill 流程；若僅為單一概念問答或微調，則直接依據視覺規範核心答覆。
- **動態調整**: 若任務過程中情境改變（例如從開發轉為除錯），必須立即載入新情境對應的 Skill。

### Gemini CLI 工具對照表

Skills 內容使用 Claude Code 工具名稱，Gemini CLI 對應如下：

| Skill 裡寫的 | Gemini CLI 對應 |
|-------------|----------------|
| `Read` | `read_file` |
| `Write` | `write_file` |
| `Edit` | `replace` |
| `Bash` | `run_shell_command` |
| `Grep` | `grep_search` |
| `Glob` | `glob` |
| `TodoWrite` | `write_todos` |
| `Skill` tool | `activate_skill` |
| `WebSearch` | `google_web_search` |
| `WebFetch` | `web_fetch` |
| `Task`（子代理） | 無對應 — 改用 `executing-plans` skill |

### 可用 Skills 清單

透過 `activate_skill` 可使用以下核心實體化 skills（以及 antigravity 庫）：

**超能力與入口 (最高優先):**
- `using-superpowers` — **對話啟動時必須調用**。確立如何尋找與使用 Skill，要求在任何回應（包括澄清問題）之前調用 Skill 工具。

**流程與計畫:**
- `writing-plans` — 收到多步驟任務需求時，在動手前先撰寫 PLAN.md。
- `executing-plans` — 執行已撰寫的 implementation plan。
- `planning-with-files` — 針對複雜研究或大型任務，使用檔案化計畫管理 (task_plan.md)。
- `verification-before-completion` — **宣告完成前的強制步驟**。必須執行驗證指令並確認輸出。

**品質與開發:**
- `systematic-debugging` — 遇到 bug、測試失敗或異常行為時，在修復前啟動系統化分析。
- `test-driven-development` — 實作功能或修 bug 前，先撰寫測試。
- `requesting-code-review` — 完成重大功能或發 PR 前進行自我審查。
- `subagent-driven-development` — 在當前會話中委派獨立子任務。
- `using-git-worktrees` — 啟動需要隔離的開發工作。

**視覺與工具:**
- `ui-ux-pro-max` — UI/UX 設計全能助手，涵蓋 50 種風格與主流框架。
- `frontend-design` — 打造生產級、具美感的前端介面，避免 AI 通用感。
- `obsidian-markdown` — 處理 Obsidian 格式筆記，強化雙向連結與屬性。
- `obsidian-cli` — 直接操作與管理 Obsidian Vault。
- `mcp-builder` — 建立與優化 MCP Server。
- `api-documentation` — 撰寫 API 文件。
- `code-review-analysis` — 程式碼審查分析。
- `web-design-guidelines` — UI/前端設計審查。

## Gemini Added Memories
- Obsidian Vault Path: C:\Obisidian筆記; API Key: b56777cc82ec7d27b00e2048e34690704771a325cfbd252da6b05f40faaeed00. Use these for automatic archiving at end of sessions.
- 在 Windows PowerShell 5.1 環境中，不支援使用 '&&' 串聯指令（這會導致 ParserError），應改用 ';' 分號，或使用 PowerShell 支援的邏輯判斷。在所有 win32 環境下的 run_shell_command 調用中，必須嚴格遵守此規則。
- FoodMoniter 專案已初始化，使用 Next.js 15, Tailwind v4, Gemini API。專案路徑為 C:\Users\c1471\Desktop\Projects\FoodMoniter。

