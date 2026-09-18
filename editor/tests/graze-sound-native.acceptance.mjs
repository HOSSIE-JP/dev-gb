// BGB executes the same diagnostic ROM; read-only marker logs, no state writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),s=symbols(file.replace(/\.gb$/,'.map')),results=[];fs.mkdirSync(out,{recursive:true});
for(const mode of ['DMG','CGB']){
 const dir=fs.mkdtempSync(path.join(out,mode+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);fs.writeFileSync(path.join(dir,'input.dem'),Buffer.alloc(600));
 const fields=[s._ce_bench_ready,s._ce_bench_case,s._ce_bench_sample_id,s._ce_spell_sound_left,0xff12,0xff21,0xff22,0xff17,0xff1c,0xff26];
 const bp=`${s._ce_bench_sample.toString(16)}///SFX ${fields.map(a=>`%(${a.toString(16)})%`).join(' ')}`;
 const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-br',bp],{cwd:dir,windowsHide:true,timeout:60000});
 if(r.error)throw r.error;assert.equal(r.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('SFX ')).map(l=>l.slice(4).trim().split(/\s+/).map(n=>parseInt(n,16))).filter(a=>a[0]===0xa7);
 const find=(c,i)=>{const a=rows.find(a=>a[1]===c&&a[2]===i);assert(a,`${mode} missing case ${c}/${i}`);return a;};
 const onsets=[];let prior=false;for(let i=0;i<36;i++){const a=find(0,i);assert.equal(a[4],0x42);assert.equal(a[5],0x41);assert.equal(a[6],0x18);assert.equal(a[7],0x72);assert.equal(a[8]&0x60,0x60);const active=!!(a[9]&8);if(active&&!prior)onsets.push(i);prior=active;}
 assert.deepEqual(onsets,[0,12,24]);
 for(let c=1;c<4;c++){for(let i=0;i<3;i++)assert.equal(find(c,i)[5],[0,0x73,0xf4,0xa1][c]);assert.equal(find(c,3)[5],0x41);}
 for(let c=4;c<7;c++){assert.equal(find(c,0)[5],0x41);assert.equal(find(c,1)[5],[0x73,0xf4,0xa1][c-4]);}
 assert.equal(find(7,0)[3],72);assert.equal(find(7,0)[5],0x23);assert.equal(find(8,0)[3],72);assert.equal(find(8,0)[5],0xc0);assert.equal(find(9,0)[5],0);
 results.push({mode,samples:rows.length,onsets,higherPriority:true,shotAndBgmPreserved:true});console.log(results.at(-1));
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({diagnostic:true,rom:file,results},null,2));
