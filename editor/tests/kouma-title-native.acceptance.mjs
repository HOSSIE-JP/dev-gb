// BGB input replay: stage wrap, cancel/return, both characters, last-stage start.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const root=process.cwd(),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]??'.cache/kouma-v19/bgb-menu'),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace;
const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(sig,s._ce_trace_write)+sig.length;assert.ok(published>s._ce_trace_write&&published<s._ce_sound);
const hex=n=>n.toString(16),addresses=[t+17,t+4,s._ce_character,s._ce_title_choice,s._ce_title_stage,s._ce_bombs,t+5,t+6],bp=`${hex(published)}///MENU ${addresses.map(n=>`%(${hex(n)})%`).join(' ')}`,results=[];fs.mkdirSync(out,{recursive:true});
for(const mode of ['DMG','CGB'])for(const character of [0,1]){
 const dir=fs.mkdtempSync(path.join(out,mode+'-'+character+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync(path.join(root,'.tools/bgb/bgb64.exe'),exe);
 const tap=(key,rest=24)=>[Buffer.alloc(8,key),Buffer.alloc(rest)],demo=Buffer.concat([Buffer.alloc(1200),...tap(128),...tap(32),...tap(1,80),...tap(2,80),...tap(1,80),...(character?tap(16,80):[]),...tap(1,160)]);fs.writeFileSync(path.join(dir,'input.dem'),demo);
 const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:120000});if(r.error)throw r.error;assert.equal(r.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('MENU ')).map(l=>l.slice(5).trim().split(/\s+/).map(n=>parseInt(n,16)));assert.ok(rows.length>100);assert.ok(rows.every(r=>r.length===8&&r.every(Number.isFinite)));
 const scenes=rows.map(r=>r[0]).filter((v,i,a)=>!i||v!==a[i-1]);assert.ok(scenes.join(',').includes('0,10,0,10,1'));
 const title=rows.filter(r=>r[0]===0&&r[4]===6);assert.ok(title.length);assert.ok(title.every(r=>r[3]===1));const playing=rows.filter(r=>r[0]===1);assert.ok(playing.length>50);assert.ok(playing.every(r=>r[1]===6&&r[2]===character&&r[5]===2));assert.equal(playing[0][6]+256*playing[0][7],0);
 results.push({mode,character,stage:7,cancelPreserved:true,wrapFromFirstToLast:true,startedAtZeroScore:true,log:path.join(dir,'debugmsg.txt'),screenshot:path.join(dir,'screen.bmp')});console.log(mode+' '+character+' passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),emulator:'BGB 1.6.6',results},null,2));
