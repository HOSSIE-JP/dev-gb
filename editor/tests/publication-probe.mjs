import fs from 'node:fs';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
for(const romPath of process.argv.slice(2)){
 const syms=symbols(romPath.replace(/\.gb$/,'.map'));
 for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
  const gb=boot(fs.readFileSync(romPath),mode);let samples=0,mismatches=0,last=0;
  try{
   frames(gb,240);gb.key_press(PadKey.A);gb.key_press(PadKey.Start);frames(gb,5);gb.key_lift(PadKey.Start);
   for(let f=0;f<5000&&last<1200;f++){
    frames(gb,1);const t=settledTrace(gb,syms._ce_trace);if(!t||t.scene!==1||t.tick===last)continue;last=t.tick;
    if(last<120)continue;const m=memory(gb),s=syms._shadow_OAM-0xc000;samples++;
    if(!m.oam.equals(m.ram.subarray(s,s+160)))mismatches++;
   }
   console.log({romPath,mode:mode===GameBoyMode.Dmg?'DMG':'CGB',samples,mismatches});
  }finally{gb.free();}
 }
}
