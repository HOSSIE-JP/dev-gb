import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace;
fs.mkdirSync(out,{recursive:true});const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),found=rom.indexOf(sig,s._ce_trace_write);assert.ok(found>=s._ce_trace_write&&found<s._ce_sound);
const addresses=[s._ce_scene,s._ce_is_cgb,0xff4d,0xff40],bp=`${(found+sig.length).toString(16)}///RESET ${addresses.map(n=>`%(${n.toString(16)})%`).join(' ')}`,results=[];
for(const mode of ['DMG','CGB']){
 const dir=fs.mkdtempSync(path.join(out,mode+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 const input=Buffer.alloc(1700);for(const start of [160,320,440])input.fill(1,start,start+8);input.fill(15,800,812);fs.writeFileSync(path.join(dir,'input.dem'),input);
 const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-br',bp,'-screenonexit',path.join(dir,'screen.bmp')],{cwd:dir,windowsHide:true,timeout:90000});if(r.error)throw r.error;assert.equal(r.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(x=>x.startsWith('RESET ')).map(x=>x.slice(6).trim().split(/\s+/).map(x=>parseInt(x,16))),play=rows.findIndex(r=>r[0]===1),reboot=rows.findIndex((r,i)=>i>play&&r[0]===12);
 assert.ok(play>=0&&reboot>play,'gameplay followed by fresh logos');assert.ok(rows.slice(reboot).some(r=>r[0]===0),'returns to title');assert.ok(rows.slice(reboot).every(r=>r[1]===(mode==='CGB'?1:0)),'hardware mode retained');if(mode==='CGB')assert.ok(rows.slice(reboot).every(r=>r[2]&128),'double speed restored');
 results.push({mode,gameplay:true,rebootLogos:true,title:true,hardwareModePreserved:true});console.log(mode,'native reset passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
