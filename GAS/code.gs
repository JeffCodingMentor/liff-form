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
    
    throw new Error("Invalid action: " + action);
    
  } catch (error) {
    return createResponse({ status: "error", message: error.toString() });
  }
}

function createResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
