// Native timing for the unchanged bg-local fixture: Start, then stationary play.
// node editor/tests/bg-local-native.acceptance.mjs GAMEPLAY/results.json OUT
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {symbols} from './emulator.mjs';
const reports=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),out=path.resolve(process.argv[3]);
assert.equal(reports[0].sourceRevision,reports[1].sourceRevision);fs.mkdirSync(out,{recursive:true});
const results=[];
for(const r of reports)for(const mode of ['DMG','CGB']){
 const rom=fs.readFileSync(r.rom),s=symbols(r.rom.replace(/\.gb$/,'.map')),t=s._ce_trace;
 assert.equal(crypto.createHash('sha256').update(rom).digest('hex'),r.sha256);
 const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),found=rom.indexOf(sig,s._ce_trace_write);
 assert.ok(found>=s._ce_trace_write&&found<s._ce_sound,'coherent publication');
 const dir=fs.mkdtempSync(path.join(out,`${r.variant}-${mode}-`)),exe=path.join(dir,'bgb64.exe');
 fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 fs.writeFileSync(path.join(dir,'input.dem'),Buffer.concat([Buffer.alloc(240),Buffer.alloc(4,8),Buffer.alloc(3800)]));
 const h=n=>n.toString(16),addresses=[t+17,t+2,t+3,t+7,s._ce_bg_count,s._ce_bg_hit,s._ce_is_cgb];
 const bp=`${h(found+sig.length)}///GAME %TOTALCLKS% ${addresses.map(n=>`%(${h(n)})%`).join(' ')}`;
 const p=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,
  '-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',r.rom,'-demoplay',path.join(dir,'input.dem'),'-br',bp],
  {cwd:dir,windowsHide:true,timeout:120000});
 if(p.error)throw p.error;assert.equal(p.status,0,p.stderr.toString());
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(x=>x.startsWith('GAME ')).map(x=>x.slice(5).trim().split(/\s+/).map(x=>parseInt(x,16)));
 const unique=new Map();
 for(const a of rows){assert.equal(a[7],mode==='CGB'?1:0);const tick=a[2]+a[3]*256;if(a[1]===1&&tick>=120&&tick<=1000&&!unique.has(tick))unique.set(tick,a);}
 assert.equal(unique.size,881,'continuous 120..1000 gameplay ticks');
 const samples=[...unique],gaps=samples.slice(1).map(([tick,a],i)=>{assert.equal(tick,samples[i][0]+1);return ((a[0]-samples[i][1][0])>>>0)/35112;});
 const stateHash=crypto.createHash('sha256').update(JSON.stringify(samples.map(([tick,a])=>[tick,...a.slice(4,7)]))).digest('hex');
 const mean=gaps.reduce((s,n)=>s+n,0)/gaps.length;
 const data={variant:r.variant,mode,sha256:r.sha256,samples:gaps.length,peak:Math.max(...samples.map(([,a])=>a[5])),
  meanDisplayFrames:mean,updatesPerSecond:59.7275/mean,maxDisplayFrames:Math.max(...gaps),stateHash};
 assert.equal(data.peak,40);if(r.variant==='current')assert.equal(stateHash,results.find(x=>x.variant==='baseline'&&x.mode===mode).stateHash,'native state parity');
 results.push(data);console.log(JSON.stringify(data));
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({emulator:'BGB 1.6.6',fixture:true,input:'Start, stationary; no shots or RAM writes',results},null,2));
