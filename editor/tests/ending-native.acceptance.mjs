// BGB corroboration of character-specific ending banks and bonus ordering.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),file=path.resolve(process.argv[2]??'.cache/kouma-v13/ending/fixture/projects/ending-test/build/Debug/ending-test.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v13/bgb'),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace,results=[];
const hex=n=>n.toString(16),ref=n=>`%(${hex(n)})%`,signature=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(signature,s._ce_trace_write)+signature.length;
assert.ok(published>s._ce_trace_write&&published<s._ce_sound);
for(const character of [0,1]){
 const dir=path.join(out,character?'marisa':'reimu');fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'bgb64.exe');fs.copyFileSync(path.join(root,'.tools/bgb/bgb64.exe'),exe);
 fs.writeFileSync(path.join(dir,'input.dem'),Buffer.concat([Buffer.alloc(600),Buffer.alloc(8,8),Buffer.alloc(180),...(character?[Buffer.alloc(8,16),Buffer.alloc(60)]:[]),Buffer.alloc(8,1),Buffer.alloc(30),Buffer.from(Array.from({length:7000},(_,n)=>n%30<15?1:0))]));
 const bp=`${hex(published)}///END ${[t+22,t+17,s._ce_character,s._ce_active_screen,s._ce_is_cgb,s._ce_ending_slide,s._ce_ending_left,s._ce_ending_left+1,s._ce_music_track,t+5,t+6].map(ref).join(' ')}`;
 if(!process.argv.includes('--reuse')||!fs.existsSync(path.join(dir,'debugmsg.txt'))){const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:240000});if(r.error)throw r.error;assert.equal(r.status,0);}
 let rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('END ')).map(l=>l.slice(4).trim().split(/\s+/).map(n=>parseInt(n,16))).filter(r=>r[0]===0&&r[2]===character&&r[4]===1);const ranking=rows.findIndex(r=>r[1]===4);assert.ok(ranking>=0);rows=rows.slice(0,ranking+1);const ending=rows.filter(r=>r[1]===11&&(r[6]+256*r[7])>0),slides=[];
 assert.ok(ending.length);const score=ending[0][9]+256*ending[0][10];assert.ok(ending.every(r=>r[8]===34&&r[9]+256*r[10]===score));
 for(let i=0;i<6;i++){const screen=rom[s._ce_ending_screens+rom[s._ce_ending_offsets+character]+i];assert.ok(ending.some(r=>r[5]===i&&r[3]===screen),`native slide ${i}`);slides.push(screen);}
 const firstScore=rows.findIndex(r=>r[1]===6),lastEnding=rows.findLastIndex(r=>r[1]===11);assert.ok(firstScore>lastEnding);assert.ok(rows[firstScore][9]+256*rows[firstScore][10]>score);assert.ok(rows.some(r=>r[1]===4));
 results.push({character,cgb:true,slides,music:34,bonusAfterAllSlides:true,ranking:true});console.log('BGB character '+character+' ending passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),emulator:'BGB 1.6.6',fixture:true,readOnlyBreakpoint:true,results},null,2));
