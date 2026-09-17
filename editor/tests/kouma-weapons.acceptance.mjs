// Production ROM replay: read-only state inspection, no debug RAM writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,entityState,GameBoyMode,PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const l=createRequire(import.meta.url)('../build/library.cjs'),g=l.readGame(process.cwd(),'touhou-kouma'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];
fs.mkdirSync(out,{recursive:true});
for(const mode of (rom[0x143]===0xC0?[GameBoyMode.Cgb]:[GameBoyMode.Dmg,GameBoyMode.Cgb]))for(const character of [0,1])for(const stage of [0,2,6]){
 const label=`${mode===GameBoyMode.Dmg?'DMG':'CGB'}-${character}-stage${stage+1}`,gb=boot(rom,mode),capacity=(syms._ce_state-syms._ce_entities)/25;
 const read=()=>settledTrace(gb,syms._ce_trace),until=(f,n=2400)=>{for(let i=0;i<n;i++){const t=read();if(t&&f(t))return t;frames(gb,1);}throw Error(label+' timeout');};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 try{
  until(t=>t.scene===0);tap(PadKey.Down);for(let i=0;i<stage;i++)tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===10);if(character)tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===1);
  // Move before holding fire, then keep the target fixed while enemy shots arrive.
  gb.key_press(character?PadKey.Right:PadKey.Left);const moveStart=read().tick;until(t=>t.tick>=moveStart+12);gb.key_lift(character?PadKey.Right:PadKey.Left);
  gb.key_press(PadKey.A);const start=read().tick,births=new Set(),aims=[],seen=new Set(),previousActors=new Map();let peak=0,last=-1,dropped=0,pausedSamples=0;
  while(true){frames(gb,1);const t=read();if(!t||t.scene!==1||t.tick===last)continue;last=t.tick;if(t.tick>start+600)break;
   if(t.tick>=start+56)gb.key_lift(PadKey.A);
   const es=entityState(gb,syms,g,capacity),ps=es.filter(e=>e.kind==='pshot');peak=Math.max(peak,ps.length);dropped=t.dropped;
   const ram=memory(gb).ram;
   for(const e of es.filter(e=>e.kind==='enemy')){
    const actor=g.enemies[ram[syms._ce_entities-0xc000+e.slot*25+1]];
    const key=`${e.slot}:${t.tick-e.age}`,prior=previousActors.get(key);
    if(actor.id.startsWith('fairy-')&&actor.motion.kind==='path'&&e.age>34&&e.age<64&&prior){assert.equal(e.x,prior.x,label+' paused x');assert.equal(e.y,prior.y,label+' paused y');pausedSamples++;}
    previousActors.set(key,e);
   }
   if(t.tick<start+56)for(const b of ps)births.add(t.tick-b.age);
   if(t.tick>=start+32&&t.tick<=start+35)capture(gb,path.join(out,label+'-shots.png'));
   for(const b of es.filter(e=>e.kind==='eshot'&&e.age<=2&&['shot-orb','shot-diamond'].includes(e.asset))){
    const key=`${b.slot}:${t.tick-b.age}`;if(seen.has(key))continue;seen.add(key);
    const x=b.x-b.vx*b.age,y=b.y-b.vy*b.age,dx=t.x-x,dy=t.y-y;
    const dot=b.vx*dx+b.vy*dy,cos=dot/Math.hypot(b.vx,b.vy)/Math.hypot(dx,dy);
    assert.ok(cos>.95,label+' aimed cosine '+cos);assert.ok(b.vy>0,label+' lower-screen target');aims.push({tick:t.tick,vx:b.vx,vy:b.vy,cos});
   }
  }
  const orderedBirths=[...births].sort((a,b)=>a-b),intervals=orderedBirths.slice(1).map((v,i)=>v-orderedBirths[i]);
  assert.ok(births.size>=(character?12:3),label+' cadence '+births.size);assert.ok(intervals.every(n=>n===(character?4:12)),label+' intervals '+intervals);
  assert.ok(aims.length>=3,label+' aimed shots missing');if(stage!==6)assert.ok(pausedSamples>10,label+' stop-and-fire samples');assert.ok(peak<=6);assert.equal(dropped,0,label+' admission drops');
  capture(gb,path.join(out,label+'-aimed.png'));results.push({label,volleys:births.size,intervals,peakPlayerShots:peak,aims,pausedSamples,dropped});console.log(label+' passed');
 }finally{gb.free();}
}
const upperTarget=[];
for(const mode of (rom[0x143]===0xC0?[GameBoyMode.Cgb]:[GameBoyMode.Dmg,GameBoyMode.Cgb])){
 const gb=boot(rom,mode),read=()=>settledTrace(gb,syms._ce_trace),until=f=>{for(let i=0;i<2400;i++){const t=read();if(t&&f(t))return t;frames(gb,1);}throw Error('upper target timeout');},tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 try{
  until(t=>t.scene===0);tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.A);until(t=>t.scene===1);gb.key_press(PadKey.Up);until(t=>t.y<=20*16);gb.key_lift(PadKey.Up);
  let horizontal=0;for(let i=0;i<600;i++){frames(gb,1);const t=read();if(!t||t.scene!==1)continue;for(const b of entityState(gb,syms,g,(syms._ce_state-syms._ce_entities)/25).filter(e=>e.kind==='eshot'&&e.age<=2&&e.asset==='shot-orb')){assert.ok(b.vy>=0);if(b.y>t.y&&b.vy===0&&b.vx!==0)horizontal++;}if(horizontal>=3)break;}
  assert.ok(horizontal>=3,'aiming above shooter stays on horizontal boundary');upperTarget.push({mode:mode===GameBoyMode.Dmg?'DMG':'CGB',horizontal});
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results,upperTarget},null,2));
