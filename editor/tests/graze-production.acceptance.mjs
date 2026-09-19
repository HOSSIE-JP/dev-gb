// Real boss-select gameplay and joypad input, no ROM/RAM patches.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,settledTrace,supportedModes,PadKey} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),results=[];
fs.mkdirSync(out,{recursive:true});
for(const [mode,label]of supportedModes(rom)){
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000];
 const until=(f,max=6000)=>{for(let i=0;i<max;i++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('menu timeout');};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 try{
  until(t=>t.scene===0);for(let i=0;i<10;i++)tap(PadKey.B);tap(PadKey.Down);for(let i=0;i<6;i++)tap(PadKey.Right);
  tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===7);until(t=>t.scene===1&&t.bossPhase===1);
  // Observe noise only; the ROM still plays its unchanged BGM and shot sounds.
  gb.set_audio_ch1_enabled(false);gb.set_audio_ch2_enabled(false);gb.set_audio_ch3_enabled(false);gb.audio_buffer_eager(true);
  gb.key_press(PadKey.A);const events=[];let active=false,total=0;
  for(let frame=0;frame<3000;frame++){
   if(frame%120===0){gb.key_lift(PadKey.Left);gb.key_lift(PadKey.Right);gb.key_press((frame/120)%2?PadKey.Right:PadKey.Left);}
   frames(gb,1);const t=settledTrace(gb,s._ce_trace),m=memory(gb),a=gb.audio_buffer_eager(true);
   const graze=m.io[0x22]===0x18&&!!(m.io[0x26]&8);
   if(graze){const energy=a.reduce((sum,n)=>sum+n*n,0);total+=energy;if(!active)events.push({frame,energy,flash:byte('_ce_graze_flash'),score:t?.score,shotVolume:m.io[0x12],noiseVolume:m.io[0x21]});}
   active=graze;
   if(events.length>=3&&total>0)break;
   if(t?.lives===0||t?.result)break;
  }
  assert(events.length>=1,'actual fresh near miss triggers the CH4 graze sound');assert(total>0,'real gameplay graze has nonzero isolated PCM');
  assert(events.some(e=>e.flash>0),'graze visual feedback remains active');
  assert.equal(events[0].score,rom[s._ce_graze_score],'first isolated production graze awards the configured points');
  const result={mode:label,stage:7,character:'Marisa',normalInput:true,events,isolatedGrazePcmEnergy:total};results.push(result);console.log(result);
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
