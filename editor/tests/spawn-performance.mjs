// Read-only frame-gap sampling, with lifecycle labels from deterministic logic.
// Usage: node editor/tests/spawn-performance.mjs ROM.gb game.json results.json
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {boot,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const {Simulation}=createRequire(import.meta.url)('../build/library.cjs');
const [romPath,gamePath,output]=process.argv.slice(2), game=JSON.parse(fs.readFileSync(gamePath));
const syms=symbols(romPath.replace(/\.gb$/,'.map')), results=[];
const stats=a=>{a.sort((x,y)=>x-y);return {samples:a.length,mean:+(a.reduce((s,x)=>s+x,0)/a.length).toFixed(3),p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
 const gb=boot(fs.readFileSync(romPath),mode), sim=new Simulation(game), groups={plain:[],create:[],destroy:[],both:[]};
 try{
  for(let n=0;n<240;n++)gb.next_frame();gb.key_press(PadKey.Start);for(let n=0;n<10;n++)gb.next_frame();gb.key_lift(PadKey.Start);
  for(let n=0;n<300;n++){gb.next_frame();if(memory(gb).ram[syms._ce_trace-0xc000+17]===1)break;}
  gb.key_press(PadKey.A);let previous=memory(gb).ram.readUInt16LE(syms._ce_trace-0xc000+2),lastFrame=0,count=0,excluded=0;
  while(sim.tick<previous)sim.step(0);
  for(let frame=0;frame<20000&&previous<1800;frame++){
   gb.next_frame();const m=memory(gb).ram,p=syms._ce_trace-0xc000,t=m.readUInt16LE(p+2);
   if(t<=previous||t>previous+4)continue;
   let born=false,dead=false;
   while(sim.tick<t){const prior=new Map(sim.entities.map(e=>[e.slot,{kind:e.kind,ref:e.ref,age:e.age}]));sim.step(16);
    for(const e of sim.entities){const old=prior.get(e.slot);if(!old||e.kind!==old.kind||e.ref!==old.ref||e.age<old.age)born=true;}
    for(const [slot,old] of prior){const e=sim.entities.find(e=>e.slot===slot);if(!e||e.kind!==old.kind||e.ref!==old.ref||e.age<old.age)dead=true;}
   }
   if(previous>=120){if(t===previous+1){groups[born?(dead?'both':'create'):(dead?'destroy':'plain')].push(frame-lastFrame);count++;}else excluded++;}
   previous=t;lastFrame=frame;
  }
  results.push({mode:mode===GameBoyMode.Dmg?'DMG':'CGB',oneTickSamples:count,excludedMultiTickSamples:excluded,displayFrameGaps:Object.fromEntries(Object.entries(groups).map(([k,a])=>[k,stats(a)]))});
 }finally{gb.free();}
}
fs.writeFileSync(output,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
