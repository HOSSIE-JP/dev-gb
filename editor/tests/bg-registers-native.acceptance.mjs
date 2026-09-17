// BGB corroboration of the authored diagnostic, without ROM/RAM patches.
// node editor/tests/bg-registers-native.acceptance.mjs BEFORE.json AFTER.json OUT
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {symbols} from './emulator.mjs';
const [baseFile,nextFile,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const reports=[baseFile,nextFile].map(f=>JSON.parse(fs.readFileSync(f,'utf8')));
assert.equal(reports[0].harnessSha256,reports[1].harnessSha256,'identical authored workload');
fs.mkdirSync(out,{recursive:true});
const results=[];
const stats=a=>({samples:a.length,mean:a.reduce((s,n)=>s+n,0)/a.length,max:Math.max(...a)});
for(const [variant,r] of reports.entries())for(const mode of ['DMG','CGB']){
 const dir=fs.mkdtempSync(path.join(out,`${variant}-${mode}-`)),exe=path.join(dir,'bgb64.exe');
 const rom=fs.readFileSync(r.rom),s=symbols(r.rom.replace(/\.gb$/,'.map'));
 assert.equal(crypto.createHash('sha256').update(rom).digest('hex'),r.sha256);
 fs.copyFileSync('.tools/bgb/bgb64.exe',exe);fs.writeFileSync(path.join(dir,'input.dem'),Buffer.alloc(6500));
 const h=n=>{assert.ok(Number.isInteger(n));return n.toString(16);},m=n=>`%(${h(n)})%`;
 const bp=[`${h(s._ce_bench_start)}///BEGIN %TOTALCLKS%`,`${h(s._ce_bench_end)}///END %TOTALCLKS%`,
  `${h(s._ce_bench_published)}///PUB %TOTALCLKS% ${[s._ce_bench_case,s._ce_bg_count,s._ce_bg_hit,s._ce_bench_spawn_hit,s._ce_is_cgb,s._ce_bg_dma_end_ly].map(m).join(' ')}`].join(',');
 const p=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,
  '-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',r.rom,'-demoplay',path.join(dir,'input.dem'),'-br',bp,
  '-wp','ff55//w/DMA %SCANLINE% %VALUE%'],{cwd:dir,windowsHide:true,timeout:120000});
 if(p.error)throw p.error;assert.equal(p.status,0,p.stderr.toString());
 const lines=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/),samples=[],dma=[];
 let start=null,end=null,prior=null;
 for(const line of lines){
  const [tag,...fields]=line.trim().split(/\s+/),a=fields.map(v=>parseInt(v,16));
  if(tag==='BEGIN'){assert.equal(start,null);start=a[0];}
  if(tag==='END'){assert.notEqual(start,null);end=a[0];}
  if(tag==='DMA')dma.push(a);
  if(tag==='PUB'){
   assert.notEqual(start,null);assert.notEqual(end,null);assert.equal(a[5],mode==='CGB'?1:0);
   samples.push({case:a[1],count:a[2],hit:a[3],spawnHit:a[4],dmaEnd:a[6],
    // BGB's TOTALCLKS unit is always one double-speed NOP (four CGB T-cycles).
    cycles:((end-start)>>>0)*(mode==='CGB'?4:2),
    frames:prior===null?null:((a[0]-prior)>>>0)/35112});
   start=null;end=null;prior=a[0];
  }
 }
 assert.equal(samples.length,576,'every authored update observed');
 if(mode==='CGB'){
  assert.ok(dma.length>100);assert.ok(dma.every(([line])=>line>=144&&line<=153),'GDMA begins inside VBlank');
  assert.ok(samples.filter(x=>x.case!==8).every(x=>x.dmaEnd>=144&&x.dmaEnd<=153),'GDMA completes inside VBlank');
 }
 const cases=Array.from({length:9},(_,c)=>{const a=samples.filter(x=>x.case===c);return {case:c,cycles:stats(a.map(x=>x.cycles)),frames:stats(a.slice(1).map(x=>x.frames))};});
 const data={variant:variant?'after':'before',mode,sha256:r.sha256,samples,cases};
 if(variant){const priorResult=results.find(x=>x.variant==='before'&&x.mode===mode);
  assert.deepEqual(samples.map(({case:c,count,hit,spawnHit})=>[c,count,hit,spawnHit]),priorResult.samples.map(({case:c,count,hit,spawnHit})=>[c,count,hit,spawnHit]),'native count/damage parity');}
 results.push(data);console.log(JSON.stringify({variant:data.variant,mode,cases}));
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({emulator:'BGB 1.6.6',diagnostic:true,results},null,2));
