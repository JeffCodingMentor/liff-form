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
    
    // 清空現有表格內容 (只保留表頭)
    const tbody = document.getElementById('recordsTableBody');
    if (tbody) tbody.innerHTML = '';
    
    // 隱藏可能有的錯誤/無紀錄訊息
    const emptyMsg = document.getElementById('recordsEmptyMsg');
    if (emptyMsg) {
        emptyMsg.style.display = 'none';
        emptyMsg.innerText = '';
    }
    
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
        
        if (resData && resData.data) {
            const records = resData.data.records || [];
            renderCalendar(records); // 繪製月曆
            
            if (records.length > 0) {
                // 有紀錄時，確保表格顯示
                document.getElementById('recordsTable').style.display = 'table';
                records.forEach(r => {
                    const tr = document.createElement('tr');
                    
                    const tdI = document.createElement('td');
                    tdI.style.padding = '8px';
                    tdI.style.borderBottom = '1px solid #eee';
                    tdI.innerText = r.colI || '-';
                    
                    const tdJ = document.createElement('td');
                    tdJ.style.padding = '8px';
                    tdJ.style.borderBottom = '1px solid #eee';
                    tdJ.innerText = r.colJ || '-';
                    
                    tr.appendChild(tdI);
                    tr.appendChild(tdJ);
                    if (tbody) tbody.appendChild(tr);
                });
            } else {
                // 沒有紀錄
                document.getElementById('recordsTable').style.display = 'none';
                if (emptyMsg) {
                    emptyMsg.style.display = 'block';
                    emptyMsg.innerText = '目前無這個月的上課記錄';
                }
            }

            // 處理繳費記錄
            if (resData.data.payment) {
                renderPaymentRecords(resData.data.payment);
            } else {
                document.getElementById('paymentRecordsContainer').style.display = 'none';
            }
            
            // 顯示備註如果有的話
            if (resData.data.message && emptyMsg) {
                 emptyMsg.style.display = 'block';
                 emptyMsg.innerText += (emptyMsg.innerText ? '\n' : '') + `備註: ${resData.data.message}`;
            }
        } else {
            document.getElementById('recordsTable') && (document.getElementById('recordsTable').style.display = 'none');
            if (emptyMsg) {
                emptyMsg.style.display = 'block';
                emptyMsg.innerText = '無法讀取記錄，格式異常';
            }
        }
    } catch (err) {
        console.error("Fetch records failed:", err);
        if (loading) loading.style.display = 'none';
        document.getElementById('recordsTable') && (document.getElementById('recordsTable').style.display = 'none');
        if (emptyMsg) {
            emptyMsg.style.display = 'block';
            emptyMsg.innerText = '讀取記錄失敗';
        }
    }
}

function renderCalendar(records) {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    
    if (!records || records.length === 0) {
        calendarEl.style.display = 'none';
        return;
    }
    
    const classDates = new Set();
    records.forEach(r => {
        let rStr = r.colI || '';
        let parsed = false;
        
        // 找 yyyy-mm-dd 或是 yyyy/mm/dd
        let m = rStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if(m) {
            classDates.add(m[1] + '-' + parseInt(m[2]) + '-' + parseInt(m[3]));
            parsed = true;
        }
        if(!parsed) {
            // 找 mm-dd 或是 mm/dd
            m = rStr.match(/(?:^|[^\d])(\d{1,2})[-/](\d{1,2})(?:[^\d]|$)/);
            if(m) {
                let now = new Date();
                classDates.add(now.getFullYear() + '-' + parseInt(m[1]) + '-' + parseInt(m[2]));
                parsed = true;
            }
        }
        if(!parsed) {
            // 找 m月d日 或是 m月d號
            m = rStr.match(/(\d{1,2})月(\d{1,2})[日號]/);
            if(m) {
                let now = new Date();
                classDates.add(now.getFullYear() + '-' + parseInt(m[1]) + '-' + parseInt(m[2]));
                parsed = true;
            }
        }
    });

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let html = `<div style="text-align: center; font-weight: bold; margin-bottom: 10px; color: #444;">${year}年${month + 1}月</div>`;
    html += `<table style="width: 100%; text-align: center; border-collapse: collapse;">`;
    html += `<thead><tr>`;
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    days.forEach(d => html += `<th style="padding: 5px; font-weight: normal; color: #999; font-size: 13px;">${d}</th>`);
    html += `</tr></thead><tbody><tr>`;
    
    for (let i = 0; i < firstDay.getDay(); i++) {
        html += `<td></td>`;
    }
    
    let currentDow = firstDay.getDay();
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr = year + '-' + (month + 1) + '-' + day;
        const hasClass = classDates.has(dateStr);
        // 上課日期標上不一樣的底色 (例如淺綠色代表有課)
        const bg = hasClass ? '#e6f4ea' : 'transparent';
        const color = hasClass ? '#137333' : '#444';
        const fw = hasClass ? 'bold' : 'normal';
        const br = hasClass ? '50%' : '0';
        
        html += `<td style="padding: 3px;">
                    <div style="width: 26px; height: 26px; line-height: 26px; margin: 0 auto; background: ${bg}; color: ${color}; font-weight: ${fw}; border-radius: ${br}; font-size: 14px;">${day}</div>
                 </td>`;
                 
        currentDow++;
        if (currentDow > 6) {
            html += `</tr><tr>`;
            currentDow = 0;
        }
    }
    
    while (currentDow > 0 && currentDow <= 6) {
        html += `<td></td>`;
        currentDow++;
    }
    
    html += `</tr></tbody></table>`;
    
    calendarEl.innerHTML = html;
    calendarEl.style.display = 'block';
}

function renderPaymentRecords(payment) {
    const container = document.getElementById('paymentRecordsContainer');
    if (!container || !payment) return;

    document.getElementById('payMonth').innerText = payment.month || '-';
    document.getElementById('payTotal').innerText = '$' + (payment.total !== undefined ? payment.total.toLocaleString() : '0');
    document.getElementById('payBalance').innerText = '$' + (payment.balance !== undefined ? payment.balance.toLocaleString() : '0');

    const actualArea = document.getElementById('actualPaymentArea');
    if (payment.actual !== undefined && payment.actual !== '') {
        actualArea.style.display = 'block';
        document.getElementById('payActual').innerText = '$' + payment.actual.toLocaleString();
        document.getElementById('payDate').innerText = payment.payDate || '-';
    } else {
        actualArea.style.display = 'none';
    }

    container.style.display = 'block';
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
