const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

class Sheet {
    constructor(rows = []) { this.rows = rows; }
    getLastRow() { return this.rows.length; }
    getRange(r, c, h, w) {
        return {
            getValues: () => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => this.rows[r - 1 + i]?.[c - 1 + j] ?? '')),
            setValues: values => values.forEach((row, i) => { this.rows[r - 1 + i] = [...row]; }),
            clearContent: () => { this.rows.splice(r - 1, h); }
        };
    }
}
const iterator = values => { let i = 0; return { hasNext: () => i < values.length, next: () => values[i++] }; };
const file = (id, name) => ({ getId: () => id, getName: () => name });
const folder = (files, children = []) => ({ getFilesByType: () => iterator(files), getFolders: () => iterator(children) });
function backend() {
    const sheets = { 'LINE LIFF member': new Sheet([
        ['時間', '姓名', '生日', '教室', '顯示名稱', 'LINE ID', 'SheetID'],
        ['', '精確姓名', '', 'J', '', 'student', 'registered'],
        ['', '舊生', '', 'I', '', 'old', '']
    ]) };
    let scans = 0, failScan = false, adminId = ' admin ';
    const context = vm.createContext({
        SpreadsheetApp: { flush() {}, getActiveSpreadsheet: () => ({
            getSheetByName: name => sheets[name],
            getSheets: () => Object.keys(sheets).map(name => {
                const s = sheets[name];
                s.getName = () => name;
                return s;
            }),
            insertSheet: name => (sheets[name] = new Sheet())
        }) },
        PropertiesService: { getScriptProperties: () => ({ getProperty: () => adminId }) },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }) },
        MimeType: { GOOGLE_SHEETS: 'sheets' },
        DriveApp: { getFolderById: id => {
            scans++;
            if (failScan) throw new Error('Drive unavailable');
            return id.startsWith('1A4') ? folder([file('registered', '001_錯誤姓名_上課紀錄'), file('skip', '學生範本'), file('misc', '行政報表')],
                [folder([file('new', '002_小明_上課紀錄'), file('old', '_舊生')])]) : folder([file('other', '_小明')]);
        } }
    });
    vm.runInContext(source('GAS/code.gs'), context);
    return { sheets, call: data => context.doPost({ postData: { contents: JSON.stringify(data) } }),
        scans: () => scans, fail: () => { failScan = true; }, admin: value => { adminId = value; } };
}

test('backend admin check and unauthorized roster requests fail closed', () => {
    const b = backend();
    assert.equal(b.call({ action: 'check', userId: 'admin' }).isAdmin, true);
    assert.equal(b.call({ action: 'check', userId: 'student' }).name, '精確姓名');
    assert.equal(b.call({ action: 'check', userId: 'unknown' }).exists, false);
    for (const userId of [undefined, '', 'Admin', 'student', 1]) {
        assert.equal(b.call({ action: 'get_students', userId }).status, 'error');
    }
    assert.equal(b.scans(), 0);
    b.admin(' ');
    assert.equal(b.call({ action: 'get_students', userId: ' ' }).status, 'error');
});

test('scan merges exact registered IDs, nested I and J files; cache is reused and refresh removes stale rows', () => {
    const b = backend();
    const request = { action: 'get_students', userId: 'admin' };
    const first = b.call(request);
    assert.equal(first.status, 'success');
    assert.deepEqual(first.students.map(s => [s.name, s.classroom, s.sheetId]), [
        ['小明', 'I', 'new'], ['舊生', 'I', 'old'], ['小明', 'J', 'other'], ['精確姓名', 'J', 'registered']
    ]);
    assert.equal(b.sheets['學生名冊快取'].rows[0][0], '學生姓名');
    assert.equal(Object.prototype.toString.call(b.sheets['學生名冊快取'].rows[1][3]), '[object Date]');
    assert.deepEqual(b.call(request).students, first.students);
    assert.equal(b.scans(), 2);
    b.sheets['學生名冊快取'].rows.push(['stale', 'I', 'stale', '']);
    assert.equal(b.call({ ...request, refresh: true }).students.length, 4);
    assert.equal(b.sheets['學生名冊快取'].rows.length, 5);
    assert.equal(b.scans(), 4);
    b.fail();
    assert.equal(b.call({ ...request, refresh: true }).status, 'error');
    assert.deepEqual(b.call(request).students, first.students);
});

test('an existing empty cache scans and non-boolean refresh does not rescan populated cache', () => {
    const b = backend();
    b.sheets['學生名冊快取'] = new Sheet([['學生姓名', '所屬教室', '檔案ID', '更新時間']]);
    assert.equal(b.call({ action: 'get_students', userId: 'admin' }).students.length, 4);
    assert.equal(b.scans(), 2);
    b.call({ action: 'get_students', userId: 'admin', refresh: 'true' });
    assert.equal(b.scans(), 2);
});

