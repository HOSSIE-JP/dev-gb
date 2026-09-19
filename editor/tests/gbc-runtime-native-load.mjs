// BGB timings for the deliberately authored 40-bullet fixture. This is not a
// production route; the fixture performs bounded replenishment/burst work too.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const [fileArg,outArg]=process.argv.slice(2),file=path.resolve(fileArg),out=path.resolve(outArg);
fs.mkdirSync(out,{recursive:true});
const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),map=fs.readFileSync(file.replace(/\.gb$/,'.map'),'utf8');
const clock=parseInt(map.match(/\b([\da-fA-F]{8})\s+_sys_time\b/)[1],16);
const dir=fs.mkdtempSync(path.join(out,'bgb-')),exe=path.join(dir,'bgb64.exe'),input=Buffer.alloc(2200);
fs.copyFileSync('.tools/bgb/bgb64.exe',exe);fs.writeFileSync(path.join(dir,'input.dem'),input);
const fields=[s._ce_qa_updates,s._ce_qa_updates+1,clock,clock+1,s._ce_bg_count,s._ce_bg_dma_end_ly,s._ce_bomb_left,s._ce_bg_tile_drops,s._ce_bg_tile_drops+1];
const bp=s._ce_qa_marker.toString(16)+'///LOAD '+fields.map(a=>`%(${a.toString(16)})%`).join(' ');
const run=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set','SystemMode=1','-set','DebugVRAMbreak=1','-set','DebugOAMDMABreak=1','-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-br',bp],{cwd:dir,windowsHide:true,timeout:180000});
if(run.error)throw run.error;assert.equal(run.status,0);
const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('LOAD ')).slice(0,600).map(l=>l.slice(5).split(/\s+/).map(n=>parseInt(n,16))).map(a=>({update:a[0]+a[1]*256,frame:a[2]+a[3]*256,count:a[4],dmaEnd:a[5],bomb:a[6],tileDrops:a[7]+a[8]*256}));
assert.equal(rows.length,600);for(const r of rows){assert.equal(r.count,r.bomb?0:40);assert.equal(r.tileDrops,0);assert(r.dmaEnd>=144&&r.dmaEnd<=153);}
const gaps=rows.slice(1).map((r,i)=>(r.frame-rows[i].frame)&65535),frames=gaps.reduce((a,b)=>a+b,0);
const report={fixture:true,romHash:crypto.createHash('sha256').update(rom).digest('hex'),inputHash:crypto.createHash('sha256').update(input).digest('hex'),updates:gaps.length,frames,updatesPerSecond:gaps.length*59.7275/frames,deadlineMisses:gaps.filter(g=>g!==1).length,dmaEndMax:Math.max(...rows.map(r=>r.dmaEnd)),rows};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined}));
