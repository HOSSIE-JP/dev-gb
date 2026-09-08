// Sampling profiler for a disposable ROM instrumented with ce_profile_phase.
// The instrumented ROM is never shipped. IDs: idle/player/events/entities/
// collisions/sprites/map/HUD/trace/audio. Cycle sampling includes interrupts.
import fs from 'node:fs';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const [romPath,out]=process.argv.slice(2), syms=symbols(romPath.replace(/\.gb$/,'.map'));
if(!syms._ce_profile_phase)throw Error('Requires an instrumented diagnostic ROM');
const results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
 const gb=boot(fs.readFileSync(romPath),mode),counts=Array(10).fill(0);
 try{
  frames(gb,240);gb.key_press(PadKey.Start);frames(gb,10);gb.key_lift(PadKey.Start);gb.key_press(PadKey.A);
  for(let i=0;i<100000;i++){
   gb.clocks_cycles(4096);const ram=memory(gb).ram,tick=ram.readUInt16LE(syms._ce_trace-0xc000+2);
   if(tick>=720)break;if(tick<120)continue;
   counts[ram[syms._ce_profile_phase-0xc000]]++;
  }
  const total=counts.reduce((a,b)=>a+b,0);
  results.push({mode:mode===GameBoyMode.Dmg?'DMG':'CGB',samples:total,percent:counts.map(n=>+(100*n/total).toFixed(2))});
 }finally{gb.free();}
}
fs.writeFileSync(out,JSON.stringify(results,null,2)+'\n');console.log(results);
