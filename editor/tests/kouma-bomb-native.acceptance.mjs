// BGB: identical real controller movie, production ROM and read-only trace.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),map=fs.readFileSync(file.replace(/\.gb$/,'.map'),'utf8'),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace,clock=parseInt(map.match(/\b([\da-fA-F]{8})\s+_sys_time\b/)[1],16),hex=n=>n.toString(16),results=[];
fs.mkdirSync(out,{recursive:true});const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(sig,s._ce_trace_write)+sig.length;assert(published>s._ce_trace_write&&published<s._ce_trace_write+32);
for(const mode of ['CGB','DMG'])for(const character of [0,1]){
 const dir=fs.mkdtempSync(path.join(out,mode+'-'+character+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 const input=Buffer.alloc(1950);input.fill(8,240,300);input.fill(1,860,864);if(character)input.fill(16,920,924);input.fill(1,980,984);input.fill(2,1330,1370);input.fill(3,1500,1506);input.fill(1,1506);fs.writeFileSync(path.join(dir,'input.dem'),input);
 const fields=[t+17,t+2,t+3,clock,clock+1,s._ce_bomb_left,s._ce_bomb_image,s._ce_character,0xff40,0xff44],bp=`${hex(published)}///BOMB ${fields.map(a=>`%(${hex(a)})%`).join(' ')}`;
 const run=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:120000});if(run.error)throw run.error;assert.equal(run.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('BOMB ')).map(l=>l.slice(5).trim().split(/\s+/).map(n=>parseInt(n,16))).map(a=>({scene:a[0],tick:a[1]+a[2]*256,frame:a[3]+a[4]*256,left:a[5],image:a[6],character:a[7],lcdc:a[8],ly:a[9]}));
 const samples=[];for(let i=1;i<rows.length;i++){const a=rows[i-1],b=rows[i];if(a.scene===1&&b.scene===1&&a.left&&b.left&&b.tick===a.tick+1)samples.push({...b,gap:(b.frame-a.frame)&65535});}
 assert(samples.length>=40);assert(samples.every(r=>r.character===character));const phases=new Set(samples.map(r=>r.lcdc&24));if(samples.some(r=>r.image===2))assert.deepEqual([...phases].sort((a,b)=>a-b),[0,24]);
 const begin=rows.findIndex(r=>r.left>0),end=rows.findIndex((r,i)=>i>begin&&!r.left);assert(begin>0&&end>begin);
 results.push({mode,character,updates:samples.length,updatesPerSecond:samples.length*59.7275/samples.reduce((n,r)=>n+r.gap,0),startDisplayFrames:(rows[begin].frame-rows[begin-1].frame)&65535,endDisplayFrames:(rows[end].frame-rows[end-1].frame)&65535,phases:[...phases],inputSha256:crypto.createHash('sha256').update(input).digest('hex')});console.log(results.at(-1));
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
}
