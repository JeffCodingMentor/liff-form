exports.handler = async function (event, context) {
    // 確保留 API 只接受 POST 請求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        // 從 Netlify 的環境變數中讀取 GAS 網址
        const gasUrl = process.env.GAS_URL;

        if (!gasUrl) {
            console.error("GAS_URL is not set in environment variables.");
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Server configuration error' })
            };
        }

        // 解析前端傳來的資料
        const requestData = JSON.parse(event.body);

        // 將資料轉拋 (Forward) 給 Google Apps Script 網址
        const response = await fetch(gasUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        const resultText = await response.text();

        if (!response.ok) {
            console.error(`GAS responded with status: ${response.status}. Body: ${resultText}`);
            return {
                statusCode: 502,
                body: JSON.stringify({ 
                    error: 'Google Apps Script 傳回錯誤', 
                    status: response.status,
                    details: resultText 
                })
            };
        }
        
        let resultData;
        try {
            resultData = JSON.parse(resultText);
        } catch(e) {
            resultData = { message: resultText };
        }

        // 回傳成功訊息給前端
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, data: resultData })
        };

    } catch (error) {
        console.error("Error submitting to GAS:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to submit data' })
        };
    }
};
