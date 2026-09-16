// Run with the repository's Electron after editor/build.mjs.
// Real renderer/preload/IPC, isolated projects; native dialog/shell boundaries are stubbed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '.cache/attract-ui-preview'));
const lib = require('../build/library.cjs');
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.cache/attract-ui-'));
const report = path.join(root, '.cache/attract-ui-result.json');
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
    Buffer, console, structuredClone, URL, Response, atob, btoa, setTimeout, clearTimeout,
});


electron.app.whenReady().then(async()=>{
 await until("!!document.querySelector('.project-picker select')");
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('プロジェクト')).click()");
 const field="document.querySelector('input[aria-label=\"タイトル待機時間（秒）\"]')";
 await until('!!'+field);
 await js(field+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await win.webContents.insertText('18');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});
 for(let i=0;i<100&&lib.readGame(temp,'first').attract?.titleSeconds!==18;i++)await new Promise(r=>setTimeout(r,50));
 const saved=lib.readGame(temp,'first');assert.deepEqual(saved.attract,{enabled:true,titleSeconds:18,bossSeconds:15,rankingSeconds:8});assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false);
 const movieSelector='[data-context="startupMovie"] input[type="checkbox"]';
 await until(`!!document.querySelector(${JSON.stringify(movieSelector)})`);
 assert.equal(await js('document.querySelectorAll(\'[data-context="startupMovie"] input\').length'),1,'hide encoded media fields');
 await click(movieSelector);
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});
 for(let i=0;i<100&&lib.readGame(temp,'first').startupMovie.enabled;i++)await new Promise(r=>setTimeout(r,50));
 const movie=lib.readGame(temp,'first').startupMovie;assert.equal(movie.enabled,false);assert.deepEqual(movie.frames,saved.startupMovie.frames);assert.equal(movie.pcm,saved.startupMovie.pcm);
 record({timingEdited:true,savedAndReloaded:true,buildFree:true,movieTogglePersists:true,moviePayloadHiddenAndPreserved:true});clearTimeout(timer);electron.app.exit(0);
}).catch(error=>{record({error:error.stack});clearTimeout(timer);electron.app.exit(1);});
