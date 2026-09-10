// Run with the repository's Electron after editor/build.mjs.
// Real renderer/preload/IPC, isolated projects; native dialog/shell boundaries are stubbed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '../..');
const lib = require('../build/library.cjs');
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.cache/project-ui-'));
const report = path.join(root, '.cache/project-ui-result.json');
const checks = [];
const record = (value) => { checks.push(value); fs.writeFileSync(report, JSON.stringify({ temp, checks }, null, 2)); };
fs.cpSync(path.join(root, 'editor/build'), path.join(temp, 'editor/build'), { recursive: true });
fs.mkdirSync(path.join(temp, 'config'));
fs.copyFileSync(path.join(root, 'config/tools.lock.json'), path.join(temp, 'config/tools.lock.json'));
fs.mkdirSync(path.join(temp, 'projects'));
lib.createProject(temp, 'first', 'FIRST', lib.readGame(root, 'star-caravan'));
lib.createProject(temp, 'second', 'SECOND', lib.readGame(root, 'star-caravan'));
let win, selection = { canceled: true, filePaths: [] }, response = 0;
const opened = [];
class TestWindow extends electron.BrowserWindow {
    constructor(options) { super({ ...options, show: false }); win = this; }
}
const native = {
    ...electron,
    BrowserWindow: TestWindow,
    dialog: {
        ...electron.dialog,
        showOpenDialog: async () => selection,
        showMessageBox: async () => ({ response }),
        showMessageBoxSync: () => response,
    },
    shell: { ...electron.shell, openPath: async (folder) => { opened.push(folder); return ''; } },
};
electron.app.disableHardwareAcceleration();
const timer = setTimeout(() => { record({ error: 'timeout' }); electron.app.exit(1); }, 45000);
const js = (source) => win.webContents.executeJavaScript(source);
async function click(selector) {
    const point = await js(`(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        element.scrollIntoView({block:'center'});
        const r = element.getBoundingClientRect();
        return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
    })()`);
    win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
}
async function until(source) {
    for (let i = 0; i < 100; i++) {
        if (await js(source)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out: ${source}`);
}
vm.runInNewContext(fs.readFileSync(path.join(root, 'editor/build/main.cjs'), 'utf8'), {
    require: (name) => name === 'electron' ? native : require(name),
    module: { exports: {} }, __dirname: path.join(temp, 'editor/build'),
    process: { ...process, argv: [process.execPath, 'first'], env: { ...process.env } },
    Buffer, console, structuredClone, URL, Response, setTimeout, clearTimeout,
});
electron.app.whenReady().then(async () => {
    await until(`!!document.querySelector('.project-picker select')`);
    record('renderer loaded');
    const initial = await js(`({value:document.querySelector('.project-picker select').value, disabled:document.querySelector('.project-picker select').disabled})`);
    assert.equal(initial.value, 'first'); assert.equal(initial.disabled, false);
    // Native keyboard input must reach the project select and invoke React/IPC.
    await js(`document.querySelector('.project-picker select').focus()`);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
    await until(`document.querySelector('.project-picker select').value === 'second' && document.querySelector('.library .panel-title').textContent.includes('second')`);
    record('project keyboard selection switches renderer and backend');
    await js(`document.querySelector('.project-picker button').click()`);
    await until(`!document.querySelector('.project-picker select').disabled`);
    assert.equal(await js(`document.querySelector('.project-picker select').value`), 'second');
    record('folder selection cancellation keeps active project');
    lib.createProject(temp, 'added', 'ADDED', lib.readGame(root, 'star-caravan'));
    selection = { canceled: false, filePaths: [path.join(temp, 'projects/added')] };
    await js(`document.querySelector('.project-picker button').click()`);
    await until(`document.querySelector('.project-picker select').value === 'added' && !document.querySelector('.project-picker select').disabled`);
    record('folder picker opens project added after startup');
    await js(`document.querySelector('button[aria-label="現在のプロジェクトフォルダをエクスプローラーで開く"]').click()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(opened.at(-1), path.join(temp, 'projects/added'));
    record('folder icon targets current project');
    // Inspector selects must receive keyboard input and keep the edited value.
    await click('select[aria-label="タイトル・スコア画面"]');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await until(`document.querySelector('select[aria-label="タイトル・スコア画面"]').value === '1' && !!document.querySelector('.status-dot.unsaved')`);
    record('inspector BGM selection changes the in-memory draft');
    selection = { canceled: false, filePaths: [path.join(temp, 'projects/first')] };
    response = 0;
    await js(`document.querySelector('.project-picker button').click()`);
    await until(`!document.querySelector('.project-picker select').disabled`);
    assert.equal(await js(`document.querySelector('.project-picker select').value`), 'added');
    assert.equal(await js(`document.querySelector('select[aria-label="タイトル・スコア画面"]').value`), '1');
    record('dirty switch cancellation preserves edits and releases controls');
    await js(`document.querySelector('.project-picker select').focus()`);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'End' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'End' });
    await new Promise(resolve => setTimeout(resolve, 100));
    await until(`!document.querySelector('.project-picker select').disabled`);
    assert.equal(await js(`document.querySelector('.project-picker select').value`), 'added');
    record('dirty project list cancellation restores the displayed selection');
    response = 1;
    await js(`document.querySelector('.project-picker button').click()`);
    await until(`document.querySelector('.project-picker select').value === 'first' && !document.querySelector('.project-picker select').disabled`);
    assert.equal(lib.recoverGame(temp, 'added').music.title, 1);
    record('dirty switch keeps recovery copy');
    selection.filePaths = [path.join(temp, 'projects/added')];
    await js(`document.querySelector('.project-picker button').click()`);
    await until(`document.querySelector('.project-picker select').value === 'added' && !document.querySelector('.project-picker select').disabled`);
    assert.equal(await js(`document.querySelector('select[aria-label="タイトル・スコア画面"]').value`), '1');
    record('reopening restores the recovery draft');
    selection.filePaths = [path.join(temp, 'invalid/first')];
    await js(`document.querySelector('.project-picker button').click()`);
    await until(`!document.querySelector('.project-picker select').disabled`);
    assert.equal(await js(`document.querySelector('.project-picker select').value`), 'added');
    record('invalid folder preserves active project and releases controls');
    await win.setSize(1150, 760);
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.writeFileSync(path.join(temp, 'window.png'), (await win.webContents.capturePage()).toPNG());
    record('PASS'); clearTimeout(timer); electron.app.exit(0);
}).catch(error => { record({ error: error.stack }); clearTimeout(timer); electron.app.exit(1); });
