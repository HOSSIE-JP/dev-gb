// Run with the repository's Electron after editor/build.mjs.
// Real renderer/preload/IPC, isolated projects; native dialog/shell boundaries are stubbed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '.cache/dense-ui-preview'));
const lib = require('../build/library.cjs');
fs.mkdirSync(output,{recursive:true});electron.app.setPath('userData',path.join(output,'user-data'));
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.cache/dense-ui-'));
const report = path.join(root, '.cache/dense-ui-result.json');
const checks = [];
const record = (value) => { checks.push(value); fs.writeFileSync(report, JSON.stringify({ temp, checks }, null, 2)); };
fs.cpSync(path.join(root, 'editor/build'), path.join(temp, 'editor/build'), { recursive: true });
fs.cpSync(path.join(root, '.tools/misaki'), path.join(temp, '.tools/misaki'), { recursive: true });
fs.mkdirSync(path.join(temp, 'config'));
fs.copyFileSync(path.join(root, 'config/tools.lock.json'), path.join(temp, 'config/tools.lock.json'));
fs.mkdirSync(path.join(temp, 'projects'));
const authored=lib.readGame(root,'touhou-kouma');delete authored.startupMovie;authored.hardware='dual';authored.performance={...authored.performance,dense:true};authored.stages[0].bgBullets=true;lib.createProject(temp,'first','FIRST',authored);
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
const timer = setTimeout(() => { record({ error: 'timeout' }); electron.app.exit(1); }, 90000);
const js = async (source) => {try{return await win.webContents.executeJavaScript(source);}catch(error){throw Error(source+'\n'+error.message);}};
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


electron.app.whenReady().then(async()=>{
 await until("!!document.querySelector('.project-picker select')");
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('プロジェクト')).click()");
 const dense='input[aria-label="高密度処理（実験用・負荷によって低速化）"]';
 await until('!!document.querySelector('+JSON.stringify(dense)+')');
 assert.equal(await js('document.querySelector('+JSON.stringify(dense)+').checked'),true);
 await click(dense);await until('!document.querySelector('+JSON.stringify(dense)+').checked');
 await click(dense);await until('document.querySelector('+JSON.stringify(dense)+').checked');
 const hardware='select:has(option[value="gbc"])';await click(hardware);
 for(const keyCode of ['End','Return']){win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});}
 await until('document.querySelector('+JSON.stringify(hardware)+').value==="gbc"');
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('ステージ')).click()");
 const bg='input[aria-label="道中BG弾幕（背景を単色化）"]',limit='input[aria-label="道中BG弾の同時上限（1〜96）"]';
 await until('!!document.querySelector('+JSON.stringify(bg)+')');assert.equal(await js('document.querySelector('+JSON.stringify(bg)+').checked'),true);
 await click(bg);await until('!document.querySelector('+JSON.stringify(bg)+').checked');await click(bg);
 await click(limit);win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await win.webContents.insertText('48');
 await until('document.querySelector('+JSON.stringify(limit)+').value==="48"');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});
 for(let i=0;i<100&&lib.readGame(temp,'first').stages[0].bgBulletLimit!==48;i++)await new Promise(r=>setTimeout(r,50));
 const saved=lib.readGame(temp,'first');assert.equal(saved.hardware,'gbc');assert.equal(saved.performance.dense,true);assert.equal(saved.stages[0].bgBullets,true);assert.equal(saved.stages[0].bgBulletLimit,48);assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'projects/first/project.json'))).cgbCompatibility,'gbc');
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'editor-dense.png'),(await win.webContents.capturePage()).toPNG());
 record({hardwareSelector:true,denseToggle:true,bgToggle:true,bulletLimit:true,savedAndReloaded:true,buildFree:true});clearTimeout(timer);electron.app.exit(0);
}).catch(error=>{record({error:error.stack});clearTimeout(timer);electron.app.exit(1);});
