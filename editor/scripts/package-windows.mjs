import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, '.cache/release/Caravan-Editor');
if (fs.existsSync(out)) throw Error('Package output already exists; choose a clean build workspace.');
const electron = path.join(root, '.tools/electron');
if (!fs.existsSync(path.join(electron, 'electron.exe'))) throw Error('Locked Windows Electron is required.');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(electron, out, { recursive: true });
fs.renameSync(path.join(out,'electron.exe'),path.join(out,'Caravan-Editor.exe'));
fs.renameSync(path.join(out,'LICENSE'),path.join(out,'LICENSE-Electron.txt'));
fs.rmSync(path.join(out,'resources/default_app.asar'), { force:true });
const app = path.join(out,'resources/app');
fs.mkdirSync(app,{recursive:true});
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'caravan-editor',version:'1.1.0',main:'build/main.cjs',license:'MIT'}));
fs.cpSync(path.join(root,'editor/build'),path.join(app,'build'),{recursive:true,filter:p=>!p.endsWith('.wasm')&&!p.endsWith('.map')});
for (const p of ['config','scripts','engine','docs','licenses']) fs.cpSync(path.join(root,p),path.join(out,p),{recursive:true});
for (const p of ['LICENSE','THIRD_PARTY_NOTICES.md']) fs.copyFileSync(path.join(root,p),path.join(out,p));
for (const name of ['star-caravan','caravan-lab','nova-spear']) {
 const src=path.join(root,'projects',name), dest=path.join(out,'projects',name);
 fs.mkdirSync(dest,{recursive:true});
 for (const p of ['assets-src/game.json','project.json','README.md']) if(fs.existsSync(path.join(src,p))){fs.mkdirSync(path.dirname(path.join(dest,p)),{recursive:true});fs.copyFileSync(path.join(src,p),path.join(dest,p));}
}
fs.writeFileSync(path.join(out,'START-HERE.txt'),'Caravan Editor for Windows x64\r\n\r\nExtract the complete ZIP into a writable folder, then run Caravan-Editor.exe.\r\nFirst launch downloads the locked build tools into .tools. No Git, Python, npm or administrator installation is needed.\r\nUse Tools > Setup to retry or add an external emulator.\r\nKeep the entire folder together. Projects and saves remain in this folder.\r\nWindows PowerShell 5.1 and an Internet connection are required for first setup.\r\n');
const files=[];
function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())visit(p);else{if(p.endsWith('.wasm'))throw Error('Downloaded emulator must not be bundled');files.push({path:path.relative(out,p).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')});}}}
visit(out);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:'1.1.0',files},null,2));
console.log(out);
