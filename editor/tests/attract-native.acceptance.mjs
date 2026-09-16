import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),s=symbols(file.replace(/\.gb$/,'.map')),rom=fs.readFileSync(file),t=s._ce_trace;
fs.mkdirSync(out,{recursive:true});
const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),found=rom.indexOf(sig,s._ce_trace_write),published=found+sig.length;
assert.ok(found>=s._ce_trace_write&&published<s._ce_sound);
const hex=n=>n.toString(16),addresses=[t+17,t+4,s._ce_demo,...Array.from({length:10},(_,i)=>s._ce_scores+i)],bp=`${hex(published)}///DEMO ${addresses.map(n=>`%(${hex(n)})%`).join(' ')}`,results=[];
for(const mode of ['DMG','CGB']) {
 const dir=fs.mkdtempSync(path.join(out,mode+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 fs.writeFileSync(path.join(dir,'input.dem'),Buffer.alloc(22000));
 const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:360000});
 if(r.error)throw r.error;assert.equal(r.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(x=>x.startsWith('DEMO ')).map(x=>x.slice(5).trim().split(/\s+/).map(x=>parseInt(x,16)));
 const scenes=[];let last=-1;for(const row of rows){assert.deepEqual(row.slice(3),rows[0].slice(3));if(row[0]!==last){scenes.push(row.slice(0,3));last=row[0];}}
 assert.ok(scenes.filter(r=>r[0]===4).length>=2,'two rankings');assert.ok(scenes.filter(r=>r[0]===12).length>=3,'logo returns');assert.ok(scenes.filter(r=>r[0]===7&&r[2]).length>=2,'demo cutins');
 results.push({mode,scenes,rankingsUnchanged:true});console.log(mode+' native exhibition passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
