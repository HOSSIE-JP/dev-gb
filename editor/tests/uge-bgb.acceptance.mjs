// BGB official headless demo/breakpoint interfaces; unchanged production ROM.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
import {symbols} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),g=lib.readGame(root,'touhou-kouma');
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace,results=[];fs.mkdirSync(out,{recursive:true});
const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),found=rom.indexOf(sig,s._ce_trace_write),published=found+sig.length;assert(found>=s._ce_trace_write&&found<s._ce_trace_write+40);
const exe=path.join(out,'bgb64.exe');fs.copyFileSync(path.join(root,'.tools/bgb/bgb64.exe'),exe);
const hex=n=>n.toString(16),fields=[s._ce_scene,s._ce_music_track,s._ce_music_three,s._ce_pause,s._ce_music_row,s._ce_music_row+1,s._ce_spell_sound_left,0xff12,0xff17,0xff1c,0xff21];
const base=['-hf','-nobatt','-nowriteini','-ini',path.join(out,'bgb.ini'),'-set','SystemMode=1','-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file];
const run=args=>{const r=spawnSync(exe,[...base,...args],{cwd:out,windowsHide:true,timeout:120000});assert(!r.error,r.error?.message);assert.equal(r.status,0);};
const state=path.join(out,'title.sna');run(['-br',`${hex(published)}/($${hex(s._ce_scene)})=0`,'-stateonexit',state]);
for(let stage=0;stage<7;stage++)for(const boss of [false,true]){
 const input=[];const idle=n=>{for(let i=0;i<n;i++)input.push(0)},tap=(key,n=24)=>{for(let i=0;i<4;i++)input.push(key);idle(n)};idle(30);
 if(boss)for(let i=0;i<10;i++)tap(2,16);tap(128);for(let i=0;i<stage;i++)tap(16);tap(1,90);tap(16);tap(1,800);
 tap(8,120);tap(8,60);tap(3,90);tap(8,90);tap(8,180);
 const name=`stage${stage+1}-${boss?'boss':'road'}`,movie=path.join(out,name+'.dem');fs.writeFileSync(movie,Buffer.from(input));
 run(['-state',state,'-demoplay',movie,'-screenonexit',path.join(out,name+'.bmp'),'-br',`${hex(published)}///MUSIC ${fields.map(a=>`%($${hex(a)})%`).join(' ')}`]);
 const rows=fs.readFileSync(path.join(out,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('MUSIC ')).map(l=>l.slice(6).trim().split(/\s+/).map(n=>parseInt(n,16)));
 fs.copyFileSync(path.join(out,'debugmsg.txt'),path.join(out,name+'.log'));
 const track=g.stages.find(v=>v.id===g.stageOrder[stage])[boss?'bossMusic':'music'];
 assert(rows.some(r=>r[0]===1&&r[1]===track&&r[2]===2),name+' selects expected UGE music');
 const paused=rows.filter(r=>r[0]===1&&r[1]===track&&r[3]===1);
 assert(paused.length>20,name+' pause reached');
 assert(paused.every(r=>r[7]===0&&r[8]===0&&(r[9]&0x60)===0&&r[10]===0),name+' pause silences four channels');
 results.push({stage:stage+1,route:boss?'boss':'road',track,pauseSamples:paused.length,passed:true});console.log(name,'BGB passed');
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({kind:'unmodified production ROM in BGB',sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
}
