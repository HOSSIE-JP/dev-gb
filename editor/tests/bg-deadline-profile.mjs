// Read-only native BGB milestones on unchanged ROMs; no instrumentation overhead
// in the emulated CPU. Separate simulation, packet assembly, waits and DMA.
// node editor/tests/bg-deadline-profile.mjs ROM.gb OUT [5000] [fixture|attract] [CGB|DMG] [existing-debugmsg.txt]
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {symbols} from './emulator.mjs';
const [fileArg,outArg,countArg='5000',route='fixture',mode='CGB']=process.argv.slice(2);
const file=path.resolve(fileArg),out=path.resolve(outArg),count=Number(countArg);
assert.ok(['fixture','attract'].includes(route)&&['CGB','DMG'].includes(mode));
assert.ok(Number.isInteger(count)&&count>=1500&&count<=60000);
const rom=fs.readFileSync(file),stem=file.replace(/\.gb$/,''),s=symbols(stem+'.map');
const cdb=fs.readFileSync(stem+'.cdb','utf8'),noi=fs.readFileSync(stem+'.noi','utf8');
function address(name){
 const m=cdb.match(new RegExp('^L:(?:F[^$]+|G)\\$'+name+'\\$0(?:_0)?\\$0:([0-9a-f]+)$','mi'));
 if(m)return parseInt(m[1],16);
 const n=noi.match(new RegExp('^DEF _'+name+' 0x([0-9a-f]+)$','mi'));assert.ok(n,name);return parseInt(n[1],16);
}
const at=a=>(a>>>16)*16384+(a&0x3fff),h=n=>n.toString(16);
const t=s._ce_trace,sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),found=rom.indexOf(sig,s._ce_trace_write);
assert.ok(found>=s._ce_trace_write&&found<s._ce_sound);
const spawnName=cdb.includes('$spawn_shot$0$0:')?'spawn_shot':'ce_bg_spawn';
const milestones={S:address('ce_step'),U:address('ce_bg_update'),N:address(spawnName),R:address('ce_render'),F:address('ce_bg_flush'),V:address('vsync'),P:address('ce_bg_publish'),T:found+sig.length};
const end=cdb.match(/^L:XG\$ce_bg_update\$0\$0:([0-9a-f]+)$/mi);assert.ok(end);
milestones.E=parseInt(end[1],16);assert.equal(rom[at(milestones.E)],0xc9,'BG update return instruction');
const compound=address('compound_count'),state=s._ce_state;
const fields=[state,state+1,s._ce_scene,s._ce_battle_mode,s._ce_bg_count,compound];
const logFields=`%TOTALCLKS% %SCANLINE% ${fields.map(a=>`%(${h(a)})%`).join(' ')}`;
const bp=Object.entries(milestones).map(([name,a])=>`${h(a&65535)}/${a>>>16?`ROMBANK=${h(a>>>16)}`:''}//${name} ${logFields}`).join(',')+
 (route==='fixture'?`,${h(milestones.S)}/(${h(state+1)})=2/`: '');
fs.mkdirSync(out,{recursive:true});const dir=fs.mkdtempSync(path.join(out,'bgb-')),exe=path.join(dir,'bgb64.exe');
fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
fs.writeFileSync(path.join(dir,'input.dem'),Buffer.concat([...(route==='fixture'?[Buffer.alloc(240),Buffer.alloc(4,8)]:[]),Buffer.alloc(count)]));
const existingLog=process.argv[7];
if(!existingLog){const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,
 '-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-br',bp,
 '-wp','ff55//w/D %TOTALCLKS% %SCANLINE%'],{cwd:dir,windowsHide:true,timeout:Math.max(180000,count*30)});
if(r.error)throw r.error;assert.equal(r.status,0,r.stderr.toString());}
const logFile=existingLog??path.join(dir,'debugmsg.txt');
const events=fs.readFileSync(logFile,'utf8').split(/\r?\n/).filter(x=>/^[SUNRFVPETD] /.test(x)).map(line=>{
 const [tag,...words]=line.trim().split(/\s+/),a=words.map(x=>parseInt(x,16));
 return tag==='D'?{tag,clock:a[0],ly:a[1]}:{tag,clock:a[0],ly:a[1],tick:a[2]+256*a[3],scene:a[4],battle:a[5],bullets:a[6],compound:a[7]};
});
const delta=(b,a)=>((b.clock-a.clock)>>>0)/35112,frames=[];let pending=[];
for(const e of events){
 if(e.tag==='S'){
  if(pending.length){
   const start=pending[0],u=pending.find(x=>x.tag==='U'),end=pending.find(x=>x.tag==='E'),render=pending.find(x=>x.tag==='R'),flush=pending.find(x=>x.tag==='F'),
    waits=pending.filter(x=>x.tag==='V'),pub=pending.find(x=>x.tag==='P'),done=pending.find(x=>x.tag==='T'),dma=pending.filter(x=>x.tag==='D');
   if(start.scene===1&&start.battle===2&&u&&end&&render&&flush&&waits.length&&pub&&done&&e.tick===start.tick+1&&delta(e,start)<4){
    frames.push({tick:start.tick,bullets:done.bullets,spawnCalls:pending.filter(x=>x.tag==='N').length,compound:pub.compound,
     total:delta(e,start),update:delta(end,u),otherSimulation:delta(render,start)-delta(end,u),spritesHud:delta(flush,render),
     assemble:delta(waits[0],flush),poseWait:delta(pub,waits[0]),publish:delta(done,pub),loop:delta(e,done),
     publishLine:pub.ly,extraWait:waits.some(x=>x.clock>pub.clock),dmaStarts:dma.map(x=>x.ly)});
   }
  }
  pending=[e];
 }else if(pending.length)pending.push(e);
}
const selected=frames.filter(x=>route==='attract'||(x.tick>=120&&x.tick<400));
assert.ok(selected.length>=100,'sustained BG boss gameplay');
if(route==='fixture')assert.equal(selected.length,280,'all measured ticks present');
if(mode==='CGB')assert.ok(selected.every(x=>x.dmaStarts.length&&x.dmaStarts.every(ly=>ly>=144&&ly<=153)),'measured GDMA writes start in VBlank');
const components=['total','update','otherSimulation','spritesHud','assemble','poseWait','publish','loop'];
function summarize(a){return {samples:a.length,meanFrames:Object.fromEntries(components.map(k=>[k,a.length?a.reduce((s,x)=>s+x[k],0)/a.length:null])),extraWaits:a.filter(x=>x.extraWait).length,publishLines:[...new Set(a.map(x=>x.publishLine))].sort((a,b)=>a-b),peak:a.length?Math.max(...a.map(x=>x.bullets)):null};}
const result={rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),emulator:'BGB 1.6.6',mode,route,frames:count,
 reusedLog:!!existingLog,logFile:path.resolve(logFile),
 method:'Unmodified ROM; logged PC milestones and DMA writes. Durations include IRQs. Unit: display frames (35112 double-speed NOPs).',
 all:summarize(selected),late:summarize(selected.filter(x=>x.total>1.5)),normal:summarize(selected.filter(x=>x.total<=1.5)),samples:selected};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,samples:undefined},null,2));
