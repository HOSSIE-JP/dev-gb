// Usage: node editor/tests/performance.mjs path/to/ROM.gb output.json
// Read-only ROM measurement: normal controls, actual PPU frames, no RAM edits.
import fs from 'node:fs';
import { boot, memory, symbols, GameBoyMode, PadKey } from './emulator.mjs';
const [romPath, output] = process.argv.slice(2);
const syms = symbols(romPath.replace(/\.gb$/, '.map'));
const results=[];
for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
 const gb=boot(fs.readFileSync(romPath), mode);
 const read=()=>{const {ram}=memory(gb);const p=syms._ce_trace-0xc000,s=syms._ce_state-0xc000;return {tick:ram.readUInt16LE(s),published:ram.readUInt16LE(p+2),scene:ram[p+17],lives:ram[p+7]};};
 try {
  for(let i=0;i<240;i++)gb.next_frame();
  gb.key_press(PadKey.Start);for(let i=0;i<10;i++)gb.next_frame();gb.key_lift(PadKey.Start);
  let t=read();for(let i=0;i<600&&t.scene!==1;i++){gb.next_frame();t=read();}
  if(t.scene!==1)throw Error('Stage failed to start');
  gb.key_press(PadKey.A);
  const bins=[{from:120,to:600},{from:600,to:1200},{from:1200,to:1800}].map(b=>({...b,frames:0,presentations:0,updates:0}));
  let previous=t;
  for(let n=0;n<20000&&previous.tick<1800;n++){
   gb.next_frame();const current=read();
   const bin=bins.find(b=>previous.tick>=b.from&&previous.tick<b.to);
   if(bin){bin.frames++;bin.updates+=current.tick-previous.tick;if(current.published!==previous.published)bin.presentations++;}
   if(current.scene!==1)throw Error('Gameplay ended before measurement completed');
   previous=current;
  }
  results.push({mode:mode===GameBoyMode.Dmg?'DMG':'CGB',rom:romPath,bins:bins.map(b=>({...b,updatesPerSecond:+(b.updates*59.7275/b.frames).toFixed(2),presentationsPerSecond:+(b.presentations*59.7275/b.frames).toFixed(2)}))});
 }finally{gb.free();}
}
fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
