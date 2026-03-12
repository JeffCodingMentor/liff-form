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
      
      // 取得第 5 欄 (userId) 的所有資料 (從第一列開始，假設資料不多)
      var lastRow = sheet.getLastRow();
      if (lastRow < 1) {
        return createResponse({ exists: false });
      }
      
      var columnE = sheet.getRange(1, 5, lastRow, 1).getValues();
      var exists = false;
      
      for (var i = 0; i < columnE.length; i++) {
        if (columnE[i][0] === userIdToCheck) {
          exists = true;
          break;
        }
      }
      
      return createResponse({ exists: exists });
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
