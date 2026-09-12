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
 if(lib.readGame(root,'touhou-kouma').stages[0].presentation?.characterDialogues?.length){
  const variant="[...document.querySelectorAll('.inspector summary')].find(e=>e.textContent.startsWith('追加機体の会話')).parentElement";
  for(const [title,section,text]of [['戦闘前会話','戦闘開始前の会話','ほうきで さんぽだぜ'],['撃破後会話','撃破後の会話','いい しょうぶ だったぜ']]){
   const selector=`document.querySelector('select[aria-label="${title}の機体"]')`,canvas=`document.querySelector('canvas[aria-label="${title}プレビュー"]')`,initial=await js(canvas+'.toDataURL()');
   await js(selector+'.closest("details").open=true');await js(selector+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});
   await until(selector+".value === '1'");await until(canvas+'.toDataURL() !== '+JSON.stringify(initial));
   const input=variant+`.querySelectorAll('summary')`,field=`[...${input}].find(e=>e.textContent==='${section}').parentElement.querySelector('input[aria-label="セリフ1行目（18文字まで）"]')`,before=await js(canvas+'.toDataURL()');
   await js(field+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await win.webContents.insertText(text);
   await until(canvas+'.toDataURL() !== '+JSON.stringify(before));assert.equal(await js(field+'.value'),text);
   fs.writeFileSync(path.join(output,title+'-marisa.png'),Buffer.from((await js(canvas+'.toDataURL()')).split(',')[1],'base64'));
  }
  record({characterBeforeAndAfterPreviews:true,unsavedMarisaDialogueRefresh:true});
 }
 if(lib.readGame(root,'touhou-kouma').player.characters?.length){
  await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('自機')).click()");
  await until("document.body.innerText.includes('追加の選択機体')");
  const characterPanel="[...document.querySelectorAll('summary')].find(e=>e.textContent.startsWith('追加の選択機体（最大3）')).parentElement";
  const speedInput=characterPanel+".querySelector('input[aria-label=\"速度 px / frame\"]')";
  assert.equal(Number(await js(speedInput+'.value')),3.25);
  assert.ok((await js(characterPanel+'.innerText')).includes('魔理沙スパーク'));
  if(await js("!!document.querySelector('select[aria-label=機体別画面のプレビュー]')")){
   const select="document.querySelector('select[aria-label=機体別画面のプレビュー]')",selection="document.querySelector('canvas[aria-label=機体選択画像プレビュー]').toDataURL()",over="document.querySelector('canvas[aria-label=機体別ゲームオーバープレビュー]').toDataURL()";
   const beforeSelect=await js(selection),beforeOver=await js(over);await js(select+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});
   await until(select+".value === '1'");await until(selection+' !== '+JSON.stringify(beforeSelect));await until(over+' !== '+JSON.stringify(beforeOver));
   fs.writeFileSync(path.join(output,'select-marisa.png'),Buffer.from((await js(selection)).split(',')[1],'base64'));fs.writeFileSync(path.join(output,'gameover-marisa.png'),Buffer.from((await js(over)).split(',')[1],'base64'));
   const refs=await js(characterPanel+`.querySelectorAll('select') && [...${characterPanel}.querySelectorAll('select')].map(e=>e.value)`);assert.ok(refs.includes('select-marisa'));assert.ok(refs.includes('gameover-marisa'));
   record({playerScreenDropdown:true,selectionPreviewChanges:true,gameoverPreviewChanges:true,characterArtFields:true});
  }
  await js(speedInput+'.focus()');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await win.webContents.insertText('3.5');
  await until(speedInput+".value === '3.5'");
  await js("[...document.querySelectorAll('.bottom-tabs button')].find(e=>e.textContent.trim()==='プレビュー').click()");
  await js("document.querySelector('select[aria-label=プレビューの機体]').focus()");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});
  await until("document.querySelector('select[aria-label=プレビューの機体]').value === '1'");
  fs.writeFileSync(path.join(output,'editor-player.png'),(await win.webContents.capturePage()).toPNG());
  await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('弾幕')).click()");
  await js("[...document.querySelectorAll('.asset-row')].find(e=>e.textContent.includes('pat-seal')).click()");
  await until("document.body.innerText.includes('誘導設定（敵弾専用）')");
  assert.equal(await js("[...document.querySelectorAll('.inspector select')].find(e=>[...e.options].some(o=>o.value==='homing')).value"),'homing');
  const launchSelect="[...document.querySelectorAll('.inspector select')].find(e=>[...e.options].some(o=>o.value==='both'))";
  assert.deepEqual(await js(launchSelect+'.options.length'),6);
  await js(launchSelect+'.focus()');
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});
  await until(launchSelect+".value === 'left'");
  fs.writeFileSync(path.join(output,'editor-guidance.png'),(await win.webContents.capturePage()).toPNG());
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});
  for(let i=0;i<100;i++){if(lib.readGame(temp,'first').player.characters[0].speed===3.5)break;await new Promise(r=>setTimeout(r,50));}
  const saved=lib.readGame(temp,'first');assert.equal(saved.player.characters[0].speed,3.5);assert.equal(saved.patterns.find(p=>p.id==='pat-seal').launch.kind,'left');
  if(saved.stages[0].presentation.characterDialogues?.length){const v=saved.stages[0].presentation.characterDialogues[0];assert.equal(v.before.pages[0].line1,'ほうきで さんぽだぜ');assert.equal(v.after.pages[0].line1,'いい しょうぶ だったぜ');assert.equal(saved.player.characters[0].selectionBackground,'select-marisa');assert.equal(saved.player.characters[0].gameoverBackground,'gameover-marisa');record({characterStorySavedAndReopened:true,characterScreenReferencesPreserved:true});}
  assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false);
  record({characterControls:true,characterPreviewSelection:true,characterBombImage:true,launchOptions:6,guidanceControls:true,savedAndReopened:true,buildFree:true});
 }

 if(lib.readGame(root,'touhou-kouma').ending?.characterSlides?.length){
  await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('自機')).click()");
  await until("!!document.querySelector('canvas[aria-label=機体別エンディングプレビュー]')");
  const endSelect="document.querySelector('select[aria-label=エンディング画像のプレビュー]')",characterSelect="document.querySelector('select[aria-label=機体別画面のプレビュー]')",canvas="document.querySelector('canvas[aria-label=機体別エンディングプレビュー]')";
  await js(endSelect+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'End'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'End'});await until(endSelect+".value==='5'");
  await js(characterSelect+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Home'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Home'});await until(characterSelect+".value==='0'");await js("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
  const reimu=await js(canvas+'.toDataURL()');
  await js(characterSelect+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'Down'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Down'});await until(characterSelect+".value==='1'");await until(canvas+'.toDataURL()!=='+JSON.stringify(reimu));
  fs.writeFileSync(path.join(output,'ending-reimu.png'),Buffer.from(reimu.split(',')[1],'base64'));fs.writeFileSync(path.join(output,'ending-marisa.png'),Buffer.from((await js(canvas+'.toDataURL()')).split(',')[1],'base64'));
  await js("[...document.querySelectorAll('.category')].find(e=>e.textContent.includes('プロジェクト')).click()");
  await until("!!document.querySelector('input[aria-label=自動送り秒数]')");
  const seconds="document.querySelector('input[aria-label=自動送り秒数]')",music="document.querySelector('select[aria-label=エンディングBGM]')",after="document.querySelector('input[aria-label=最終スコアをエンディング後に集計]')";
  assert.equal(await js(seconds+'.value'),'10');assert.equal(await js(music+'.value'),'34');assert.equal(await js(after+'.checked'),true);
  await js(seconds+'.focus()');win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']});await win.webContents.insertText('12');await until(seconds+".value==='12'");
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'S',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'S',modifiers:['control']});
  for(let i=0;i<100&&lib.readGame(temp,'first').ending.seconds!==12;i++)await new Promise(r=>setTimeout(r,50));const saved=lib.readGame(temp,'first');assert.equal(saved.ending.seconds,12);assert.equal(saved.ending.music,34);assert.equal(saved.ending.scoreAfter,true);assert.equal(lib.resolveEnding(saved,1).at(-1).background,'ending-marisa');assert.equal(fs.existsSync(path.join(temp,'projects/first/build')),false);
  fs.writeFileSync(path.join(output,'editor-ending.png'),(await win.webContents.capturePage()).toPNG());record({endingPreviewsBothCharacters:true,endingSecondsEditedAndReloaded:12,endingMusic:34,scoreAfter:true,buildFree:true});
 }
 record({victoryPreview:true,unsavedDialogueRefresh:true,phaseHpControl:true,phaseHp,returnPositionControl:true,bossControls:true,cutinPreview:true,cutinSeconds:Number(duration),scoreWaitControl:true});clearTimeout(timer);electron.app.exit(0);
}).catch(error=>{record({error:error.stack});clearTimeout(timer);electron.app.exit(1);});
