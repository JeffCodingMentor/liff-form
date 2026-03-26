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
      
      // 取得所有資料 (從第 1 欄到第 6 欄)
      var lastRow = sheet.getLastRow();
      if (lastRow < 1) {
        return createResponse({ exists: false });
      }
      
      var dataRange = sheet.getRange(1, 1, lastRow, 6).getValues();
      var exists = false;
      var registeredName = "";
      
      for (var i = 0; i < dataRange.length; i++) {
        // 第 6 欄 (Index 5) 是 userId
        if (dataRange[i][5] === userIdToCheck) {
          exists = true;
          // 第 2 欄 (Index 1) 是姓名
          registeredName = dataRange[i][1];
          break;
        }
      }
      
      return createResponse({ exists: exists, name: registeredName });
    }
    
    // 2. 報名註冊 (系統登入)
    if (action === 'submit') {
      var name = data.name || '';
      var birthday = data.birthday || '';
      var classroom = data.classroom || '';
      var lineId = data.userId || '';
      var displayName = data.displayName || '';
      var timestamp = new Date();
      
      // 欄位順序: 時間戳記 | 姓名 | 生日 | 教室 | 顯示名稱 | LINE ID
      sheet.appendRow([timestamp, name, birthday, classroom, displayName, lineId]);
      
      return createResponse({ status: "success", message: "資料寫入成功" });
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
        var folders = primaryFolder.searchFolders("title contains '_" + userName + "'");
        if (folders.hasNext()) {
          var targetFolder = folders.next();
          var files = targetFolder.searchFiles("title contains '_" + userName + "' and mimeType = 'application/vnd.google-apps.spreadsheet'");
          if (files.hasNext()) {
            targetFile = files.next();
          }
        }
      } else if (classroom === 'J') {
        // 第二種情況 (教室 J)：直接到備用目錄搜尋 "檔案"
        var fallbackFolder = DriveApp.getFolderById(fallbackFolderId);
        var files = fallbackFolder.searchFiles("title contains '_" + userName + "' and mimeType = 'application/vnd.google-apps.spreadsheet'");
        if (files.hasNext()) {
          targetFile = files.next();
        }
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
