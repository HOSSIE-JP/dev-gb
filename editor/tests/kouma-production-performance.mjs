// Production ROM, ordinary menu/joypad input only. No RAM/ROM patches.
// node editor/tests/kouma-production-performance.mjs ROM OUT [CGB|DMG|both] [road|boss|both] [character=0] [stage=0] [updates=1200]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const [file,out,modeFilter='both',routeFilter='both',character='0',stage='0',updates='1200']=process.argv.slice(2);
const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map'));
fs.mkdirSync(out,{recursive:true});
const report={rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),character:+character,stage:+stage,method:'Unmodified ROM, fixed fire input per game update; transitions reported separately, CPU T-cycles inclusive of interrupts',results:[]};
for(const [mode,label] of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']])for(const route of ['road','boss']){
 if(!['both',label].includes(modeFilter)||!['both',route].includes(routeFilter))continue;
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000];
 const until=(f,max=12000)=>{for(let i=0;i<max;i++){if(f())return;frames(gb,1);}throw Error('menu timeout '+byte('_ce_scene'));};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 function returnedCost(){const m=memory(gb),r=gb.registers(),sp=r.sp,ret=m.ram.readUInt16LE(sp-0xc000);r.free();let cost=0;
  for(let i=0;i<200;i++){cost+=gb.clock()+gb.step_to(ret);const r=gb.registers(),done=r.sp===sp+2;r.free();if(done)return cost;}throw Error('return not reached');}
 try{
  until(()=>{const m=memory(gb).ram,p=s._ce_trace-0xc000;return byte('_ce_scene')===0&&!m[p+22]&&m.toString('ascii',p,p+2)==='CE';});
  if(route==='boss')for(let i=0;i<10;i++)tap(PadKey.B);
  if(+stage){tap(PadKey.Down);for(let i=0;i<+stage;i++)tap(PadKey.Right);}
  tap(PadKey.A);until(()=>byte('_ce_scene')===10&&!byte('_ce_fade_level')&&!memory(gb).ram[s._ce_trace-0xc000+22]);if(+character)tap(PadKey.Right);tap(PadKey.A);
  if(route==='boss')until(()=>byte('_ce_scene')===7);
  until(()=>byte('_ce_scene')===1&&!byte('_ce_fade_level'));
  gb.step_to(s._ce_step);gb.key_press(PadKey.A);
  const rows=[];let transitions=0,peak=0;
  for(let n=0;n<+updates;n++){
   const before=memory(gb).ram,tick=before.readUInt16LE(s._ce_state-0xc000),entities=before[s._ce_used-0xc000],bullets=before[s._ce_bg_count-0xc000];
   // Timings end at the next step entry: includes render, OAM publication, audio and trace.
   const cpu=returnedCost();
   const after=memory(gb).ram;if(after[s._ce_scene-0xc000]!==1||after[s._ce_state-0xc000+20])break;
   const elapsed=cpu+gb.clock()+gb.step_to(s._ce_step);
   const m=memory(gb),lives=m.ram[s._ce_state-0xc000+19];
   if(elapsed>70224*gb.multiplier()*12){transitions++;continue;}
   rows.push({tick,cpu,elapsed,entities,bullets,lives});peak=Math.max(peak,bullets);
  }
  assert(rows.length>200,'enough production gameplay samples');
  const windows=[];for(let i=0;i<rows.length;i+=120){const a=rows.slice(i,i+120);windows.push({tick:a[0].tick,updates:a.length,updatesPerSecond:a.length*4194304*gb.multiplier()/a.reduce((n,r)=>n+r.elapsed,0),cpu:a.reduce((n,r)=>n+r.cpu,0)/a.length});}
  const a=rows.filter(r=>route==='boss'||r.tick>=120),data={mode:label,route,updates:a.length,peak,transitions,updatesPerSecond:a.length*4194304*gb.multiplier()/a.reduce((n,r)=>n+r.elapsed,0),cpuMean:a.reduce((n,r)=>n+r.cpu,0)/a.length,windows};
  report.results.push(data);fs.writeFileSync(path.join(out,label+'-'+route+'-ticks.json'),JSON.stringify(rows));console.log(JSON.stringify(data));
 }finally{gb.free();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
}
