import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace,p=s._ce_entities;
fs.mkdirSync(out,{recursive:true});const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),found=rom.indexOf(sig,s._ce_trace_write);assert.ok(found>=s._ce_trace_write&&found<s._ce_sound);
const addresses=[s._ce_scene,p+11,p+12,p+4,p+5,p+6,p+7,p+8,p+9,p+13],bp=`${(found+sig.length).toString(16)}///MOVIE ${addresses.map(n=>`%(${n.toString(16)})%`).join(' ')}`,results=[];
for(const mode of ['DMG','CGB']){
 const dir=fs.mkdtempSync(path.join(out,mode+'-play-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 fs.writeFileSync(path.join(dir,'input.dem'),Buffer.alloc(1500));
 const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:90000});
 if(r.error)throw r.error;assert.equal(r.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(x=>x.startsWith('MOVIE ')).map(x=>x.slice(6).trim().split(/\s+/).map(x=>parseInt(x,16))),movie=rows.filter(r=>r[0]===15);
 assert.ok(movie.length,'native movie runs');assert.ok(rows.some(r=>r[0]===0),'returns to title');
 const last=movie.at(-1);assert.equal(last[1],35);assert.equal(last[2],0,'native frame overruns');assert.ok(last[3]+last[4]*256>=920);
 results.push({mode,observedFrames:[...new Set(movie.map(r=>r[1]))],overruns:last[2],pcmBlocks:last[3]+last[4]*256,traceRows:movie.length});console.log(mode,'complete playback passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));


