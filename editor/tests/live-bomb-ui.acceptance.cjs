// Run with the repository's Electron after editor/build.mjs.
// Real renderer/preload/IPC, isolated projects; native dialog/shell boundaries are stubbed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '.cache/kouma-v18/ui'));
fs.mkdirSync(output, { recursive: true });
const lib = require('../../editor/build/library.cjs');
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.cache/live-bomb-ui-'));
const report = path.join(output, 'results.json');
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
 fs.mkdirSync(output,{recursive:true});
 await until("!!document.querySelector('.project-picker select')");
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('自機')).click()");
 const panel="[...document.querySelectorAll('.inspector summary')].find(e=>e.textContent==='ボム（全機体共通）').parentElement";
 await until(panel+" != null");await js("if(!"+panel+".open)"+panel+".querySelector('summary').click()");
 const field=label=>"[..."+panel+".querySelectorAll('label.field')].find(e=>e.querySelector(':scope > span')?.textContent==="+JSON.stringify(label)+").querySelector('input,select')";
 const key=code=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:code});win.webContents.sendInputEvent({type:'keyUp',keyCode:code});};
 const select=async(value)=>{const f=field('進行中ボムの表示方式');await js(f+'.focus()');key('Home');if(value==='image')key('Down');await until(f+'.value==='+JSON.stringify(value));};
 const save=async(value)=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});for(let i=0;i<100;i++){if(lib.readGame(temp,'first').player.bomb.presentation===value)return;await new Promise(r=>setTimeout(r,50));}throw Error('not saved');};
 assert.equal(await js((panel+".querySelector('input[aria-label=\"ボム演出中もゲームを動かす\"]')")+'.checked'),true);
 assert.equal(await js(field('進行中ボムの表示方式')+'.value'),'image');
 await select('palette');await save('palette');await select('image');await save('image');
 await js(panel+".scrollIntoView({block:'center'})");await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(output,'editor-bomb-settings.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(lib.readGame(temp,'first').player.bomb.frames,48);assert.equal(lib.readGame(temp,'first').player.bomb.live,true);assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false);
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('ステージ')).click()"); await until("[...document.querySelectorAll('.inspector summary')].some(e=>e.textContent===''会話とクリア演出'')".replaceAll("''","'")); record({stagePresentationPreserved:true,nativeInput:true,displayChoices:true,savedAndReloaded:true,existingDurationPreserved:true,buildFree:true});clearTimeout(timer);electron.app.exit(0);
}).catch(error=>{record({error:error.stack});clearTimeout(timer);electron.app.exit(1);});
