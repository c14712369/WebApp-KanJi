# 📊 收支與生活管理系統 (Expense & Life Manager)

![PWA Support](https://img.shields.io/badge/PWA-Supported-green)
![Vanilla JS](https://img.shields.io/badge/Javascript-Vanilla-yellow)
![Supabase](https://img.shields.io/badge/Backend-Supabase-blue)
![Offline First](https://img.shields.io/badge/Architecture-Offline--First-orange)

一個專為個人財務規劃設計的極速、可靠的 Web 應用程式。無須依賴笨重的前端框架，純原生 JavaScript 打造，整合固定支出、日常記帳、資產增長預測與專案預算管理。

## ✨ 核心特色

### 🚀 離線優先與自動同步 (Offline-First)
- **極速啟動**：即使在網路不佳或假性連線環境下，透過「5秒超時監控」機制，確保應用程式能秒開並優先使用本地快照。
- **無縫記帳**：支援完全離線使用，所有紀錄優先寫入 LocalStorage。
- **衝突解決**：採用「時間戳比對 (Timestamp)」技術，當偵測到網路恢復時，自動根據本地與雲端的更新時間進行「反向推播」或「覆蓋還原」。

### 📅 生活費自動化與優化
- **常態支出 (Daily Expenses)**：支援設定固定頻率（每日/平日/假日）的自動化記帳，系統自動補齊過去日期的固定開銷。
- **共享容器 UI**：全新的明細與分類整合容器，透過頁籤切換大幅優化行動裝置的垂直滑動體驗。
- **智慧排序**：支援一鍵切換日期升/降冪排序，檢視明細更直覺。

### 📈 資產試算與分析
- **複利預測**：結合台美股 CAGR 動態搜尋，自動帶入歷史報酬率進行資產增長試算。
- **實時分析**：自動連動日常生活費模組計算出的「月實際結餘」，提供最真實的財務健康數據。

### 🖼️ 現代化介面
- **原生深色模式**：全站原生支援 Dark Mode，並提供 2x2 或 1fr 的響應式佈局切換。
- **手機體驗強化**：使用 `overscroll-behavior: contain` 解決行動裝置清單滾動衝突。

### 💳 信用卡帳單匯入與即時記帳
- **帳單匯入**：GAS 專案 `GAS-信用卡帳單` 從 Gmail 解析信用卡帳單，寫入 Supabase `user_backups.app_data`，並依分類名稱與 `merchantRules` 學習規則自動分類。
- **即時記帳**：iPhone 捷徑呼叫 GAS Web App（`doPost`，需 `SHORTCUT_TOKEN`），當下寫入一筆 `live_` 開頭的紀錄，計入「本月還能花」。
  - **Apple Pay**：捷徑「錢包交易」自動化，感應付款即自動觸發。
  - **其他付款**（LINE Pay、icash Pay 等）：需用「手動記一筆」捷徑自行送出。
- **自動配對**：帳單匯入時，即時紀錄與帳單明細以「同金額、日期相差 ±3 天內」配對合併，避免重複計算。

#### 付款方式與即時記帳覆蓋
| 付款方式 | 自動即時記帳 | 說明 |
|---|---|---|
| Apple Pay（實體感應） | ✅ | 捷徑自動觸發 |
| LINE Pay | ❌ | 需手動記一筆；僅 Uber／Uber Eats 會寄收據 |
| icash Pay（如 7-11） | ❌ | 需手動記一筆 |
| 網購直接輸入卡號 | ❌ | 需手動記一筆，否則月底帳單匯入才出現 |

> ⚠️ 非 Apple Pay 的消費若沒手動記，月中「本月還能花」會高估，直到月底帳單匯入才補正。

## 🚀 快速開始

### 1. 本地啟動
直接使用任何靜態伺服器（如 VS Code 的 Live Server）開啟 `index.html` 即可。

### 2. 配置 Supabase 雲端備份 (選配)
1. 於 Supabase 建立 `user_backups` 資料表 (結構詳見 `system_documentation.md`)。
2. 於 `js/supabase-config.js` 填入您的專案 API 參數。

## 📂 檔案架構

- `/index.html`: UI 骨架與入口。
- `/style.css`: 核心樣式、CSS 變數主題與 RWD。
- `/js/*.js`: 模組化邏輯。
    - `supabase-sync.js`: **核心同步與離線邏輯**。
    - `ui-life.js`: 生活費與常態支出處理。
    - `utils.js`: 快取控制與**匯率備援機制**。
- `/sw.js`: PWA 離線支援與資源快取。

## 📝 系統文件
更深入的架構分析與資料流程說明，請參閱 [system_documentation.md](./system_documentation.md)。

---
*Created by [c1471](https://github.com/c14712369)*
