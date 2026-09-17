// Native hardware-timing cross-check of an unchanged benchmark ROM.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace;
const map=fs.readFileSync(file.replace(/\.gb$/,'.map'),'utf8'),time=parseInt(map.match(/\b([\da-fA-F]{8})\s+_sys_time\b/)[1],16);
const signature=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),found=rom.indexOf(signature,s._ce_trace_write),published=found+signature.length;
assert.ok(found>=s._ce_trace_write&&published<s._ce_sound);fs.mkdirSync(out,{recursive:true});const results=[];
for(const mode of rom[0x143]===0xC0?['CGB']:['DMG','CGB']){
 const dir=fs.mkdtempSync(path.join(out,mode+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 fs.writeFileSync(path.join(dir,'input.dem'),Buffer.concat([Buffer.alloc(240),Buffer.alloc(5,8),Buffer.alloc(5200)]));
 const addresses=[t+17,t+2,t+3,time,time+1,s._ce_bg_count,s._ce_pool_counts+1,s._ce_pool_oam,s._ce_is_cgb,s._ce_bg_dma_end_ly,0xff40];
 const bp=published.toString(16)+'///DENSE '+addresses.map(a=>`%(${a.toString(16)})%`).join(' ');
 const p=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='CGB'?1:0}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:300000});if(p.error)throw p.error;assert.equal(p.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('DENSE ')).map(l=>l.slice(6).trim().split(/\s+/).map(x=>parseInt(x,16))).filter(r=>r[0]===1&&r[1]+256*r[2]>=120&&r[1]+256*r[2]<=720);
 assert.equal(rows.length,601);let dmaEndMax=0;const gaps=[];
 for(let n=0;n<rows.length;n++){
  const r=rows[n];assert.equal(r.length,addresses.length,'native messages must not truncate');assert.ok(r.every(Number.isFinite));assert.equal(r[8],mode==='CGB'?1:0);assert.ok(r[10]&4);assert.ok(r[7]<=40);
  if(mode==='CGB'){assert.ok(r[9]>=144&&r[9]<=153,'native GDMA ends inside VBlank');dmaEndMax=Math.max(dmaEndMax,r[9]);}
  if(n&&r[1]+256*r[2]===rows[n-1][1]+256*rows[n-1][2]+1)gaps.push((r[3]+256*r[4]-rows[n-1][3]-256*rows[n-1][4]+65536)&65535);
 }
 const mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;results.push({mode,samples:rows.length,peakShots:Math.max(...rows.map(r=>r[5])),peakEnemies:Math.max(...rows.map(r=>r[6])),reservedOamPeak:Math.max(...rows.map(r=>r[7])),dmaEndMax,meanFrameBudgets:mean,updatesPerSecond:59.7275/mean,maxGap:Math.max(...gaps)});
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),emulator:'BGB 1.6.6',method:'ordinary input and read-only breakpoint log',results},null,2));console.log(results);
