const liffId = '2009406277-fAYDHQN4';
const oaId = '@332tttbt'; // <-- 記得修改這裡

async function init() {
    try {
        await liff.init({ liffId: liffId });
        if (!liff.isLoggedIn()) {
            liff.login();
        } else {
            document.getElementById('status').innerText = '正在檢查報名狀態...';
            
            // 取得使用者 Profile 並檢查是否已註冊
            const profile = await liff.getProfile();
            const userData = await checkUserExists(profile.userId);
            
            document.getElementById('loadingArea').style.display = 'none';
            
            if (userData && userData.exists) {
                document.getElementById('regName').innerText = userData.name || '';
                document.getElementById('welcomeMessage').style.display = 'block';
                document.getElementById('status').innerText = '歡迎回來';
                
                // 讀取上課紀錄
                fetchClassRecords(userData.name);
            } else {
                document.getElementById('registrationForm').style.display = 'block';
                document.getElementById('status').innerText = '準備就緒，請填寫資料';
            }
        }
    } catch (e) {
        document.getElementById('status').innerText = 'LIFF 初始化失敗';
    }
}

async function checkUserExists(userId) {
    try {
        const response = await fetch('/.netlify/functions/submit-form', {
            method: 'POST',
            body: JSON.stringify({
                action: 'check',
                userId: userId
            })
        });
        const resData = await response.json();
        return resData.data; // 回傳 { exists: true, name: "..." }
    } catch (err) {
        console.error("Check user failed:", err);
        return { exists: false };
    }
}

async function fetchClassRecords(userName) {
    const container = document.getElementById('classRecordsContainer');
    const loading = document.getElementById('recordsLoading');
    const list = document.getElementById('recordsList');
    
    if (container) container.style.display = 'block';
    if (loading) loading.style.display = 'block';
    if (list) list.innerHTML = '';
    
    try {
        const response = await fetch('/.netlify/functions/submit-form', {
            method: 'POST',
            body: JSON.stringify({
                action: 'get_records',
                name: userName
            })
        });
        const resData = await response.json();
        
        if (loading) loading.style.display = 'none';
        
        if (resData && resData.data && resData.data.records) {
            const records = resData.data.records;
            if (records.length > 0) {
                records.forEach(r => {
                    const li = document.createElement('li');
                    li.style.padding = '8px 0';
                    li.style.borderBottom = '1px dashed #eee';
                    li.innerText = `${r.date}：${r.colI} / ${r.colJ}`;
                    list.appendChild(li);
                });
            } else {
                // 沒有紀錄
                const li = document.createElement('li');
                li.style.padding = '8px 0';
                li.innerText = '目前無這個月的上課記錄';
                list.appendChild(li);
            }
            
            // 顯示備註如果有的話
            if (resData.data.message) {
                 const msgLi = document.createElement('li');
                 msgLi.style.fontSize = '12px';
                 msgLi.style.color = '#999';
                 msgLi.style.paddingTop = '8px';
                 msgLi.innerText = `備註: ${resData.data.message}`;
                 list.appendChild(msgLi);
            }
        } else {
            list.innerHTML = '<li>無法讀取記錄，格式異常</li>';
        }
    } catch (err) {
        console.error("Fetch records failed:", err);
        if (loading) loading.style.display = 'none';
        if (list) list.innerHTML = '<li>讀取記錄失敗</li>';
    }
}

// 跳轉聊天室共用邏輯
function redirectToOA() {
    const redirectUrl = `https://line.me/R/ti/p/${oaId}`;
    liff.openWindow({
        url: redirectUrl,
        external: false
    });
    setTimeout(() => {
        liff.closeWindow();
    }, 500);
}

document.getElementById('chatBtn').addEventListener('click', () => {
    redirectToOA();
});

document.getElementById('submitBtn').addEventListener('click', async () => {
    const inputName = document.getElementById('userName').value;
    const birthday = document.getElementById('userBirthday').value;

    if (!inputName || !birthday) {
        alert('請完整填寫姓名與生日！');
        return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = '處理中...';

    try {
        const profile = await liff.getProfile();
        
        // 傳送資料到 Netlify Function
        const response = await fetch('/.netlify/functions/submit-form', {
            method: 'POST',
            body: JSON.stringify({
                action: 'submit',
                name: inputName,
                birthday: birthday,
                userId: profile.userId,
                displayName: profile.displayName
            })
        });

        if (!response.ok) {
            throw new Error('伺服器錯誤，寫入資料失敗');
        }

        redirectToOA();

    } catch (err) {
        alert('發生錯誤: ' + err);
        btn.disabled = false;
        btn.innerText = '確認並前往聊天室';
    }
});

init();
