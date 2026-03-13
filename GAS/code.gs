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
      
      // 取得所有資料 (從第 1 欄到第 5 欄)
      var lastRow = sheet.getLastRow();
      if (lastRow < 1) {
        return createResponse({ exists: false });
      }
      
      var dataRange = sheet.getRange(1, 1, lastRow, 5).getValues();
      var exists = false;
      var registeredName = "";
      
      for (var i = 0; i < dataRange.length; i++) {
        // 第 5 欄 (Index 4) 是 userId
        if (dataRange[i][4] === userIdToCheck) {
          exists = true;
          // 第 2 欄 (Index 1) 是姓名
          registeredName = dataRange[i][1];
          break;
        }
      }
      
      return createResponse({ exists: exists, name: registeredName });
    }
    
    // 2. 報名註冊
    if (action === 'submit') {
      var name = data.name || '';
      var birthday = data.birthday || '';
      var lineId = data.userId || '';
      var displayName = data.displayName || '';
      var timestamp = new Date();
      
      sheet.appendRow([timestamp, name, birthday, displayName, lineId]);
      
      return createResponse({ status: "success", message: "資料寫入成功" });
    }
    // 3. 讀取上課紀錄
    if (action === 'get_records') {
      var userName = data.name;
      if (!userName) {
        throw new Error("Missing name for get_records");
      }
      
      var parentFolderId = '1A4SOGVwZCG77rA8lXfGaT1pHXoeJ7n8z';
      var parentFolder = DriveApp.getFolderById(parentFolderId);
      
      // 尋找名稱包含 _name 的子目錄 (假設格式為 nnn_name)
      var folders = parentFolder.searchFolders("title contains '_" + userName + "'");
      if (!folders.hasNext()) {
        return createResponse({ status: "success", records: [], message: "無相關目錄" });
      }
      var targetFolder = folders.next();
      
      // 尋找裡面的同名檔案
      var files = targetFolder.searchFiles("title contains '_" + userName + "' and mimeType = 'application/vnd.google-apps.spreadsheet'");
      if (!files.hasNext()) {
        return createResponse({ status: "success", records: [], message: "目錄中無該檔案" });
      }
      var targetFile = files.next();
      
      var recordSpreadsheet = SpreadsheetApp.openById(targetFile.getId());
      var sheetRecord = recordSpreadsheet.getSheetByName("上課紀錄");
      if (!sheetRecord) {
         return createResponse({ status: "success", records: [], message: "找不到上課紀錄工作表" });
      }
      
      var sheetLastRow = sheetRecord.getLastRow();
      if (sheetLastRow < 2) { // 假設至少要有一列表頭
         return createResponse({ status: "success", records: [] });
      }
      
      // 取到第 J 欄 (Index 9)
      var rangeValues = sheetRecord.getRange(1, 1, sheetLastRow, 10).getValues();
      var now = new Date();
      var currentYear = now.getFullYear();
      var currentMonth = now.getMonth(); // 0-based
      
      var records = [];
      // 假設第一列是表頭，從第二列開始
      for (var r = 1; r < rangeValues.length; r++) {
        var dateCell = rangeValues[r][0]; // A 欄，Index 0
        if (!dateCell) continue;
        
        var rowDate = new Date(dateCell);
        // 確認是有效的日期物件
        if (Object.prototype.toString.call(rowDate) === "[object Date]" && !isNaN(rowDate.getTime())) {
          if (rowDate.getFullYear() === currentYear && rowDate.getMonth() === currentMonth) {
             var colI = rangeValues[r][8] || ''; // I 欄
             var colJ = rangeValues[r][9] || ''; // J 欄
             
             // 如果 I J 都是空，可以選擇略過，或依然把日期印出
             if (colI !== '' || colJ !== '') {
               // 依預設時區格式化輸出日期字串
               records.push({
                 colI: colI.toString(), 
                 colJ: colJ.toString()
               });
             }
          }
        }
      }
      return createResponse({ status: "success", records: records });
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
