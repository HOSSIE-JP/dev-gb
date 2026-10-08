// Real Electron UI/IPC and official compiler, isolated exact copy of the project.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),electron=require('electron');
const verifyOnly=process.argv.includes('--verify-only');
const root=path.resolve(__dirname,'../..'),lib=require('../build/library.cjs'),out=path.join(root,'.cache/uge-integration-20261008',verifyOnly?'ui-source-final':'ui');fs.mkdirSync(out,{recursive:true});
const temp=fs.mkdtempSync(path.join(out,'workspace-')),records=[],save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({temp,records},null,2));
for(const f of ['editor/build','engine/caravan','config','.tools/gbdk','.tools/node','.tools/misaki'])fs.cpSync(path.join(root,f),path.join(temp,f),{recursive:true});
for(const f of ['project.json','assets-src'])fs.cpSync(path.join(root,'projects/touhou-kouma',f),path.join(temp,'projects/touhou-kouma',f),{recursive:true});
const initial=lib.readGame(temp,'touhou-kouma'),revision=lib.revision(initial),trackHashes=initial.musicUgeTracks.map(t=>t.ugeSha256);
let win;
class TestWindow extends electron.BrowserWindow{constructor(o){super({...o,show:false,webPreferences:{...o.webPreferences,backgroundThrottling:false}});win=this;}}
const native={...electron,BrowserWindow:TestWindow,dialog:{...electron.dialog,showMessageBox:async()=>({response:1}),showMessageBoxSync:()=>1}};
electron.app.disableHardwareAcceleration();
const timeout=setTimeout(()=>{records.push({error:'timeout'});save();electron.app.exit(1)},900000);
const delay=ms=>new Promise(r=>setTimeout(r,ms)),js=s=>win.webContents.executeJavaScript(s);
async function until(s,ms=15000){for(let t=0;t<ms;t+=100){if(await js(s))return;await delay(100)}throw Error('Timed out: '+s)}
async function key(k){win.webContents.sendInputEvent({type:'keyDown',keyCode:k});win.webContents.sendInputEvent({type:'keyUp',keyCode:k});await delay(100)}
async function select(selector,value){const n=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.focus();return [...e.options].filter(o=>!o.disabled).findIndex(o=>o.value===${JSON.stringify(String(value))})})()`);assert(n>=0);await key('Home');for(let i=0;i<n;i++)await key('Down');await key('Return');await until(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(String(value))}`)}
async function button(text){
 const selector=await js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}||b.getAttribute('aria-label')===${JSON.stringify(text)}||(${JSON.stringify(text)}==='保存'&&b.textContent.trim().startsWith('保存')));if(!b)throw Error('missing button');b.dataset.ugeTarget='1';return '[data-uge-target="1"]'})()`);
 await until(`!document.querySelector(${JSON.stringify(selector)}).disabled`);
 await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});void 0`);await delay(100);
 const point=await js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
 for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,...point,button:'left',clickCount:1});await delay(100);
 await js(`document.querySelector('[data-uge-target="1"]')?.removeAttribute('data-uge-target')`);
}
vm.runInNewContext(fs.readFileSync(path.join(root,'editor/build/main.cjs'),'utf8'),{require:n=>n==='electron'?native:require(n),module:{exports:{}},__dirname:path.join(temp,'editor/build'),process:{...process,argv:[process.execPath,'touhou-kouma'],env:{...process.env}},Buffer,console,structuredClone,URL,Response,atob,btoa,setTimeout,clearTimeout});
electron.app.whenReady().then(async()=>{
 await until(`!!document.querySelector('.project-picker select')`);await button('♫音楽');
 await until(`document.querySelectorAll('select[aria-label="編集する曲"] option').length===19`);
 const choose='select[aria-label="編集する曲"]',assign='select[aria-label="曲の割り当て先"]';
 for(const t of initial.musicUgeTracks){await select(choose,t.id);assert((await js(`document.querySelector('.music-editor h3')?.textContent`))===t.title);assert.equal(await js(`!!document.querySelector('.music-piano')`),false);}
 records.push('all 16 UGE selections show their own titles and hide unrelated note/audition controls');save();
 await select(choose,19);await select(assign,'road:'+initial.stageOrder[0]);await button('この曲を割り当てる');await button('保存');
 await until(`![...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('保存')).textContent.includes('保存中')`);
 assert.equal(lib.readGame(temp,'touhou-kouma').stages[0].music,19);
 await win.webContents.reload();await until(`!!document.querySelector('.project-picker select')`);await button('♫音楽');await until(`document.querySelectorAll('select[aria-label="編集する曲"] option').length===19`);
 assert.equal(lib.readGame(temp,'touhou-kouma').stages[0].music,19);
 await select(choose,17);await select(assign,'road:'+initial.stageOrder[0]);await button('この曲を割り当てる');await button('保存');await delay(600);
 assert.equal(lib.revision(lib.readGame(temp,'touhou-kouma')),revision);
 assert.deepEqual(lib.readGame(temp,'touhou-kouma').musicUgeTracks.map(t=>t.ugeSha256),trackHashes);
 records.push('UGE cue changed, saved, reopened and restored through UI; final revision and all source hashes retained');save();
 await select(choose,32);await js(`document.querySelector('[aria-label="編集曲名"]').focus()`);await key('End');win.webContents.insertText(' QA');await delay(300);await button('保存');await delay(600);
 const edited=lib.readGame(temp,'touhou-kouma');assert(edited.musicTracks[0].title.endsWith(' QA'));assert.deepEqual(lib.musicErrors(edited.musicTracks),[]);
 await button('元に戻す');await button('保存');await delay(600);assert.equal(lib.revision(lib.readGame(temp,'touhou-kouma')),revision);
 records.push('retained two-voice result cue edited and saved, then undone and restored through native UI');save();
 await until(`![...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('保存')).textContent.includes('保存中')`,30000);
 await select(choose,17);await until(`document.querySelector('.music-editor h3')?.textContent===${JSON.stringify(initial.musicUgeTracks.find(t=>t.id===17).title)}`);await delay(500);
 fs.writeFileSync(path.join(out,'music.png'),(await win.webContents.capturePage()).toPNG());
 for(const config of verifyOnly?[]:['Debug','Release']){
  await select('select[aria-label="ビルド構成"]',config);await button('ビルド');
  await until(`!!document.querySelector('button.danger')`);
  await until(`!document.querySelector('button.danger')`,420000);
  const result=lib.readBuiltRom(temp,'touhou-kouma',config,revision);assert(result.bytes);assert.equal(result.bytes.length,4194304);
  records.push({configuration:config,sha256:lib.hash(result.bytes),bytes:result.bytes.length});save();
 }
 if(!verifyOnly)assert.equal(records.at(-1).sha256,records.at(-2).sha256);records.push('PASS');save();clearTimeout(timeout);electron.app.exit(0);
}).catch(async e=>{records.push({error:e.stack});save();try{fs.writeFileSync(path.join(out,'failure.png'),(await win.webContents.capturePage()).toPNG())}catch{}clearTimeout(timeout);electron.app.exit(1)});
