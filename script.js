const liffId = '2009406277-fAYDHQN4';
const oaId = '@838phhvg';

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
                // 在讀取詳細資料前，先根據 "教室" 決定顏色風格
                if (userData.classroom === 'J') {
                    document.body.classList.add('blue-theme');
                } else {
                    document.body.classList.remove('blue-theme');
                }

                document.getElementById('regName').innerText = userData.name || '';
                document.getElementById('welcomeMessage').style.display = 'block';
                document.getElementById('status').innerText = ''; // 清除狀態文字
                
                // 讀取上課紀錄（傳入 sheetId 可直接開啟檔案、避免同名問題）
                fetchClassRecords(userData.name, userData.sheetId || '');
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

async function fetchClassRecords(userName, sheetId) {
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
                name: userName,
                sheetId: sheetId || ''
            })
        });
        const resData = await response.json();
        console.log("Response Data API:", resData); // [DEBUG LOG]
        
        if (loading) loading.style.display = 'none';
        
        if (resData && resData.data) {
            console.log("Has resData.data"); // [DEBUG LOG]
            globalCycles = resData.data.cycles || [];
            globalClassRecords = resData.data.classRecords || [];
            
            // 再次確認主題 (以資料回傳為準)
            if (resData.data.classroom) {
                if (resData.data.classroom === 'J') {
                    document.body.classList.add('blue-theme');
                } else {
                    document.body.classList.remove('blue-theme');
                }
            }

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
        
        // 格式化日期：將 2026-01-01 轉為 2026/01/01
        const startDisp = (c.start || '').replace(/-/g, '/');
        const endDisp = (c.end || '').replace(/-/g, '/');
        
        option.innerText = `${c.month || `週期 ${idx + 1}`} (${startDisp} ~ ${endDisp})`;
        
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

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

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
            
            // 若上課日期在今天之後，代表「預約」上課，整列以淺灰色顯示
            let isFuture = false;
            if (r.date) {
                let rDate = new Date(r.date);
                if (!isNaN(rDate.getTime()) && rDate > todayEnd) {
                    isFuture = true;
                }
            }
            if (isFuture) {
                tr.style.color = '#9e9e9e';
            }
            
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

    // 檢查目前週期是否包含任何預約（明天及之後）的上課
    let hasReservation = false;
    if (cycle.classDates && cycle.classDates.length > 0) {
        for (const dStr of cycle.classDates) {
            const d = new Date(dStr);
            if (!isNaN(d.getTime()) && d > todayEnd) {
                hasReservation = true;
                break;
            }
        }
    }
    if (!hasReservation && matchedRecords.length > 0) {
        for (const r of matchedRecords) {
            const d = new Date(r.date);
            if (!isNaN(d.getTime()) && d > todayEnd) {
                hasReservation = true;
                break;
            }
        }
    }

    // 3. 顯示繳費紀錄
    renderPaymentRecords(cycle, hasReservation);
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

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

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
            const dayDate = new Date(currY, currM, day);
            const isFuture = dayDate > todayEnd;

            let bg = 'transparent';
            let color = '#444';
            let fw = 'normal';
            let br = '0';
            let border = '2px solid transparent';

            if (hasClass) {
                fw = 'bold';
                br = '50%';
                if (isFuture) {
                    // 預約上課：主題色空心圓圈
                    bg = 'transparent';
                    color = 'var(--primary-color)';
                    border = '2px solid var(--primary-color)';
                } else {
                    // 過去或今日上課：實心底色
                    bg = 'var(--cal-bg)';
                    color = 'var(--cal-text)';
                }
            }
            
            html += `<td style="padding: 3px;">
                        <div style="width: 26px; height: 26px; line-height: 22px; box-sizing: border-box; margin: 0 auto; background: ${bg}; color: ${color}; font-weight: ${fw}; border-radius: ${br}; border: ${border}; font-size: 14px;">${day}</div>
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

function renderPaymentRecords(payment, hasReservation = false) {
    const container = document.getElementById('paymentRecordsContainer');
    if (!container || !payment) return;

    // 格式化日期：將 2026-01-01 轉為 2026/01/01
    const startDisp = (payment.start || '').replace(/-/g, '/');
    const endDisp = (payment.end || '').replace(/-/g, '/');
    document.getElementById('payMonth').innerText = `${startDisp} ~ ${endDisp}`;
    
    const totalEl = document.getElementById('payTotal');
    totalEl.innerText = '$' + (payment.total !== undefined ? payment.total.toLocaleString() : '0');
    totalEl.style.color = hasReservation ? '#9e9e9e' : '';
    
    const balanceEl = document.getElementById('payBalance');
    const balance = payment.balance || 0;
    balanceEl.innerText = '$' + balance.toLocaleString();

    if (balance < 0) {
        // 負值：有預約時顯示淺紅色，無預約顯示正常紅色
        balanceEl.style.color = hasReservation ? '#ef9a9a' : '#d32f2f';
    } else {
        // 零或正值：有預約時顯示淺灰色，無預約還原預設顏色
        balanceEl.style.color = hasReservation ? '#9e9e9e' : '';
    }

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
    liff.closeWindow();
});

document.getElementById('submitBtn').addEventListener('click', async () => {
    const inputName = document.getElementById('userName').value;
    const birthday = document.getElementById('userBirthday').value;
    const classroom = document.getElementById('userClassroom').value;

    if (!inputName || !birthday || !classroom) {
        alert('請完整填寫姓名、生日並選擇教室！');
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
                classroom: classroom,
                userId: profile.userId,
                displayName: profile.displayName
            })
        });

        if (!response.ok) {
            throw new Error('伺服器錯誤，請稍後再試');
        }

        const resJson = await response.json();
        const innerData = resJson.data || {};

        // 處理 GAS 回傳的錯誤碼
        if (innerData.status === 'error') {
            if (innerData.code === 'DATA_ERROR') {
                alert('資料錯誤：找不到您的上課紀錄，請確認姓名與教室是否填寫正確。');
            } else if (innerData.code === 'VERIFY_ERROR') {
                alert('驗證錯誤：生日與上課紀錄中的資料不符，請重新確認。');
            } else {
                alert('發生錯誤：' + (innerData.message || '未知錯誤'));
            }
            btn.disabled = false;
            btn.innerText = '確認';
            return;
        }

        // 驗證成功，發送註冊完成訊息 (僅限 LINE App 內開啟)
        if (liff.isInClient()) {
            const roomName = (classroom === 'I') ? 'Im未來' : 'Jeff Coding';
            liff.sendMessages([{
                type: 'text',
                text: `我已完成註冊！\n學生姓名：${inputName}\n所屬教室：${roomName}`
            }]).catch(err => console.error("Send message failed:", err));
        }

        // 註冊成功後，直接進入已註冊畫面
        document.getElementById('registrationForm').style.display = 'none';
        
        // 根據剛才選的教室套用主題
        if (classroom === 'J') {
            document.body.classList.add('blue-theme');
        } else {
            document.body.classList.remove('blue-theme');
        }

        document.getElementById('regName').innerText = inputName;
        document.getElementById('welcomeMessage').style.display = 'block';
        document.getElementById('status').innerText = '';
        
        // 讀取上課紀錄（用註冊回傳的 fileId 直接開啟）
        fetchClassRecords(inputName, innerData.fileId || '');

    } catch (err) {
        alert('發生錯誤: ' + err);
        btn.disabled = false;
        btn.innerText = '確認';
    }
});

init();
