// Unmodified production ROMs: use STAGE SELECT, clear the approach with A,
// skip the entrance dialogue using Start, then observe the boss without firing.
// node editor/tests/kouma-boss-performance.mjs BEFORE.gb AFTER.gb OUT [stage=6]
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,trace,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const [before,after,outArg,stageArg='6']=process.argv.slice(2),out=path.resolve(outArg),stage=Number(stageArg),results=[];
fs.mkdirSync(out,{recursive:true});
for(const [variant,file]of [['before',before],['after',after]]){
 const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),gb=boot(rom,GameBoyMode.Cgb);
 const byte=n=>memory(gb).ram[s[n]-0xc000];
 const until=f=>{for(let i=0;i<16000;i++){if(f())return;frames(gb,1);}throw Error('route timeout');};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,20);};
 try{
  until(()=>settledTrace(gb,s._ce_trace)?.scene===0);tap(PadKey.Down);
  for(let i=0;i<stage;i++)tap(PadKey.Right);
  assert.equal(byte('_ce_title_stage'),stage);tap(PadKey.A);tap(PadKey.A);
  until(()=>settledTrace(gb,s._ce_trace)?.scene===1);gb.key_press(PadKey.A);
  until(()=>byte('_ce_scene')===5);gb.key_lift(PadKey.A);frames(gb,120);tap(PadKey.Start);
  until(()=>byte('_ce_scene')===1&&byte('_ce_battle_mode')===2&&!byte('_ce_fade_level'));
  gb.step_to(s._ce_step);const start=trace(gb,s._ce_trace);assert.equal(start.scene,1);assert.ok(start.lives>0);
  const states=[],gaps=[];let peak=0,cutin=false;
  for(let i=0;i<600;i++){
   // All boss inputs are released; each call measures one completed update.
   const cycles=gb.clock()+gb.step_to(s._ce_step),t=trace(gb,s._ce_trace),m=memory(gb),r=m.ram;
   assert.ok(t&&t.scene===1&&!t.result&&t.lives>0,'boss observation must remain in live gameplay');
   assert.equal(t.tick,start.tick+i+1);const live=[];
   for(let j=0;j<40;j++)if(r.readUInt16LE(s._ce_bg_life-0xc000+j*2))live.push([j,...['x','y','vx','vy','life'].map(k=>r.readUInt16LE(s['_ce_bg_'+k]-0xc000+j*2))]);
   states.push({trace:t,bullets:live,oam:[...m.oam]});peak=Math.max(peak,live.length);
   const gap=cycles/(70224*gb.multiplier());if(gap>4)cutin=true;else if(i>=120)gaps.push(gap);
   if(i===300)capture(gb,path.join(out,variant+'.png'));
  }
  assert.ok(peak>=16&&cutin,`later boss bullets and entrance cut-in observed: peak=${peak}, cutin=${cutin}`);assert.equal(gaps.length,480);
  const mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  const result={variant,file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),mode:'CGB',stage,startTick:start.tick,range:[start.tick+121,start.tick+600],samples:gaps.length,peak,cutin,startLives:start.lives,endLives:states.at(-1).trace.lives,meanDisplayFrames:mean,updatesPerSecond:59.7275/mean,twoFrameUpdates:gaps.filter(x=>x>1.5).length,stateHash:crypto.createHash('sha256').update(JSON.stringify(states)).digest('hex')};
  fs.writeFileSync(path.join(out,variant+'-states.json'),JSON.stringify(states));results.push(result);console.log(JSON.stringify(result));
 }catch(e){capture(gb,path.join(out,variant+'-failure.png'));throw e;}finally{gb.free();}
}
assert.equal(results[0].stateHash,results[1].stateHash,'same stage, input and completed gameplay state');
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
