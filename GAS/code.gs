function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action; // 'check' or 'submit'
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 1. 檢查使用者是否存在
    if (action === 'check') {
      var userIdToCheck = data.userId;
      if (!userIdToCheck) {
        throw new Error("Missing userId for check");
      }
      
      // 取得所有資料 (從第 1 欄到第 7 欄，含 SheetID)
      var lastRow = sheet.getLastRow();
      if (lastRow < 1) {
        return createResponse({ exists: false });
      }
      
      var dataRange = sheet.getRange(1, 1, lastRow, 7).getValues();
      var exists = false;
      var registeredName = "";
      var registeredClassroom = "I";
      var registeredSheetId = "";
      
      for (var i = 0; i < dataRange.length; i++) {
        // 第 6 欄 (Index 5) 是 userId
        if (dataRange[i][5] === userIdToCheck) {
          exists = true;
          // 第 2 欄 (Index 1) 是姓名
          registeredName = dataRange[i][1];
          // 第 4 欄 (Index 3) 是教室
          registeredClassroom = dataRange[i][3] || "I";
          // 第 7 欄 (Index 6) 是上課紀錄 Sheet File ID (新欄位，舊資料可能為空)
          registeredSheetId = dataRange[i][6] || "";
          break;
        }
      }
      
      return createResponse({ exists: exists, name: registeredName, classroom: registeredClassroom, sheetId: registeredSheetId });
    }
    
    // 2. 報名註冊 (先驗證學生上課紀錄，再寫入)
    if (action === 'submit') {
      var name = data.name || '';
      var birthday = data.birthday || ''; // 格式: YYYY-MM-DD (來自前端 <input type="date">)
      var classroom = data.classroom || '';
      var lineId = data.userId || '';
      var displayName = data.displayName || '';
      var timestamp = new Date();
      
      // === Step 1: 依姓名+教室搜尋學生的上課紀錄 Google Sheet ===
      var parentFolderId = '1A4SOGVwZCG77rA8lXfGaT1pHXoeJ7n8z';
      var fallbackFolderId = '1mYCVAVWSjn_b0T1yOnF96KakJ5jeQJqU';
      var targetFile = null;
      
      if (classroom === 'I') {
        // 教室 I：從主目錄搜尋子目錄，再找其中的檔案
        var primaryFolder = DriveApp.getFolderById(parentFolderId);
        var targetFolder = findFolderByExactName(primaryFolder, name);
        if (targetFolder) {
          targetFile = findFileByExactName(targetFolder, name);
        }
      } else if (classroom === 'J') {
        // 教室 J：直接在備用目錄搜尋檔案
        var fallbackFolder = DriveApp.getFolderById(fallbackFolderId);
        targetFile = findFileByExactName(fallbackFolder, name);
      }
      
      // === Step 2: 找不到檔案 → 資料錯誤 ===
      if (!targetFile) {
        return createResponse({ status: "error", code: "DATA_ERROR", message: "資料錯誤：找不到該學生的上課紀錄檔案" });
      }
      
      var fileId = targetFile.getId();
      
      // === Step 3: 讀取 B6 儲存格的生日並格式化 ===
      var recordSpreadsheet = SpreadsheetApp.openById(fileId);
      // B6 的生日在學生檔案的【基本資料】分頁
      var profileSheet = recordSpreadsheet.getSheetByName("基本資料") || recordSpreadsheet.getSheets()[0];
      var b6Value = profileSheet.getRange("B6").getValue();
      
      var b6DateStr = '';
      if (b6Value instanceof Date && !isNaN(b6Value.getTime())) {
        // Date 物件 → 格式化為 YYYY-MM-DD
        b6DateStr = Utilities.formatDate(b6Value, "GMT+8", "yyyy-MM-dd");
      } else if (typeof b6Value === 'string' && b6Value.trim() !== '') {
        // 文字型態，嘗試解析各種台灣常見格式
        var raw = b6Value.trim();
        // 2010/03/15 or 2010-03-15
        var m1 = raw.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
        if (m1) {
          b6DateStr = m1[1] + '-' + ('0' + m1[2]).slice(-2) + '-' + ('0' + m1[3]).slice(-2);
        } else {
          // 2010年3月15日
          var m2 = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
          if (m2) {
            b6DateStr = m2[1] + '-' + ('0' + m2[2]).slice(-2) + '-' + ('0' + m2[3]).slice(-2);
          }
        }
      }
      
      // 同樣格式化前端傳來的 birthday (YYYY-MM-DD 應已標準，但做個保護)
      var normalizedBirthday = '';
      var bm = birthday.match(/(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
      if (bm) {
        normalizedBirthday = bm[1] + '-' + ('0' + bm[2]).slice(-2) + '-' + ('0' + bm[3]).slice(-2);
      }
      
      // === Step 4: 比對生日 ===
      if (!b6DateStr || !normalizedBirthday || b6DateStr !== normalizedBirthday) {
        return createResponse({
          status: "error",
          code: "VERIFY_ERROR",
          message: "驗證錯誤：生日與紀錄不符",
          debug: {
            b6Raw: b6Value ? b6Value.toString() : '(空白)',
            b6Parsed: b6DateStr || '(無法解析)',
            inputBirthday: birthday,
            inputNormalized: normalizedBirthday || '(無法解析)',
            sheetName: profileSheet.getName()
          }
        });
      }
      
      // === Step 5: 驗證成功，寫入主登錄表 ===
      // 欄位順序: 時間戳記 | 姓名 | 生日 | 教室 | 顯示名稱 | LINE ID | 上課紀錄SheetID
      sheet.appendRow([timestamp, name, birthday, classroom, displayName, lineId, fileId]);
      
      return createResponse({ status: "success", message: "驗證成功，資料寫入完成", fileId: fileId });
    }
    // 3. 讀取上課紀錄
    if (action === 'get_records') {
      var userName = data.name;
      if (!userName) {
        throw new Error("Missing name for get_records");
      }
      
      // 先從主表 (註冊表) 找出該學生的 "教室"
      var lastRow = sheet.getLastRow();
      var classroom = 'I'; // 預設為 I
      if (lastRow >= 1) {
        var dataRange = sheet.getRange(1, 1, lastRow, 6).getValues();
        for (var i = 0; i < dataRange.length; i++) {
          // 第 2 欄 (Index 1) 是姓名
          if (dataRange[i][1] === userName) {
            // 第 4 欄 (Index 3) 是教室
            classroom = dataRange[i][3] || 'I';
            break;
          }
        }
      }

      var parentFolderId = '1A4SOGVwZCG77rA8lXfGaT1pHXoeJ7n8z';
      var fallbackFolderId = '1mYCVAVWSjn_b0T1yOnF96KakJ5jeQJqU';
      
      var targetFile = null;

      if (classroom === 'I') {
        // 第一種情況 (教室 I)：從主目錄搜尋 "子目錄"，再找裡面的檔案
        var primaryFolder = DriveApp.getFolderById(parentFolderId);
        var targetFolder = findFolderByExactName(primaryFolder, userName);
        if (targetFolder) {
          targetFile = findFileByExactName(targetFolder, userName);
        }
      } else if (classroom === 'J') {
        // 第二種情況 (教室 J)：直接到備用目錄搜尋 "檔案"
        var fallbackFolder = DriveApp.getFolderById(fallbackFolderId);
        targetFile = findFileByExactName(fallbackFolder, userName);
      }

      if (!targetFile) {
        return createResponse({ status: "success", records: [], message: "找不到該學生的上課資料檔案" });
      }
      
      var recordSpreadsheet = SpreadsheetApp.openById(targetFile.getId());
      var sheetRecord = recordSpreadsheet.getSheetByName("上課紀錄");
      if (!sheetRecord) {
         return createResponse({ status: "success", records: [], message: "找不到上課紀錄工作表" });
      }
      
      var sheetLastRow = sheetRecord.getLastRow();
      var classRecords = [];
      if (sheetLastRow >= 2) {
        // 取到第 J 欄 (Index 9)
        var rangeValues = sheetRecord.getRange(2, 1, sheetLastRow - 1, 10).getValues();
        for (var r = 0; r < rangeValues.length; r++) {
          var dateCell = rangeValues[r][0]; // A 欄
          if (!dateCell) continue;
          
          var rowDate = new Date(dateCell);
          var dateStr = '';
          if (Object.prototype.toString.call(rowDate) === "[object Date]" && !isNaN(rowDate.getTime())) {
            dateStr = Utilities.formatDate(rowDate, "GMT+8", "yyyy-MM-dd");
          } else {
            dateStr = dateCell.toString();
          }
          
          var colI = rangeValues[r][8] || ''; // I 欄
          var colJ = rangeValues[r][9] || ''; // J 欄
          
          if (colI !== '' || colJ !== '') {
            classRecords.push({
              date: dateStr,
              colI: colI.toString(), 
              colJ: colJ.toString()
            });
          }
        }
      }

      var debugLogs = [];
      debugLogs.push("Start looking for payment data v2");

      // --- 讀取繳費紀錄 ---
      var cycles = [];
      var sheetPayment = recordSpreadsheet.getSheetByName("繳費紀錄");
      if (sheetPayment) {
        debugLogs.push("Found '繳費紀錄' sheet");
        var paymentLastRow = sheetPayment.getLastRow();
        debugLogs.push("paymentLastRow: " + paymentLastRow);
        
        if (paymentLastRow >= 2) {
          // 讀取 A 到 R 欄 (index 0 到 17)
          var paymentValues = sheetPayment.getRange(2, 1, paymentLastRow - 1, 18).getValues();
          
          for (var p = 0; p < paymentValues.length; p++) {
            var row = paymentValues[p];
            if (!row[0]) continue; // 忽略沒有月份的列
            
            var startDateStr = '';
            var endDateStr = '';
            var startDateObj = new Date(row[1]); // B 欄
            var endDateObj = new Date(row[2]);   // C 欄
            
            if (Object.prototype.toString.call(startDateObj) === "[object Date]" && !isNaN(startDateObj.getTime())) {
               startDateStr = Utilities.formatDate(startDateObj, "GMT+8", "yyyy-MM-dd");
            }
            if (Object.prototype.toString.call(endDateObj) === "[object Date]" && !isNaN(endDateObj.getTime())) {
               endDateStr = Utilities.formatDate(endDateObj, "GMT+8", "yyyy-MM-dd");
            }

            var classDates = [];
            // I 欄到 R 欄的索引是 8 到 17
            for (var c = 8; c <= 17; c++) {
               var cd = row[c];
               if (cd) {
                 var cdObj = new Date(cd);
                 if (Object.prototype.toString.call(cdObj) === "[object Date]" && !isNaN(cdObj.getTime())) {
                    classDates.push(Utilities.formatDate(cdObj, "GMT+8", "yyyy-MM-dd"));
                 } else if (typeof cd === 'string' && cd.trim() !== '') {
                    classDates.push(cd.trim());
                 } else {
                    classDates.push(cd.toString());
                 }
               }
            }

            var payDateStr = '';
            if (row[6]) {
              var pDateObj = new Date(row[6]);
              if (Object.prototype.toString.call(pDateObj) === "[object Date]" && !isNaN(pDateObj.getTime())) {
                payDateStr = Utilities.formatDate(pDateObj, "GMT+8", "yyyy-MM-dd");
              } else {
                payDateStr = row[6].toString();
              }
            }

            cycles.push({
               month: row[0].toString(),
               start: startDateStr,
               end: endDateStr,
               total: row[3] || 0,
               balance: row[4] || 0,
               actual: row[5] || '',
               payDate: payDateStr,
               classDates: classDates
            });
          }
        } else {
           debugLogs.push("No data rows in '繳費紀錄'");
        }
      } else {
         debugLogs.push("Sheet '繳費紀錄' not found");
      }
      
      // 反轉陣列，讓新的週期在前面
      cycles.reverse();
      
      return createResponse({ 
        status: "success", 
        cycles: cycles,
        classRecords: classRecords,
        classroom: classroom,
        debugLogs: debugLogs
      });
    }
    
    throw new Error("Invalid action: " + action);
    
  } catch (error) {
    return createResponse({ status: "error", message: error.toString() });
  }
}

function createResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 在資料夾中以精確名稱搜尋 Google Sheets 檔案。
 * 策略：Drive API 用 contains 預先過濾，再用 regex 確認 '_name' 後方不緊接中文字，
 * 以避免「陳希」誤配「陳希望」的問題。
 */
function findFileByExactName(folder, name) {
  // \u4e00-\u9fff 涵蓋常用 CJK 中文字範圍
  var regex = new RegExp('_' + name + '([^\u4e00-\u9fff]|$)');
  var files = folder.searchFiles(
    "title contains '_" + name + "' and mimeType = 'application/vnd.google-apps.spreadsheet'"
  );
  while (files.hasNext()) {
    var f = files.next();
    if (regex.test(f.getName())) {
      return f;
    }
  }
  return null;
}

/**
 * 在資料夾中以精確名稱搜尋子資料夾（教室 I 的目錄結構用）。
 */
function findFolderByExactName(parentFolder, name) {
  var regex = new RegExp('_' + name + '([^\u4e00-\u9fff]|$)');
  var folders = parentFolder.searchFolders("title contains '_" + name + "'");
  while (folders.hasNext()) {
    var f = folders.next();
    if (regex.test(f.getName())) {
      return f;
    }
  }
  return null;
}
