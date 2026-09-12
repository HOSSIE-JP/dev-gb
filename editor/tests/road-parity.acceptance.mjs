// Before/after engine comparison at the same logical updates and controller input.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const [before,after,out]=process.argv.slice(2),results=[];
function* snapshots(file,fire){const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),t=s._ce_trace,sig=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(sig,s._ce_trace_write)+sig.length,gb=boot(rom,GameBoyMode.Cgb);
 try{const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};frames(gb,240);tap(PadKey.Start);frames(gb,50);tap(PadKey.A);if(fire)gb.key_press(PadKey.B);
  for(let n=0;n<6000;n++){gb.step_to(published);const m=memory(gb),tr=m.ram.subarray(t-0xc000,t-0xc000+24),stage=tr[4],tick=tr.readUInt16LE(18);if(stage>=2)return;if(tr[17]===1&&(stage||tick>=16)){
    const parts=[tr,m.ram.subarray(s._ce_state-0xc000,s._ce_state-0xc000+24),m.ram.subarray(s._ce_entities-0xc000,s._ce_entities-0xc000+39*25),m.oam];
    for(const name of ['_ce_shot_x','_ce_shot_y','_ce_shot_vx','_ce_shot_vy','_ce_shot_age'])parts.push(m.ram.subarray(s[name]-0xc000,s[name]-0xc000+39*2));
    yield {stage,tick,sha256:crypto.createHash('sha256').update(Buffer.concat(parts)).digest('hex')};
  }gb.clock();}throw Error('road parity route did not end');
 }finally{gb.free();}}
for(const fire of [false,true]){const a=snapshots(before,fire),b=snapshots(after,fire);let checked=0;try{for(;;){const x=a.next(),y=b.next();assert.equal(x.done,y.done);if(x.done)break;assert.deepEqual(y.value,x.value,`state/OAM parity at ${x.value.stage}:${x.value.tick}`);checked++;}}finally{a.return();b.return();}assert.ok(checked>4700);results.push({fire,mode:'CGB',updates:checked,stages:2,stateAndOamIdentical:true});}
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify({before,after,results},null,2));console.log(results);
