// Native BGB corroboration of per-character ROM-bank routing. Read-only breakpoint logging.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {symbols} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),file=path.resolve(process.argv[2]??'.cache/kouma-v11/campaign/fixture/projects/character-test/build/Debug/character-test.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v11/bgb'),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];
const hex=n=>n.toString(16),ref=n=>`%(${hex(n)})%`,t=syms._ce_trace;
const publish=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(publish,syms._ce_trace_write)+publish.length;
assert.ok(published>syms._ce_trace_write&&published<syms._ce_sound,'verified final seqlock store in SM83 trace routine');
for(const character of [0,1]){
 const dir=path.join(out,character?'marisa':'reimu');fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'bgb64.exe');fs.copyFileSync(path.join(root,'.tools/bgb/bgb64.exe'),exe);
 const input=Buffer.concat([Buffer.alloc(600),Buffer.alloc(8,8),Buffer.alloc(180),...(character?[Buffer.alloc(8,16),Buffer.alloc(60)]:[]),Buffer.alloc(8,1),Buffer.alloc(30),Buffer.from(Array.from({length:10000},(_,n)=>n%30<15?1:0))]);fs.writeFileSync(path.join(dir,'input.dem'),input);
 const breakpoint=`${hex(published)}///CHAR ${[t+22,t+17,t+4,syms._ce_character,syms._ce_active_screen,syms._ce_is_cgb].map(ref).join(' ')}`;
 const args=['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',breakpoint];
 if(!process.argv.includes('--reuse')||!fs.existsSync(path.join(dir,'screen.bmp'))){const run=spawnSync(exe,args,{cwd:dir,windowsHide:true,timeout:300000});if(run.error)throw run.error;assert.equal(run.status,0);}
 // Log after the verified final store. A CPU breakpoint avoids per-memory-access overhead.
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(s=>s.startsWith('CHAR ')).map(s=>s.slice(5).trim().split(/\s+/).map(n=>parseInt(n,16))).filter(r=>r[0]===0&&r[3]===character&&r[5]===1);
 const scenes=new Set(rows.map(r=>r[1]));assert.ok(rows.length);assert.ok(rows.every(r=>r[5]===1),'native CGB mode');
 const stages=[];for(let stage=0;stage<7;stage++){
  const banked=syms._ce_presentations,offset=(banked>>>16)*0x4000+(banked&0x3fff),row=offset+(stage*2+character)*13,first=rom[row],after=rom[row+11],clear=rom[row+2];
  for(let page=0;page<4;page++)for(const [scene,screen]of [[5,first+page],[9,after+page]])assert.ok(rows.some(r=>r[1]===scene&&r[2]===stage&&r[4]===screen),`native char ${character} stage ${stage} scene ${scene} screen ${screen}`);
  assert.ok(rows.some(r=>r[1]===6&&r[2]===stage&&r[4]===clear));stages.push(stage);
 }
 assert.ok(scenes.has(3),'native reaches ending');results.push({character,cgb:true,stages,pages:56,scoreScreens:7,ending:true,readOnlyBreakpoint:true});console.log('BGB character',character,'passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),emulator:'BGB 1.6.6',fixture:true,results},null,2));
