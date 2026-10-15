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
const folder = (files, children = [], name = '學生紀錄') => ({ getName: () => name, getFilesByType: () => iterator(files), getFolders: () => iterator(children) });
function backend(excludedFolders = [], roots) {
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
            if (roots) return roots[id.startsWith('1A4') ? 'I' : 'J'];
            return id.startsWith('1A4') ? folder([file('registered', '001_錯誤姓名_上課紀錄'), file('skip', '學生範本'), file('misc', '行政報表')],
                [folder([file('new', '002_小明_上課紀錄'), file('old', '_舊生')], excludedFolders)]) : folder([file('other', '_小明')]);
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
        ['小明', 'I', 'new'], ['舊生', 'I', 'old'], ['精確姓名', 'J', 'registered'], ['小明', 'J', 'other']
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

test('scan skips trial and template folders before reading files or descendants', () => {
    const excludedFolders = ['試聽紀錄', '歷年試聽紀錄備份', 'Template', '舊tEmPlAtE備份'].map(name => ({
        getName: () => name,
        getFilesByType: () => assert.fail(`must not read files in ${name}`),
        getFolders: () => assert.fail(`must not read descendants of ${name}`)
    }));
    const b = backend(excludedFolders);
    for (const refresh of [false, true]) {
        const result = b.call({ action: 'get_students', userId: 'admin', refresh });
        assert.equal(result.status, 'success', result.message);
        assert.deepEqual(result.students.map(s => s.sheetId).sort(), ['new', 'old', 'other', 'registered']);
    }
});

test('roster sorts by classroom, numeric file or folder prefix, then Chinese name and preserves cached order', () => {
    const b = backend([], {
        I: folder([
            file('ten', '10_十號'), file('two-lin', '002_林明'),
            file('none-lin', '_林華'), file('one', '001_一號'),
            file('two-wang', '2_王明'), file('zero', '000_零號'),
            file('none-wang', '_王華'), file('registered', '12_錯誤姓名')
        ], [folder([file('folder-three', '_三號'), file('file-five', '5_五號')], [
            folder([file('inherited-three', '_三號子表')]),
            folder([file('folder-four', '_四號')], [], '004_學生')
        ], '003_學生')]),
        J: folder([file('j-ten', '10_十號'), file('j-one', '001_一號'), file('j-none', '_無編號')])
    });
    const request = { action: 'get_students', userId: 'admin' };
    const result = b.call(request);
    assert.equal(result.status, 'success', result.message);
    assert.deepEqual(result.students.map(s => s.sheetId), [
        'zero', 'one', 'two-wang', 'two-lin', 'folder-three', 'inherited-three',
        'folder-four', 'file-five', 'ten', 'none-wang', 'none-lin',
        'j-one', 'j-ten', 'registered', 'j-none'
    ]);
    assert.deepEqual(result.students.find(s => s.sheetId === 'registered'), {
        name: '精確姓名', classroom: 'J', sheetId: 'registered'
    });
    assert.deepEqual(b.call(request).students, result.students);
    assert.equal(b.scans(), 2);
    assert.deepEqual(b.call({ ...request, refresh: true }).students, result.students);
});

test('alphanumeric prefixes sort numerically in files and folders and preserve exact student names', () => {
    const b = backend([], {
        I: folder([], [
            folder([file('I04', '_小明')], [], 'I04_學生'),
            folder([file('I01', '_麗華')], [], 'I01_學生'),
            folder([file('I03', '_大華')], [], 'i03_學生'),
            folder([file('I05', '_一明')], [], 'I05_學生')
        ]),
        J: folder([
            file('J04', 'J04_小明_上課紀錄'), file('J01', 'J01_小明'),
            file('J05', 'J05_一明'), file('J03', 'J03_大華_上課紀錄'),
            file('numeric', '002_二明'), file('J10', 'j10_十明'), file('none', '_無編號')
        ])
    });
    b.sheets['LINE LIFF member'].rows.splice(1);
    const request = { action: 'get_students', userId: 'admin' };
    const result = b.call(request);
    assert.equal(result.status, 'success', result.message);
    assert.deepEqual(result.students.map(s => s.sheetId), [
        'I01', 'I03', 'I04', 'I05', 'J01', 'numeric', 'J03', 'J04', 'J05', 'J10', 'none'
    ]);
    assert.deepEqual(result.students.filter(s => /^J0/.test(s.sheetId)).map(s => [s.sheetId, s.name]), [
        ['J01', '小明'], ['J03', '大華'], ['J04', '小明'], ['J05', '一明']
    ]);
    assert.deepEqual(b.call(request).students, result.students);
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
    assert.equal(e.adminStudentList.children[0].classList.contains('classroom-j'), false);
    assert.equal(e.adminStudentList.children[0].classList.contains('classroom-i'), true);
    assert.equal(e.adminStudentList.children[1].classList.contains('classroom-j'), true);
    assert.equal(e.adminStudentList.children[1].classList.contains('classroom-i'), false);
    f.filters[2].fire('click');
    assert.equal(e.adminStudentList.children.length, 1);
    assert.equal(e.adminStudentList.children[0].classList.contains('classroom-j'), true);
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

test('admin menu is simplified and Jeff Coding cards and filter use blue styles', () => {
    const html = source('index.html');
    const adminArea = html.split('<div id="adminArea"')[1].split('<div id="welcomeMessage"')[0];
    assert.doesNotMatch(adminArea, /<h2>|管理員控制台|adminCloseBtn|關閉系統/);
    assert.match(adminArea, /id="adminRefreshBtn"/);
    assert.doesNotMatch(source('script.js'), /adminCloseBtn/);
    const cardStyle = html.match(/\.admin-student-card\.classroom-j\s*\{([^}]+)\}/)[1];
    assert.match(cardStyle, /background:\s*#e7f3ff/);
    assert.match(cardStyle, /border:\s*1px solid #b8daff/);
    assert.match(cardStyle, /color:\s*#004085/);
    assert.match(html, /\.admin-filters button\[data-classroom="J"\]\[aria-pressed="false"\]\s*\{[^}]*background:\s*#e7f3ff/);
    assert.match(html, /\.admin-filters button\[data-classroom="J"\]\[aria-pressed="true"\]\s*\{[^}]*background:\s*#007bff/);
});

test('all and Im classroom filters use amber and green in both selection states', () => {
    const html = source('index.html');
    for (const [classroom, pressed, background, color, border] of [
        ['all', 'true', '#d97706', '#fff', '#d97706'],
        ['all', 'false', '#fef3c7', '#92400e', '#fcd34d'],
        ['I', 'true', '#00b900', '#fff', '#00b900'],
        ['I', 'false', '#e6f4ea', '#137333', '#c8e6c9']
    ]) {
        const selector = `.admin-filters button[data-classroom="${classroom}"][aria-pressed="${pressed}"]`;
        const rule = html.split(selector)[1]?.split('}')[0];
        assert.ok(rule, `missing ${selector}`);
        assert.ok(rule.includes(`background: ${background};`), selector);
        assert.ok(rule.includes(`color: ${color};`), selector);
        assert.ok(rule.includes(`border: 1px solid ${border};`), selector);
    }
});

test('Im student card and classroom label both use green text', () => {
    const html = source('index.html');
    assert.match(html, /\.admin-student-card\.classroom-i\s*\{[^}]*color:\s*#137333\s*;/);
    assert.match(html, /\.admin-student-card\.classroom-i small\s*\{[^}]*color:\s*#137333\s*;/);
});
