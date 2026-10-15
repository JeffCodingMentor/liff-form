# 系統規格書 (System Specification)

## 專案名稱
LINE LIFF 學習繳費紀錄查詢系統 - 管理員功能

## 背景與目標
現有系統支援學生與家長透過 LINE LIFF 查詢個人上課紀錄與繳費明細。本規格旨在擴充**管理員權限**與**學生選單切換**功能，讓具備管理員權限的使用者能夠在進入系統後瀏覽全部學生名冊、挑選學生檢視其上課與繳費紀錄，並能隨時返回學生選單。

---

## 核心規格與架構

### 1. 管理員權限驗證 (Admin Authorization)
* **設定儲存位置**：Google Apps Script (GAS) 專案設定之「指令碼屬性 (Script Properties)」，鍵名為 `ADMIN_USER_ID`。
* **判定機制**：
  * 使用者進入 LIFF 時呼叫 `action: 'check'`（帶入 LINE `userId`）。
  * GAS 比對 `userIdToCheck === PropertiesService.getScriptProperties().getProperty('ADMIN_USER_ID')`。
  * 符合時，回傳 `{ exists: true, isAdmin: true, name: "管理員", classroom: "I", ... }`。

### 2. 學生名冊快取機制 (Google Sheet Persistent Cache)
* **快取工作表**：於主試算表（Container-bound Spreadsheet）中建立專用分頁 `學生名冊快取`。
* **欄位結構**：
  * A 欄：學生姓名 (`name`)
  * B 欄：所屬教室 (`classroom`，代碼 `I` 或 `J`)
  * C 欄：試算表檔案 ID (`sheetId`)
  * D 欄：快取更新時間 (`lastUpdated`)
* **資料生命週期**：
  1. **首次登入（快取為空）**：
     * 若分頁不存在則自動建立，標題列為 `["學生姓名", "所屬教室", "檔案ID", "更新時間"]`。
     * 檢查資料列數，若為空（`lastRow < 2`），自動觸發掃描 Google 雲端硬碟。
     * 將掃描到的學生寫入分頁，回傳前端。
  2. **後續登入（已有快取）**：
     * 直接讀取 `學生名冊快取` 的所有資料列（毫秒級回傳，永不過期）。
  3. **手動重新整理（`action: 'get_students', refresh: true`）**：
     * 管理員於前端點擊「🔄 重新整理名單」時，清空第 2 列以後資料，重新掃描雲端硬碟並寫入試算表。

### 3. 雲端硬碟掃描邏輯 (`scanStudentFiles`)
* **資料夾 ID**：
  * 教室 I (`parentFolderId`)：`1A4SOGVwZCG77rA8lXfGaT1pHXoeJ7n8z`
  * 教室 J (`fallbackFolderId`)：`1mYCVAVWSjn_b0T1yOnF96KakJ5jeQJqU`
* **掃描策略**：
  * 先讀取主表 `LINE LIFF member` 已註冊的學生名單作為基底（取得精確的 `name`, `classroom`, `sheetId`）。
  * 掃描教室 I 子資料夾與試算表檔案。
  * 掃描教室 J 試算表檔案。
  * 從檔名解析學生姓名（常見命名如 `代號_姓名_上課紀錄` 或 `_姓名`）。
  * 去重合併後依教室、姓名排序。

### 4. 前端介面與互動 (UI/UX)
* **管理員學生選單 (`#adminArea`)**：
  * 標題顯示「管理員控制台」與學生統計數量。
  * 教室過濾按鈕（全部 / Im未來 / Jeff Coding）與「即時姓名搜尋輸入框」。
  * 學生清單卡片：點擊學生即可開啟該學生紀錄。
  * 底部按鈕：「🔄 重新整理名單」與「關閉系統」。
* **檢視學生紀錄**：
  * 自動套用該學生的教室主題（Im未來為綠色主題、Jeff Coding 為藍色主題 `blue-theme`）。
  * 呼叫既有 `fetchClassRecords(student.name, student.sheetId)` 渲染動態月曆、上課紀錄與繳費明細。
  * 頁面頂部常駐顯示 **「⬅️ 返回學生選單」** 按鈕 (`#adminBackToMenuBtn`)。
* **返回學生選單**：
  * 點擊「⬅️ 返回學生選單」時，隱藏學生紀錄頁面，還原至學生選單，供管理員選取下一位學生。

### 5. 一般學生向下相容性
* 非管理員登入時，完全維持既有流程（直接進入該學生個人紀錄頁面或註冊頁面），不顯示任何管理員元件。
