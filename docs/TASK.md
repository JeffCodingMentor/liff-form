# 實作工作清單 (Implementation Tasks)

## 任務目標
根據 `docs/SPEC.md`，實作 LINE LIFF 學習繳費系統之「管理員權限與學生選單切換功能」。

---

## 任務清單

### Task 1: 後端邏輯擴充 (`GAS/code.gs`)
- [ ] **1.1 管理員身分檢查 (`action === 'check'`)**：
  - 讀取 Script Properties: `var adminUserId = PropertiesService.getScriptProperties().getProperty('ADMIN_USER_ID');`
  - 若 `userIdToCheck && adminUserId && userIdToCheck.trim() === adminUserId.trim()`：
    - 回傳附加屬性 `{ exists: true, isAdmin: true, name: "管理員", classroom: "I" }`。
- [ ] **1.2 新增 `action === 'get_students'` 介面**：
  - 檢查傳入之 `userId` 是否符合 `ADMIN_USER_ID`，非管理員拋出權限錯誤。
  - 支援 `refresh` 參數（布林值）。
  - 存取/建立試算表分頁 `學生名冊快取`：
    - 若 `refresh` 為 `true` 或工作表最後列數 `< 2`（快取為空）：
      - 執行掃描雲端硬碟 (`scanStudentFiles()`)。
      - 將結果整批覆寫寫入 `學生名冊快取` 工作表（欄位：姓名、教室、SheetID、更新時間）。
    - 否則直接讀取 `學生名冊快取` 工作表資料。
  - 回傳 `{ status: "success", students: [...] }`。
- [ ] **1.3 實作 `scanStudentFiles()` 函式**：
  - 掃描教室 I (`1A4SOGVwZCG77rA8lXfGaT1pHXoeJ7n8z`) 與教室 J (`1mYCVAVWSjn_b0T1yOnF96KakJ5jeQJqU`)。
  - 結合主表 `LINE LIFF member` 已註冊之精確對照。
  - 正則解析檔名學生姓名，排除範本或非試算表檔案。
  - 排序並回傳學生物件陣列 `[{ name, classroom, sheetId }]`。

### Task 2: 前端頁面結構與樣式 (`index.html`)
- [ ] **2.1 新增管理員學生選單區塊 (`#adminArea`)**：
  - 放置於 `.container` 內部，預設 `display: none;`。
  - 包含管理員標題、教室篩選按鈕群（全部、Im未來、Jeff Coding）、學生姓名即時搜尋框。
  - 學生列表容器 `#adminStudentList`（支援滾動與乾淨的卡片式設計）。
  - 底部操作按鈕：`#adminRefreshBtn`（🔄 重新整理名單）。
- [ ] **2.2 新增學生紀錄頁面頂部按鈕 (`#adminBackToMenuBtn`)**：
  - 放置於 `#welcomeMessage` 頂部（`#regName` 前方或上方）。
  - 預設隱藏，僅在管理員檢視模式下顯示「⬅️ 返回學生選單」。

### Task 3: 前端控制邏輯 (`script.js`)
- [ ] **3.1 支援管理員身分判定與分流**：
  - 在 `init()` 中呼叫 `checkUserExists()` 時，Console 輸出當前 LINE `userId` 方便複製設定。
  - 若 `userData && userData.isAdmin === true`：
    - 設定全域變數 `isCurrentAdmin = true`。
    - 隱藏 `#loadingArea`，顯示 `#adminArea`。
    - 呼叫 `loadAdminStudentList(false)` 載入學生清單。
- [ ] **3.2 實作學生選單載入與搜尋/篩選**：
  - `loadAdminStudentList(forceRefresh)`：呼叫 `/.netlify/functions/submit-form`，傳遞 `{ action: 'get_students', userId: profile.userId, refresh: forceRefresh }`。
  - `renderAdminStudentList()`：依當前選定教室與搜尋關鍵字動態渲染學生卡片。
  - 卡片點擊事件：呼叫 `viewStudentRecords(student)`。
- [ ] **3.3 實作學生紀錄檢視與返回**：
  - `viewStudentRecords(student)`：
    - 隱藏 `#adminArea`，顯示 `#welcomeMessage` 與 `#adminBackToMenuBtn`。
    - 依 `student.classroom` 切換主題色彩（`blue-theme` 或綠色）。
    - 設定 `#regName` 學生名稱。
    - 呼叫 `fetchClassRecords(student.name, student.sheetId)` 讀取上課與繳費紀錄。
  - `#adminBackToMenuBtn` 點擊事件：
    - 隱藏 `#welcomeMessage`，重新顯示 `#adminArea`。
    - 移除教室特定主題，恢復預設外觀。

### Task 4: 文件更新 (`README.md`)
- [ ] 更新 `README.md`，說明管理員功能、GAS 指令碼屬性設定與 Google Sheet 學生名冊快取機制。

---

## 驗收標準 (Acceptance Criteria)
1. **安全性**：只有與 `ADMIN_USER_ID` 完全一致的 LINE ID 能獲得管理員介面與存取學生清單。
2. **快取效能**：
   - 首次載入或點擊「🔄 重新整理」時掃描並寫入 `學生名冊快取` 分頁。
   - 後續進入時直接讀取分頁資料，反應時間在 0.5 秒以內。
3. **介面互動**：
   - 管理員可快速依教室過濾或輸入中文即時搜尋學生。
   - 點擊學生能正確套用主題（綠/藍）並載入日曆與繳費資料。
   - 點擊「⬅️ 返回學生選單」能正常回到選單並切換下一位學生。
4. **回歸測試**：一般學生帳號維持既有體驗，完全不受影響。
