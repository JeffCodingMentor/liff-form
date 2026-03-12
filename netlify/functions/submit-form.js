exports.handler = async function (event, context) {
    // 確保留 API 只接受 POST 請求
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    try {
        // 從 Netlify 的環境變數中讀取 GAS 網址，並去除可能的空白
        const gasUrl = (process.env.GAS_URL || "").trim();

        if (!gasUrl) {
            console.error("GAS_URL is missing in environment variables.");
            return {
                statusCode: 500,
                body: JSON.stringify({ error: '系統設定錯誤：缺少 GAS_URL' })
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
            body: JSON.stringify(requestData),
            redirect: 'follow' // 明確要求追蹤轉址 (對 GAS 非常重要)
        });

        const resultText = await response.text();

        if (!response.ok) {
            console.error(`GAS error: Status ${response.status}, Body: ${resultText}`);
            return {
                statusCode: 502, // Bad Gateway
                body: JSON.stringify({ 
                    error: 'Google Apps Script 伺服器傳回錯誤', 
                    status: response.status,
                    details: resultText.substring(0, 500) // 避免噴出太長的 HTML
                })
            };
        }
        
        let resultData;
        try {
            resultData = JSON.parse(resultText);
        } catch(e) {
            // 如果 GAS 傳回的不是 JSON (例如 HTML)，也把它包裝起來
            resultData = { message: resultText };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, data: resultData })
        };

    } catch (error) {
        console.error("Proxy error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: '連線至 GAS 失敗', details: error.message })
        };
    }
};
