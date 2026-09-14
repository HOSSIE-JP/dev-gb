// Compare authored v19/v20 gameplay under identical input, not identical enemy survival.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,trace,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
const [before,after,out]=process.argv.slice(2),results=[];
for(const file of [before,after])for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1]){
 const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),gb=boot(rom,mode),until=f=>{for(let i=0;i<2400;i++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return;frames(gb,1);}throw Error('timeout');},tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,20);};
 try{
  until(t=>t.scene===0);tap(PadKey.A);until(t=>t.scene===10);if(character)tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===1);gb.key_press(PadKey.A);gb.step_to(s._ce_step);
  let prev=0,lastFrame=0,peakOam=0,peakScanline=0,last;const gaps=[];
  for(let i=0;i<1500;i++){
   gb.clock();gb.step_to(s._ce_step);const t=trace(gb,s._ce_trace);assert.ok(t&&t.scene===1);const frame=gb.ppu_frame();
   if(prev>=120){assert.equal(t.tick,prev+1);gaps.push(frame-lastFrame);}
   const {oam}=memory(gb),lines=Array(144).fill(0);let used=0;
   for(let i=0;i<40;i++){const y=oam[i*4]-16;if(y<=-8||y>=144)continue;used++;for(let row=Math.max(0,y);row<Math.min(144,y+8);row++)lines[row]++;}
   peakOam=Math.max(peakOam,used);peakScanline=Math.max(peakScanline,...lines);prev=t.tick;lastFrame=frame;last=t;if(t.tick===1000)break;
  }
  assert.equal(last.tick,1000);assert.equal(gaps.length,880);const mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  results.push({file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),mode:mode===GameBoyMode.Dmg?'DMG':'CGB',character,range:[120,1000],ppuFrames:gaps.reduce((a,b)=>a+b,0),updates:880,updatesPerSecond:59.7275/mean,maxGap:Math.max(...gaps),peakOam,peakScanline,dropped:last.dropped,lives:last.lives});console.log(results.at(-1));
 }finally{gb.free();}
}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(results,null,2));
