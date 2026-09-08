import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const root=path.resolve(import.meta.dirname,'../..');
function crc(bytes){let c=65535;for(const b of bytes){c^=b<<8;for(let i=0;i<8;i++)c=((c<<1)^((c&32768)?0x1021:0))&65535;}return c;}
test('battery SRAM: real ROM commits, reboot, interrupted writes, corruption and generation wrap on DMG/CGB',{timeout:240000},()=>{
 const temp=fs.mkdtempSync(path.join(root,'.cache/save-fixture-'));
 try{
  fs.mkdirSync(path.join(temp,'projects'));
  for(const folder of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,folder),path.join(temp,folder),{recursive:true});
  const g=lib.readGame(root,'nova-spear');g.mode='caravan';g.stageFade=false;g.stageOrder=[g.stages[0].id];g.startStage=g.stages[0].id;
  for(const s of g.stages){s.duration=5;s.height=32;s.tiles=s.tiles.slice(0,640);s.events=[];s.walls=s.walls.slice(0,640);s.walls.fill(0);s.requireBoss=false;s.clearOnBoss=false;}
  lib.createProject(temp,'save-fixture','SAVE QA',g);
  const r=lib.compile(temp,'save-fixture','Debug',()=>{}),rom=fs.readFileSync(r.romPath),syms=symbols(r.romPath.replace(/\.gb$/,'.map'));
  assert.equal(rom[0x147],0x1b);assert.equal(rom[0x149],2);
  const scores=gb=>Array.from({length:5},(_,i)=>memory(gb).ram.readUInt16LE(syms._ce_scores-0xc000+i*2));
  for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
   const load=(ram)=>{const gb=boot(rom,mode);if(ram)gb.set_ram_data(ram);frames(gb,240);return gb;};
   const restartCheck=(ram,expected)=>{const gb=load(ram);try{assert.deepEqual(scores(gb),expected);}finally{gb.free();}};
   const gb=load();let first,second;
   try{
    assert.deepEqual(scores(gb),[0,0,0,0,0]);
    for(let n=0;n<2;n++){
     gb.key_press(PadKey.Start);frames(gb,3);gb.key_lift(PadKey.Start);
     let done=false;let wrapped=false,previousCamera;
     for(let f=0;f<2000;f++){
      frames(gb,1);const t=settledTrace(gb,syms._ce_trace);
      if(t?.scene===1 && t.tick>1){
       const mem=memory(gb),camera=mem.ram.readUInt16LE(syms._ce_state-0xc000+4);
       assert.ok(mem.io[0x40]&0x80, 'scroll wrap never disables LCD');
       if(previousCamera!==undefined && camera>previousCamera+100)wrapped=true;
       previousCamera=camera;
      }
      if(t?.scene===3){done=true;break;}
     }
     assert.ok(wrapped,'fixture crosses the scrolling ring boundary');
     assert.ok(done);frames(gb,4);
     const bytes=Buffer.from(gb.ram_data_eager());assert.equal(bytes.length,8192);
     if(!n)first=bytes;else second=bytes;
     gb.key_press(PadKey.Start);frames(gb,3);gb.key_lift(PadKey.Start);frames(gb,5);
    }
   }finally{gb.free();}
   const one=[g.clearBonus,0,0,0,0],two=[g.clearBonus,g.clearBonus,0,0,0];
   restartCheck(first,one);restartCheck(second,two);
   for(let cut=0;cut<20;cut++){
    const torn=Buffer.from(first);torn[32]=0;
    for(let i=1;i<=cut;i++)torn[32+i]=second[32+i];
    restartCheck(torn,one);
   }
   const corrupt=Buffer.from(second);corrupt[40]^=1;restartCheck(corrupt,one);
   corrupt[8]^=1;restartCheck(corrupt,[0,0,0,0,0]);
   const wrapped=Buffer.from(second);wrapped.writeUInt16LE(65535,6);wrapped.writeUInt16LE(crc(wrapped.subarray(1,18)),18);
   wrapped.writeUInt16LE(0,38);wrapped.writeUInt16LE(crc(wrapped.subarray(33,50)),50);restartCheck(wrapped,two);
   const wrong=Buffer.from(first);wrong[2]^=1;wrong.writeUInt16LE(crc(wrong.subarray(1,18)),18);restartCheck(wrong,[0,0,0,0,0]);
  }
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
