import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),s=symbols(file.replace(/\.gb$/,'.map')),rom=fs.readFileSync(file),t=s._ce_trace;fs.mkdirSync(out,{recursive:true});
const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(sig,s._ce_trace_write)+sig.length;
assert(published>s._ce_trace_write&&published<s._ce_sound);
const fields=[t+17,t+4,s._ce_boss_mode,s._ce_character,s._ce_bomb_left,s._ce_spell_sound_left,0xff12,0xff21,t+20],hex=n=>n.toString(16),results=[];
for(const mode of ['DMG','CGB']){
 const dir=fs.mkdtempSync(path.join(out,mode+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 const input=Buffer.alloc(3600);input.fill(8,240,300);
 for(let i=0;i<10;i++)input.fill(2,600+i*16,604+i*16);
 input.fill(128,800,804);input.fill(32,824,828); // Down, Left: last boss.
 input.fill(1,860,864);input.fill(16,920,924);input.fill(1,980,984); // Select Marisa.
 input.fill(1,1300);for(let f=1400;f<3300;f+=200){input.fill(0,f,f+12);input.fill(3,f+12,f+24);}
 fs.writeFileSync(path.join(dir,'input.dem'),input);
 const run=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',`${hex(published)}///BOSS ${fields.map(a=>`%(${hex(a)})%`).join(' ')}`],{cwd:dir,windowsHide:true,timeout:180000});
 if(run.error)throw run.error;assert.equal(run.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('BOSS ')).map(l=>l.slice(5).trim().split(/\s+/).map(n=>parseInt(n,16)));
 assert(rows.some(r=>r[0]===0&&r[2]===1),'hidden title toggle');assert(rows.some(r=>r[0]===1&&r[1]===6&&r[2]===1&&r[3]===1),'last boss, Marisa');assert(rows.some(r=>r[0]===7&&r[2]===1),'cut-in');
 const beam=rows.filter(r=>r[0]===1&&r[4]>4&&r[4]<40);assert(beam.length>5,'live beam samples');for(const r of beam){assert(r[5]>0);assert.equal(r[6],0xa0);assert.equal(r[7],0xc0);}
 results.push({mode,samples:rows.length,beamSamples:beam.length,titleToggle:true,lastBoss:true,marisa:true,cutin:true});console.log(results.at(-1));
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,results},null,2));
