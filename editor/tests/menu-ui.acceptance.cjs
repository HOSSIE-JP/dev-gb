// Run with the repository's Electron after editor/build.mjs.
// Real renderer/preload/IPC, isolated projects; native dialog/shell boundaries are stubbed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');
const root = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] ?? path.join(root, '.cache/kouma-v19/ui'));
fs.mkdirSync(output, { recursive: true });
const lib = require('../../editor/build/library.cjs');
fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
const temp = fs.mkdtempSync(path.join(root, '.cache/menu-ui-'));
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
        showSaveDialog: async () => ({canceled:false,filePath:path.join(temp,'export-color.png')}),
        showMessageBox: async () => ({ response }),
        showMessageBoxSync: () => response,
    },
    shell: { ...electron.shell, openPath: async (folder) => { opened.push(folder); return ''; } },
};
electron.app.disableHardwareAcceleration();
let progress='startup';
const timer = setTimeout(() => { record({ error: 'timeout',progress }); electron.app.exit(1); }, 240000);
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
 const key=(keyCode,modifiers=[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});};
 const save=async(check)=>{key('S',['control']);for(let i=0;i<100;i++){if(check(lib.readGame(temp,'first')))return;await new Promise(r=>setTimeout(r,50));}throw Error('save timeout');};
 await until("!!document.querySelector('.project-picker select')");
 progress='character';
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('自機')).click()");
 const caption='input[aria-label="「キャラクター選択」の見出し"]',portrait="document.querySelector('canvas[aria-label=機体選択画像プレビュー]')";
 await until('!!'+portrait);assert.equal(await js('document.querySelector('+JSON.stringify(caption)+').checked'),true);const titled=await js(portrait+'.toDataURL()');
 await click(caption);await until(portrait+'.toDataURL()!=='+JSON.stringify(titled));await save(g=>!g.player.selectionHeading);await click(caption);await save(g=>g.player.selectionHeading);await until(portrait+'.toDataURL()==='+JSON.stringify(titled));
 const playerSelect="document.querySelector('select[aria-label=機体別画面のプレビュー]')";await js(playerSelect+'.focus()');key('End');await until(playerSelect+".value==='1'");await until(portrait+'.toDataURL()!=='+JSON.stringify(titled));
 const pic=await js(portrait+'.toDataURL()');fs.writeFileSync(path.join(output,'character-preview.png'),Buffer.from(pic.split(',')[1],'base64'));
 progress='title';
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('画面・HUD')).click()");
 await until("!!document.querySelector('input[aria-label=\"START／STAGE SELECTメニュー（下4行）\"]')");
 const menu='input[aria-label="START／STAGE SELECTメニュー（下4行）"]',stage='select[aria-label="タイトル選択ステージのプレビュー"]',canvas="document.querySelector('.canvas-well canvas')";
 assert.equal(await js('document.querySelector('+JSON.stringify(stage)+').options.length'),7);
 const initial=await js(canvas+'.toDataURL()');await js('document.querySelector('+JSON.stringify(stage)+').focus()');key('End');await until('document.querySelector('+JSON.stringify(stage)+').value==='+JSON.stringify('6'));await until(canvas+'.toDataURL()!=='+JSON.stringify(initial));
 fs.writeFileSync(path.join(output,'title-preview.png'),Buffer.from((await js(canvas+'.toDataURL()')).split(',')[1],'base64'));
 await click(menu);await save(g=>!g.screens.find(s=>s.id==='title').stageSelect);await until('!document.querySelector('+JSON.stringify(stage)+')');
 await click(menu);await save(g=>g.screens.find(s=>s.id==='title').stageSelect);await until('!!document.querySelector('+JSON.stringify(stage)+')');
 progress='stage';
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('ステージ')).click()");await until("[...document.querySelectorAll('.inspector summary')].some(e=>e.textContent==='会話とクリア演出')");
 progress='patterns';
 await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('弾幕')).click()");
 const kind="[...document.querySelectorAll('.inspector select')].find(e=>[...e.options].some(o=>o.value==='aimed-down'))";
 await until('!!('+kind+')');await js('('+kind+').focus()');key('Home');await until('('+kind+").value==='straight'");key('Down');await until('('+kind+").value==='aimed'");key('Down');
 await until('('+kind+").value==='aimed-down'");await save(g=>g.patterns[0].kind==='aimed-down');
 await js('('+kind+').focus()');key('Down');await save(g=>g.patterns[0].kind==='fan');
 assert.equal(lib.readGame(temp,'first').patterns.find(p=>p.id==='fairy-aim').kind,'aimed-down');
 assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false);assert.equal(lib.readGame(temp,'first').player.bomb.presentation,'image');assert.equal(lib.readGame(temp,'first').player.bomb.frames,48);
 if(lib.readGame(temp,'first').assets[0].frames[0].cgbPixels){
  progress='color import';const asset=lib.readGame(temp,'first').assets[0],original=[...asset.frames[0].pixels],rgb=asset.frames[0].cgbPixels.map(v=>v<0?-1:((v&255)<<16)|(v&0xff00)|(v>>>16)),input=path.join(temp,'import-color.png');fs.writeFileSync(input,lib.encodeColorPng(asset.width,asset.height,rgb));
  await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('画像・スプライト')).click()");
  await until("[...document.querySelectorAll('button')].some(e=>e.textContent==='GBC用カラーPNG取込')");
  selection={canceled:false,filePaths:[input]};await js("[...document.querySelectorAll('button')].find(e=>e.textContent==='GBC用カラーPNG取込').click()");await until("!!document.querySelector('.notice button')");await js("[...document.querySelectorAll('button')].find(e=>e.textContent==='この画像を取り込む').click()");
  await save(g=>JSON.stringify(g.assets[0].frames[0].cgbPixels)===JSON.stringify(rgb));assert.deepEqual(lib.readGame(temp,'first').assets[0].frames[0].pixels,original);
  await js("[...document.querySelectorAll('button')].find(e=>e.textContent==='GBCカラーPNG書出').click()");for(let n=0;n<100&&!fs.existsSync(path.join(temp,'export-color.png'));n++)await new Promise(r=>setTimeout(r,50));assert.deepEqual(lib.decodeColorPng(fs.readFileSync(path.join(temp,'export-color.png')),asset.width,asset.height),rgb);
  record({colorImport:true,colorExport:true,dmgSourcePreserved:true,colorSourceSaved:true});
 }
 // Saving completes on disk before the renderer's recovery refresh finishes.
 // Allow the ordinary refresh to settle before destroying the hidden window.
 await new Promise(resolve=>setTimeout(resolve,1000));
 record({headingToggle:true,bothCharacters:true,titleToggle:true,sevenStagePreview:true,nativeInput:true,savedAndReloaded:true,stagePresentationPreserved:true,bombSettingsPreserved:true,aimedDownChoiceSaved:true,buildFree:true});clearTimeout(timer);electron.app.exit(0);
}).catch(error=>{record({error:error.stack});clearTimeout(timer);electron.app.exit(1);});
