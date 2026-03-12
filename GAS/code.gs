function doPost(e) {
  try {
    // 解析前端傳來的 JSON 資料
    var data = JSON.parse(e.postData.contents);
    
    var name = data.name || '';
    var birthday = data.birthday || '';
    var lineId = data.userId || '';
    var displayName = data.displayName || '';
    
    // 取得目前作用中的試算表與工作表
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // 取得當下時間
    var timestamp = new Date();
    
    // 寫入一行新資料：將依序存入第一欄到第五欄
    sheet.appendRow([timestamp, name, birthday, displayName, lineId]);
    
    // 回傳成功訊息
    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "message": "資料寫入成功"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // 處理錯誤
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
