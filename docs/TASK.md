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
- [x] 更新 `README.md`，說明管理員功能、GAS 指令碼屬性設定與 Google Sheet 學生名冊快取機制。

### Task 5: 介面與掃描優化需求 (Update)
- [x] **5.1 排除特定目錄 (`GAS/code.gs`)**：
  - 掃描教室 I 時，嚴格排除目錄名稱包含 `試聽紀錄` 或 `Template` 的資料夾及其下檔案。
- [x] **5.2 簡化管理員選單介面 (`index.html` / `script.js`)**：
  - 移除 `#adminArea` 最上方的「管理員控制台」標題。
  - 移除 `#adminArea` 最下方的「關閉系統」按鈕，並自 `script.js` 移除其事件監聽。
- [x] **5.3 Jeff Coding 藍色主題強化 (`index.html` / `script.js`)**：
  - Jeff Coding 學生卡片改以藍色底顯示（`#e7f3ff` 背景、`#b8daff` 邊框、`#004085` 文字）。
  - Jeff Coding 教室篩選按鈕 (`button[data-classroom="J"]`) 預設與選取皆套用藍色風格。
- [x] **5.4 測試更新 (`tests/admin.test.cjs`)**：
  - 更新測試涵蓋排除 `試聽紀錄` 與 `Template` 目錄，驗證 Jeff Coding 藍底樣式與按鈕調整。

### Task 6: 排序優化與按鈕色系調整 (Update 2)
- [ ] **6.1 檔名前綴數字排序 (`GAS/code.gs`)**：
  - 解析檔名（或資料夾名）開頭之數字編號（例如 `001_小明`、`12_大華`）。
  - 排序邏輯：Im未來 (`I`) 在前、Jeff Coding (`J`) 在後；同教室內依照數字編號由小到大排序；無編號者排最後；相同編號者依中文姓名筆劃排序。
- [x] **6.2 篩選按鈕色彩調整 (`index.html`)**：
  - 「全部」按鈕（`data-classroom="all"`）改為黃色/琥珀系：
    - `aria-pressed="true"`：背景琥珀色（`#d97706`），文字白色。
    - `aria-pressed="false"`：背景淡琥珀色（`#fef3c7`），文字 `#92400e`，邊框 `#fcd34d`。
  - 「Im未來」按鈕（`data-classroom="I"`）未按下時改為綠色系：
    - `aria-pressed="false"`：背景淡綠色（`#e6f4ea`），文字 `#137333`，邊框 `#c8e6c9`。
    - `aria-pressed="true"`：保持主題綠（`#00b900`），文字白色。
- [x] **6.3 更新測試 (`tests/admin.test.cjs`)**：
  - 加入數字編號排序案例（測試包含 `001_`、`002_`、`10_` 等編號學生跨教室與同教室排序）。
  - 加入按鈕色彩樣式檢驗。
  - 執行並確保全部測試通過。

### Task 7: 修正前綴編號解析(相容J01/J04等格式)與Im學生字型綠色系
- [x] **7.1 後端前綴編號解析擴充 (`GAS/code.gs`)**：
  - 檔名與資料夾前綴編號支援包含英文字母前綴格式（例如 `J04`、`J01`、`I02` 等或 `001`、`04`），正確解析出數值大小（`J01` -> 1, `J04` -> 4），確保排序為 J01, J03, J04, J05 由小到大。
  - 檔名提取姓名正則需相容 `J04_姓名_上課紀錄` 或 `J04_姓名` 等格式。
- [x] **7.2 前端 Im 教室學生卡片字型改為綠色系 (`index.html` / `script.js`)**：
  - Im 教室的卡片字型顏色設定為綠色系（例如 `#137333` 或 `#007700`，子標籤亦設定綠色系）。
- [x] **7.3 更新並執行單元測試 (`tests/admin.test.cjs`)**：
  - 新增 J04, J01, J03, J05 的排序案例驗證排序結果為 J01, J03, J04, J05。
  - 驗證 Im 卡片字型綠色系 CSS 規範。
  - 執行 `node --test tests/admin.test.cjs` 確保全部通過。


---

## 驗收標準 (Acceptance Criteria)
1. **安全性**：只有與 `ADMIN_USER_ID` 完全一致的 LINE ID 能獲得管理員介面與存取學生清單。
2. **快取效能**：
   - 首次載入或點擊「🔄 重新整理」時掃描並寫入 `學生名冊快取` 分頁。
   - 後續進入時直接讀取分頁資料，反應時間在 0.5 秒以內。
3. **目錄排除精確度**：
   - 教室 I 目錄中「紀錄表-Im\試聽紀錄」與「紀錄表-Im\Template」內的試算表完全不進入學生名冊。
4. **介面互動與色彩**：
   - 選單頂部直接由統計與篩選開始，底部無關閉系統按鈕。
   - Jeff Coding 學生以藍色底呈現，Jeff Coding 按鈕亦為藍色底。
   - 點擊學生能正確套用主題（綠/藍）並載入日曆與繳費資料。
   - 點擊「⬅️ 返回學生選單」能正常回到選單並切換下一位學生。
5. **回歸測試**：一般學生帳號維持既有體驗，完全不受影響。
