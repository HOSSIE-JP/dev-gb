// Run with the repository's Electron after editor/build.mjs.
// Real renderer/preload/IPC, isolated projects; native dialog/shell boundaries are stubbed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '.cache/beam-ui-preview'));
const lib = require('../build/library.cjs');
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.cache/beam-ui-'));
const report = path.join(root, '.cache/beam-ui-result.json');
const checks = [];
const record = (value) => { checks.push(value); fs.writeFileSync(report, JSON.stringify({ temp, checks }, null, 2)); };
fs.cpSync(path.join(root, 'editor/build'), path.join(temp, 'editor/build'), { recursive: true });
fs.cpSync(path.join(root, '.tools/misaki'), path.join(temp, '.tools/misaki'), { recursive: true });
fs.mkdirSync(path.join(temp, 'config'));
fs.copyFileSync(path.join(root, 'config/tools.lock.json'), path.join(temp, 'config/tools.lock.json'));
fs.mkdirSync(path.join(temp, 'projects'));
lib.createProject(temp, 'first', 'FIRST', lib.readGame(root, 'touhou-kouma'));
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
    Buffer, atob, btoa, console, structuredClone, URL, Response, setTimeout, clearTimeout,
});

electron.app.whenReady().then(async()=>{
 await until("!!document.querySelector('.project-picker select')");
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('弾幕')).click()");
 await js("[...document.querySelectorAll('.asset-row')].find(e=>e.textContent.includes('marisa-shot')).click()");
 const kind="[...document.querySelectorAll('.inspector select')].find(e=>[...e.options].some(o=>o.value==='aimed-fan'))";
 await until(kind+"?.value==='beam'");
 assert.equal(await js("document.querySelector('.budget-label span').textContent.trim()"),'126 / 128');
 assert.equal(await js("!!document.querySelector('.inspector input[aria-label=\"速度 px / frame\"]')"),false);
 const input="document.querySelector('input[aria-label=\"間隔（frame）\"]')";
 await js(input+'.focus()');await js(input+'.select()');await win.webContents.insertText('9');
 await until(input+".value==='9'");
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});
 for(let i=0;i<100&&lib.readGame(temp,'first').patterns.find(p=>p.id==='marisa-shot').interval!==9;i++)await new Promise(r=>setTimeout(r,50));
 assert.equal(lib.readGame(temp,'first').patterns.find(p=>p.id==='marisa-shot').interval,9);
 await js("[...document.querySelectorAll('.bottom-tabs button')].find(e=>e.textContent.trim()==='プレビュー').click()");
 const scope="[...document.querySelectorAll('.preview select')].find(e=>[...e.options].some(o=>o.value==='selection'))";
 await js(scope+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'End'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'End'});await until(scope+".value==='selection'");
 const canvas="document.querySelector('canvas[aria-label=即時プレビュー]')";
 await js(canvas+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Z'});
 await until(`(()=>{const p=${canvas}.getContext('2d').getImageData(60,16,1,80).data;return [...p].every((v,i)=>v===p[i%4]);})()`);
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'editor-beam.png'),(await win.webContents.capturePage()).toPNG());win.webContents.sendInputEvent({type:'keyUp',keyCode:'Z'});
 await js("[...document.querySelectorAll('.asset-row')].find(e=>e.textContent.includes('v37-intercept')).click()");await until(kind+"?.value==='aimed-fan'");
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('ボス')).click()");
 await until("document.querySelector('.asset-row.selected')?.textContent.includes('rumia')");
 await js("[...document.querySelectorAll('select')].find(e=>e.closest('label')?.textContent.includes('経路を編集する攻撃フェーズ')).focus()");
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});
 await until("!!document.querySelector('input[aria-label=モード制限時間]')");
 assert.equal(await js("Number(document.querySelector('input[aria-label=モード制限時間]').value)"),60);
 assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false);
 record({beamControl:true,beamPreviewContinuous:true,beamIntervalSavedAndReopened:9,aimedFanControl:true,bossTimeControl:60,buildFree:true});
 fs.copyFileSync(report,path.join(output,'results.json'));clearTimeout(timer);electron.app.exit(0);
}).catch(error=>{record({error:error.stack});clearTimeout(timer);electron.app.exit(1);});

