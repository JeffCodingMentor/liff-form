const liffId = '2009406277-fAYDHQN4';
const oaId = '@332tttbt'; // <-- 記得修改這裡

let globalCycles = [];
let globalClassRecords = [];

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
    const selectorContainer = document.getElementById('cycleSelectorContainer');
    const loading = document.getElementById('recordsLoading');
    
    if (selectorContainer) selectorContainer.style.display = 'none';
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
        console.log("Response Data API:", resData); // [DEBUG LOG]
        
        if (loading) loading.style.display = 'none';
        
        if (resData && resData.data) {
            console.log("Has resData.data"); // [DEBUG LOG]
            globalCycles = resData.data.cycles || [];
            globalClassRecords = resData.data.classRecords || [];
            
            if (globalCycles.length > 0) {
                // 尋找出預設的計費週期 (對應今天的日期)
                let defaultIndex = 0;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                for (let i = 0; i < globalCycles.length; i++) {
                    const c = globalCycles[i];
                    if (c.start && c.end) {
                        const s = new Date(c.start); s.setHours(0, 0, 0, 0);
                        const e = new Date(c.end); e.setHours(23, 59, 59, 999);
                        if (today >= s && today <= e) {
                            defaultIndex = i;
                            break;
                        }
                    }
                }
                
                renderDropdown(defaultIndex);
                updateDisplay(defaultIndex);
            } else {
                 document.getElementById('cycleSelectorContainer') && (document.getElementById('cycleSelectorContainer').style.display = 'none');
                 document.getElementById('recordsTable') && (document.getElementById('recordsTable').style.display = 'none');
                 document.getElementById('paymentRecordsContainer') && (document.getElementById('paymentRecordsContainer').style.display = 'none');
                 if (emptyMsg) {
                     emptyMsg.style.display = 'block';
                     emptyMsg.innerText = '尚無繳費紀錄資料可以顯示';
                 }
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
            emptyMsg.innerText = '讀取記錄失敗，請確認網路連線';
        }
    }
}

function renderDropdown(defaultIndex) {
    const container = document.getElementById('cycleSelectorContainer');
    const select = document.getElementById('cycleSelector');
    if (!container || !select) return;

    select.innerHTML = '';
    globalCycles.forEach((c, idx) => {
        const option = document.createElement('option');
        option.value = idx;
        option.innerText = c.month || `週期 ${idx + 1}`;
        if (idx === defaultIndex) option.selected = true;
        select.appendChild(option);
    });

    container.style.display = 'block';

    select.onchange = function() {
        updateDisplay(parseInt(this.value, 10));
    };
}

function updateDisplay(index) {
    const cycle = globalCycles[index];
    if (!cycle) return;

    // 1. 繪製月曆
    renderCalendar(cycle.classDates, cycle.start, cycle.end);

    // 2. 顯示上課紀錄表格
    const tbody = document.getElementById('recordsTableBody');
    if (tbody) tbody.innerHTML = '';
    const emptyMsg = document.getElementById('recordsEmptyMsg');
    if (emptyMsg) {
        emptyMsg.style.display = 'none';
        emptyMsg.innerText = '';
    }

    let matchedRecords = [];
    if (cycle.start && cycle.end) {
        let sTime = new Date(cycle.start).getTime();
        let eTime = new Date(cycle.end).setHours(23, 59, 59, 999);
        matchedRecords = globalClassRecords.filter(r => {
             let rTime = new Date(r.date).getTime();
             return !isNaN(rTime) && rTime >= sTime && rTime <= eTime;
        });
    }

    if (matchedRecords.length > 0) {
        document.getElementById('recordsTable').style.display = 'table';
        matchedRecords.forEach(r => {
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
        document.getElementById('recordsTable').style.display = 'none';
        if (emptyMsg) {
            emptyMsg.style.display = 'block';
            emptyMsg.innerText = '此計費週期無相關上課紀錄 (在工作表中無對應日期的紀錄)';
        }
    }

    // 3. 顯示繳費紀錄
    renderPaymentRecords(cycle);
}

function renderCalendar(classDates, startDateStr, endDateStr) {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    
    // 將收到的 classDates 轉換為 Set 方便比對
    const classDatesSet = new Set();
    if (classDates && classDates.length > 0) {
        classDates.forEach(dStr => {
           let m = dStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
           if (m) {
               classDatesSet.add(m[1] + '-' + parseInt(m[2]) + '-' + parseInt(m[3]));
           } else {
               // 嘗試加入不完整的格式，但不一定能直接對應到日曆
               classDatesSet.add(dStr);
           }
        });
    }

    if (!startDateStr || !endDateStr) {
        calendarEl.style.display = 'none';
        return;
    }

    let sDate = new Date(startDateStr);
    let eDate = new Date(endDateStr);
    
    // 防止日期解析失敗
    if (isNaN(sDate.getTime()) || isNaN(eDate.getTime())) {
        calendarEl.style.display = 'none';
        return;
    }

    let startYear = sDate.getFullYear();
    let startMonth = sDate.getMonth();
    let endYear = eDate.getFullYear();
    let endMonth = eDate.getMonth();

    let html = '';
    let currY = startYear;
    let currM = startMonth;

    // 迴圈確保能畫出跨月的日曆 (例如 10/25 ~ 11/24 會畫出 10 月與 11 月)
    while (currY < endYear || (currY === endYear && currM <= endMonth)) {
        const firstDay = new Date(currY, currM, 1);
        const lastDay = new Date(currY, currM + 1, 0);

        html += `<div style="text-align: center; font-weight: bold; margin-bottom: 5px; color: #444; ${html.length > 0 ? 'margin-top: 15px;' : ''}">${currY}年${currM + 1}月</div>`;
        html += `<table style="width: 100%; text-align: center; border-collapse: collapse; margin-bottom: 10px;">`;
        html += `<thead><tr>`;
        const days = ['日', '一', '二', '三', '四', '五', '六'];
        days.forEach(d => html += `<th style="padding: 5px; font-weight: normal; color: #999; font-size: 13px;">${d}</th>`);
        html += `</tr></thead><tbody><tr>`;
        
        let currentDow = firstDay.getDay();
        for (let i = 0; i < currentDow; i++) html += `<td></td>`;
        
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dateStr = currY + '-' + (currM + 1) + '-' + day;
            const hasClass = classDatesSet.has(dateStr);
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

        currM++;
        if (currM > 11) {
            currM = 0;
            currY++;
        }
    }

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
