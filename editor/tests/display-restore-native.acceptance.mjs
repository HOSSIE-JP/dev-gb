import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {symbols} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),s=symbols(file.replace(/\.gb$/,'.map')),rom=fs.readFileSync(file),t=s._ce_trace;
// Random stages have different DMG road durations. Leave room for the third
// logo after two completed ranking screens, rather than stopping in ranking 2.
const frameCount=Number(process.argv[4]??30000);
assert.ok(Number.isInteger(frameCount)&&frameCount>=22000&&frameCount<=120000);
fs.mkdirSync(out,{recursive:true});
const sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),found=rom.indexOf(sig,s._ce_trace_write),published=found+sig.length;
assert.ok(found>=s._ce_trace_write&&published<s._ce_sound);
const hex=n=>n.toString(16),addresses=[t+17,t+4,s._ce_demo,0xff40,s._ce_battle_mode],bp=`${hex(published)}///DEMO ${addresses.map(n=>`%(${hex(n)})%`).join(' ')}`,results=[];
for(const mode of ['DMG','CGB']) {
 const dir=fs.mkdtempSync(path.join(out,mode+'-')),exe=path.join(dir,'bgb64.exe');fs.copyFileSync('.tools/bgb/bgb64.exe',exe);
 fs.writeFileSync(path.join(dir,'input.dem'),Buffer.alloc(frameCount));
 const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set',`SystemMode=${mode==='DMG'?0:1}`,'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:Math.max(360000,frameCount*20)});
 if(r.error)throw r.error;assert.equal(r.status,0);
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(x=>x.startsWith('DEMO ')).map(x=>x.slice(5).trim().split(/\s+/).map(x=>parseInt(x,16)));
 const scenes=[];let last=-1;for(const row of rows){if(row[0]===1)assert.equal(row[3]&0x50,0x40,'gameplay LCDC mode');if(row[0]!==last){scenes.push(row.slice(0,3));last=row[0];}}
 assert.ok(scenes.filter(r=>r[0]===4).length>=2,'two rankings');assert.ok(scenes.filter(r=>r[0]===12).length>=3,'logo returns');assert.ok(scenes.filter(r=>r[0]===7&&r[2]).length>=2,'demo cutins');
 assert.ok(rows.some(r=>r[0]===1&&r[4]===2),'native BG boss battle');
 assert.ok(scenes.filter(r=>r[0]===15).length>=2,'movie replayed on next exhibition cycle');
 results.push({mode,scenes,displayModeRestored:true,gameplaySamples:rows.filter(r=>r[0]===1).length,bossSamples:rows.filter(r=>r[0]===1&&r[4]===2).length});console.log(mode+' native exhibition passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),frameCount,results},null,2));

