// Run with the repository's Electron after editor/build.mjs.
// Real renderer/preload/IPC, isolated projects; native dialog/shell boundaries are stubbed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '.cache/startup-ui-preview'));
const lib = require('../build/library.cjs');
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.cache/startup-ui-'));
const report = path.join(root, '.cache/startup-ui-result.json');
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
    Buffer, console, structuredClone, URL, Response, setTimeout, clearTimeout,
});


electron.app.whenReady().then(async()=>{
 await until("!!document.querySelector('.project-picker select')");
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('プロジェクト')).click()");
 const panel="[...document.querySelectorAll('.inspector summary')].find(e=>e.textContent==='起動ロゴ（タイトル前）').parentElement",slides=panel+".querySelector('details')";
 await until(panel+" != null");
 const add=slides+".querySelectorAll('button')";
 await js("[..."+add+"].at(-1).click()");await until(panel+".querySelectorAll('input[aria-label=自動送り秒数]').length===1");
 await js("[..."+add+"].at(-1).click()");await until(panel+".querySelectorAll('input[aria-label=自動送り秒数]').length===2");
 const fields=panel+".querySelectorAll('select')",second=fields+'[1]';await js(second+'.focus()');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'End'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'End'});await until(second+".value==='ending-marisa'");
 const hold=panel+".querySelectorAll('input[aria-label=自動送り秒数]')[1]";await js(hold+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await win.webContents.insertText('3');await until(hold+".value==='3'");
 const preview="document.querySelector('canvas[aria-label=起動ロゴ画像プレビュー]')",selector="document.querySelector('select[aria-label=起動ロゴのプレビューページ]')";
 await until('!!'+preview);const first=await js(preview+'.toDataURL()');await js(selector+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});await until(selector+".value==='1'");await until(preview+'.toDataURL()!=='+JSON.stringify(first));
 // Move the second page upward using the real form control.
 await js("[..."+slides+".querySelectorAll('button')].filter(e=>e.textContent==='↑')[1].click()");await until(fields+"[0].value==='ending-marisa'");
 const fade=panel+`.querySelector('input[aria-label="フェード時間（片道・秒）"]')`;await js(fade+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await win.webContents.insertText('0.8');record({fadeInputValue:await js(fade+'.value')});await until(fade+".value==='0.8'");
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});
 for(let i=0;i<100&&lib.readGame(temp,'first').startup?.slides.length!==2;i++)await new Promise(r=>setTimeout(r,50));
 const saved=lib.readGame(temp,'first');assert.deepEqual(saved.startup.slides.map(s=>[s.background,s.seconds]),[['ending-marisa',3],['screen-title',2]]);assert.equal(saved.startup.fadeSeconds,.8);assert.equal(saved.startup.enabled,true);assert.notEqual(saved.startup.slides[0].id,saved.startup.slides[1].id);assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false);
 fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'editor-startup.png'),(await win.webContents.capturePage()).toPNG());
 record({addMultiple:true,reorder:true,perPageDuration:true,fadeDuration:true,previewChanges:true,savedAndReloaded:true,buildFree:true});clearTimeout(timer);electron.app.exit(0);
}).catch(error=>{record({error:error.stack});clearTimeout(timer);electron.app.exit(1);});
