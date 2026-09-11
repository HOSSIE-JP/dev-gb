// Run with the repository's Electron after editor/build.mjs.
// Real renderer/preload/IPC, isolated projects; native dialog/shell boundaries are stubbed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '.cache/boss-ui-preview'));
const lib = require('../build/library.cjs');
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.cache/boss-ui-'));
const report = path.join(root, '.cache/boss-ui-result.json');
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

electron.app.whenReady().then(async()=>{
 await until("!!document.querySelector('.project-picker select')");
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('ボス')).click()");
 await until("document.querySelector('.asset-row.selected')?.textContent.includes('rumia')");
 const labels=await js("document.body.innerText");assert.ok(labels.includes('BG敵弾の上限'));assert.ok(labels.includes('フェーズ開始カットイン'));
 await js("[...document.querySelectorAll('select')].find(e=>e.closest('label')?.textContent.includes('経路を編集する攻撃フェーズ')).focus()");
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});
 await until("!!document.querySelector('canvas[aria-label=弾幕名カットインプレビュー]')");
 const data=await js("(()=>{const c=document.querySelector('canvas[aria-label=弾幕名カットインプレビュー]');return [...new Set(c.getContext('2d').getImageData(0,0,160,144).data)].length;})()");assert.ok(data>4);
 const modes=await js("[...document.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='bg-bullets'))?.value");assert.equal(modes,'bg-bullets');
 await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 const duration=await js("[...document.querySelectorAll('label')].find(e=>e.textContent.includes('表示時間（秒）'))?.querySelector('input')?.value");
 assert.equal(Number(duration),1.2,'fractional phase duration reaches the actual editor');
 assert.ok((await js("document.body.innerText")).includes('このフェーズのHP'));
 const phaseHp=Number(await js("document.querySelector('input[aria-label=\"このフェーズのHP（0＝通算HP）\"]').value"));
 assert.equal(phaseHp,lib.readGame(root,'touhou-kouma').bosses.find(b=>b.id==='rumia').phases[1].hp);
 assert.equal(await js("Number(document.querySelector('input[aria-label=フェーズ復帰位置X]').value)"),80);
 fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'editor-boss.png'),(await win.webContents.capturePage()).toPNG());
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('ステージ')).click()");
 await until("document.body.innerText.includes('集計完了後の待ち時間')");
 await until("!!document.querySelector('canvas[aria-label=撃破後会話プレビュー]')");
 await js("[...document.querySelectorAll('summary')].find(e=>e.textContent==='撃破後会話プレビュー').click()");
 await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 const preview="document.querySelector('canvas[aria-label=撃破後会話プレビュー]').toDataURL()",before=await js(preview);
 await js("[...document.querySelectorAll('summary')].find(e=>e.textContent==='撃破後の勝者・敗者会話').parentElement.querySelector('input[aria-label=\"セリフ1行目（18文字まで）\"]').focus()");
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await win.webContents.insertText('テスト');
 await until(preview+' !== '+JSON.stringify(before));
 await js("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
 assert.equal(await js("[...document.querySelectorAll('summary')].find(e=>e.textContent==='撃破後の勝者・敗者会話').parentElement.querySelector('input[aria-label=\"セリフ1行目（18文字まで）\"]').value"),'テスト');
 assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false,'unsaved dialogue preview does not build the ROM');
 fs.writeFileSync(path.join(output,'editor-victory.png'),(await win.webContents.capturePage()).toPNG());
 record({victoryPreview:true,unsavedDialogueRefresh:true,phaseHpControl:true,phaseHp,returnPositionControl:true,bossControls:true,cutinPreview:true,cutinSeconds:Number(duration),scoreWaitControl:true});clearTimeout(timer);electron.app.exit(0);
}).catch(error=>{record({error:error.stack});clearTimeout(timer);electron.app.exit(1);});
