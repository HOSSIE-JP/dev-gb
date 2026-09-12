import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {symbols} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),file=path.resolve(process.argv[2]??'.cache/kouma-v16/continue/fixture/projects/continue-test/build/Debug/continue-test.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v16/bgb'),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace,state=s._ce_state;
const signature=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(signature,s._ce_trace_write)+signature.length;assert.ok(published>s._ce_trace_write&&published<s._ce_sound);const hex=n=>n.toString(16),ref=n=>`%(${hex(n)})%`,results=[];
for(const resume of[false,true]){
 const dir=path.join(out,resume?'continue':'timeout');fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'bgb64.exe');fs.copyFileSync(path.join(root,'.tools/bgb/bgb64.exe'),exe);
 const intro=[Buffer.alloc(160),Buffer.alloc(20,1),Buffer.alloc(50),Buffer.alloc(220,1)];const demo=Buffer.concat([...intro,...(resume?[Buffer.alloc(400),Buffer.alloc(60,1),Buffer.alloc(20)]:[Buffer.alloc(1550)])]);fs.writeFileSync(path.join(dir,'input.dem'),demo);
 // BGB truncates long debug messages; keep all twelve fields within its limit.
 const addresses=[t+22,t+17,state+18,state+19,state+6,state+7,s._ce_bombs,s._ce_character,s._ce_save_generation,s._ce_scores,s._ce_scores+1,s._ce_is_cgb];
 const bp=`${hex(published)}///CONT ${addresses.map(ref).join(' ')}`;
 if(!process.argv.includes('--reuse')) fs.writeFileSync(path.join(dir,'debugmsg.txt'),'');
 if(!process.argv.includes('--reuse')){const r=spawnSync(exe,['-hf','-nobatt','-nowriteini','-ini',path.join(dir,'bgb.ini'),'-set','DebugMsgFile=1','-set','DebugMsgFileTS=0','-rom',file,'-demoplay',path.join(dir,'input.dem'),'-screenonexit',path.join(dir,'screen.bmp'),'-br',bp],{cwd:dir,windowsHide:true,timeout:120000});if(r.error)throw r.error;assert.equal(r.status,0);}
 const rows=fs.readFileSync(path.join(dir,'debugmsg.txt'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('CONT ')).map(l=>l.slice(5).trim().split(/\s+/).map(n=>parseInt(n,16))).filter(r=>r[0]===0&&r[11]===1);
 const death=rows.filter(r=>r[1]===14),menu=rows.filter(r=>r[1]===13),first=rows.findIndex(r=>r[1]===13);assert.ok(death.length>=59);assert.ok(menu.length>30);assert.ok(menu.every(r=>r[2]===1&&r[3]===0));const score=menu[0][4]+menu[0][5]*256;assert.ok(score>=222);assert.ok(menu.every(r=>r[9]+r[10]*256===score&&r[8]===1));
 if(resume){const restarted=rows.slice(first).filter(r=>r[1]===1);assert.ok(restarted.length>10);assert.ok(restarted.every(r=>r[2]===1&&r[3]===1&&r[4]===0&&r[5]===0&&r[6]===2&&r[7]===0));}
 else{assert.ok(menu.length>=599&&menu.length<=601,'600 VBlank offer');assert.ok(rows.slice(first).some(r=>r[1]===0));assert.ok(!rows.slice(first).some(r=>r[1]===1));}
 results.push({resume,cgb:true,deathSamples:death.length,menuSamples:menu.length,score,rankingBeforeReset:true,currentStageRestart:resume});
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),emulator:'BGB 1.6.6',fixture:true,results},null,2));console.log('BGB continue and timeout passed');
