import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import {symbols} from './emulator.mjs';
const root=process.cwd(),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace,l=createRequire(import.meta.url)('../build/library.cjs'),g=l.readGame(root,'touhou-kouma');
fs.mkdirSync(out,{recursive:true});const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(sig,s._ce_trace_write)+sig.length;assert.ok(published>s._ce_trace_write&&published<s._ce_sound);
const addresses=[t+17,t+2,t+3,s._ce_character,s._ce_state+10,s._ce_pool_counts+3,0xfe02,...Array.from({length:6},(_,i)=>[s._ce_entities+i*25,s._ce_entities+i*25+2]).flat()],hex=n=>n.toString(16),bp=`${hex(published)}///SHOT ${addresses.map(n=>`%(${hex(n)})%`).join(' ')}`,results=[];
for(const mode of ['DMG','CGB'])for(const character of [0,1]){
 const dir=fs.mkdtempSync(path.join(out,`${mode}-${character}-`)),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 const tap=(k,rest=80)=>[Buffer.alloc(8,k),Buffer.alloc(rest)];
 fs.writeFileSync(path.join(dir,'input.dem'),Buffer.concat([Buffer.alloc(1200),...tap(1),...(character?tap(16):[]),...tap(1,100),Buffer.alloc(100,1),Buffer.alloc(20)]));
 const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:120000});if(r.error)throw r.error;assert.equal(r.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(x=>x.startsWith('SHOT ')).map(x=>x.slice(5).trim().split(/\s+/).map(x=>parseInt(x,16))).filter(r=>r[0]===1);
 const firing=rows.filter(r=>r[5]>0),wanted=g.assets.filter(a=>a.kind==='sprite').findIndex(a=>a.id===(character?'shot-marisa-laser':'shot-ofuda'));
 assert.ok(firing.length>12);assert.ok(firing.every(r=>r[3]===character&&r[5]<=6));
 assert.ok(firing.some(r=>r.slice(7).some((v,i,a)=>!(i%2)&&v===3&&a[i+1]===wanted)),'actual player-shot asset');
 const peaks=firing.filter((r,i)=>r[4]===(character?3:11)&&(i===0||firing[i-1][4]!==r[4])).map(r=>r[1]+256*r[2]);
 assert.ok(peaks.length>=4);const intervals=peaks.slice(1).map((v,i)=>v-peaks[i]);assert.ok(intervals.every(n=>n===(character?4:12)),JSON.stringify(intervals));
 const actor=g.assets.find(a=>a.id===(character?"marisa":"reimu")),base=128+l.spriteLayout(g).offsets.get(actor.id),tiles=actor.width*actor.height/64,animationFrames=[...new Set(firing.map(r=>(r[6]-base)/tiles).filter(f=>f===0||f===1))];assert.equal(animationFrames.length,2,"native player animation"); results.push({mode,character,animationFrames,intervals,assetVerified:true,maxShots:Math.max(...firing.map(r=>r[5])),log:path.join(dir,'debugmsg.txt')});console.log(mode+' '+character+' passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),emulator:'BGB 1.6.6',results},null,2));