function frontend() {
    const elements = {};
    function element() {
        const events = {}, classes = new Set();
        return { style: {}, value: '', children: [], dataset: {}, disabled: false,
            classList: { add: v => classes.add(v), remove: v => classes.delete(v),
                toggle: (v, on) => on ? classes.add(v) : classes.delete(v), contains: v => classes.has(v) },
            addEventListener: (type, fn) => { events[type] = fn; }, fire: type => events[type]?.(),
            appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
            setAttribute() {}
        };
    }
    const ids = [...source('index.html').matchAll(/id="([^"]+)"/g)].map(m => m[1]);
    ids.forEach(id => { elements[id] = element(); elements[id].style.display = 'none'; });
    const filters = ['all', 'I', 'J'].map(classroom => { const e = element(); e.dataset.classroom = classroom; return e; });
    const requests = [], pending = [];
    let check = { exists: true, isAdmin: true };
    const context = vm.createContext({ console: { log() {}, error() {} }, setTimeout,
        document: { getElementById: id => elements[id], createElement: element, querySelectorAll: () => filters, body: element() },
        liff: { init: async () => {}, isLoggedIn: () => true, getProfile: async () => ({ userId: 'admin' }), closeWindow() {} },
        fetch: async (url, options) => {
            const body = JSON.parse(options.body); requests.push(body);
            if (body.action === 'check') return { ok: true, json: async () => ({ data: check }) };
            if (body.action === 'get_students') return { ok: true, json: async () => ({ data: { status: 'success', students: [
                { name: '小明', classroom: 'I', sheetId: 'i' }, { name: '小美', classroom: 'J', sheetId: 'j' }
            ] } }) };
            return new Promise(resolve => pending.push(data => resolve({ ok: true, json: async () => ({ data }) })));
        }
    });
    vm.runInContext(source('script.js').replace(/init\(\);\s*$/, ''), context);
    return { context, elements, filters, requests, pending, check: value => { check = value; } };
}

test('admin login, classroom filter, live search, refresh, theme and back with stale responses', async () => {
    const f = frontend(), e = f.elements;
    await f.context.init();
    assert.equal(e.adminArea.style.display, 'block');
    assert.equal(e.adminStudentList.children.length, 2);
    f.filters[2].fire('click');
    assert.equal(e.adminStudentList.children.length, 1);
    e.adminSearch.value = '小明'; e.adminSearch.fire('input');
    assert.equal(e.adminStudentList.children[0].textContent, '沒有符合條件的學生');
    e.adminSearch.value = ''; e.adminSearch.fire('input');
    await f.context.loadAdminStudentList(true);
    assert.equal(f.requests.at(-1).refresh, true);
    const first = f.context.viewStudentRecords({ name: '小美', classroom: 'J', sheetId: 'j' });
    assert.equal(f.context.document.body.classList.contains('blue-theme'), true);
    assert.equal(e.adminBackToMenuBtn.style.display, 'block');
    e.adminBackToMenuBtn.fire('click');
    assert.equal(e.adminArea.style.display, 'block');
    assert.equal(f.context.document.body.classList.contains('blue-theme'), false);
    const second = f.context.viewStudentRecords({ name: '小明', classroom: 'I', sheetId: 'i' });
    f.pending[1]({ status: 'success', cycles: [], classRecords: [], classroom: 'J', message: 'new' });
    await second;
    f.pending[0]({ status: 'success', cycles: [], classRecords: [], classroom: 'J', message: 'old' });
    await first;
    assert.equal(e.regName.innerText, '小明');
    assert.ok(e.recordsEmptyMsg.innerText.includes('new'));
    assert.equal(f.context.document.body.classList.contains('blue-theme'), false);
});

test('ordinary registered students and unregistered users keep existing login routes', async () => {
    const student = frontend();
    student.check({ exists: true, name: '學生', classroom: 'J', sheetId: 's' });
    await student.context.init();
    assert.equal(student.elements.welcomeMessage.style.display, 'block');
    assert.equal(student.elements.adminArea.style.display, 'none');
    assert.equal(student.elements.adminBackToMenuBtn.style.display, 'none');
    assert.equal(student.requests.at(-1).sheetId, 's');
    student.pending[0]({ cycles: [], classRecords: [], classroom: 'J' });
    const fresh = frontend();
    fresh.check({ exists: false });
    await fresh.context.init();
    assert.equal(fresh.elements.registrationForm.style.display, 'block');
    assert.equal(fresh.elements.adminArea.style.display, 'none');
});

test('roster network failure preserves cards and allows retry', async () => {
    const f = frontend();
    await f.context.init();
    const originalFetch = f.context.fetch;
    f.context.fetch = async () => { throw new Error('offline'); };
    await f.context.loadAdminStudentList(true);
    assert.equal(f.elements.adminRefreshBtn.disabled, false);
    assert.equal(f.elements.adminStudentList.children.length, 2);
    assert.ok(f.elements.adminListStatus.innerText.includes('offline'));
    f.context.fetch = originalFetch;
    await f.context.loadAdminStudentList(true);
    assert.equal(f.elements.adminListStatus.innerText, '');
});
