// Real menu/joypad inputs, read-only RAM. The player moves above each boss;
// the new targeted counter must actually fire upward in the production ROM.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),results=[];fs.mkdirSync(out,{recursive:true});
for(const [mode,label]of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']])for(let stage=0;stage<7;stage++){
 const gb=boot(rom,mode),tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 const until=(f,max=5000)=>{for(let i=0;i<max;i++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('menu timeout');};
 try{
  until(t=>t.scene===0);for(let i=0;i<10;i++)tap(PadKey.B);if(stage){tap(PadKey.Down);for(let i=0;i<stage;i++)tap(PadKey.Right);}tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===7);until(t=>t.scene===1&&t.bossPhase===1);
  gb.key_press(PadKey.Up);until(t=>t.scene===1&&t.y<=12*16);gb.key_lift(PadKey.Up);
  let counter;
  for(let n=0;n<600&&!counter;n++){
   const t=settledTrace(gb,s._ce_trace),r=memory(gb).ram;
   if(t?.scene===1&&t.y<=16*16)for(let i=0;i<64;i++){
    const life=r.readUInt16LE(s._ce_bg_life-0xc000+i*2),vy=r.readInt16LE(s._ce_bg_vy-0xc000+i*2);
    if(life&&vy<0){counter={system:label,stage:stage+1,tick:t.tick,playerY:t.y/16,vy};break;}
   }
   if(!counter)frames(gb,1);
  }
  assert(counter,`${label} stage ${stage+1}: above-boss counter`);results.push(counter);console.log(counter);
  capture(gb,path.join(out,`${label}-${stage+1}-top.png`));
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
