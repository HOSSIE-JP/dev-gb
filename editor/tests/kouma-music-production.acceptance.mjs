// Unmodified production ROM, real stage/boss select inputs and read-only BESS.
// Emulator mixer isolation verifies music and Marisa's beam-bomb separately.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),results=[];
fs.mkdirSync(out,{recursive:true});
const tracks=[[32,33],[30,31],[17,18],[19,20],[21,22],[23,24],[25,26]];
for(const [mode,label]of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']])for(let stage=0;stage<7;stage++)for(const boss of [false,true]){
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000],row=()=>memory(gb).ram.readUInt16LE(s._ce_music_row-0xc000);
 const until=(f,max=6000)=>{for(let i=0;i<max;i++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('menu timeout');};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 const energy=()=>{const a=gb.audio_buffer_eager(true);return a.reduce((sum,n)=>sum+n*n,0);};
 try{
  until(t=>t.scene===0);if(boss)for(let i=0;i<10;i++)tap(PadKey.B);
  tap(PadKey.Down);for(let i=0;i<stage;i++)tap(PadKey.Right);
  tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.Right);tap(PadKey.A);
  if(boss){until(t=>t.scene===7);until(t=>t.scene===1&&t.bossPhase===1&&!byte('_ce_boss_invulnerable'));}
  else until(t=>t.scene===1&&t.tick>20);
  assert.equal(byte('_ce_music_track'),tracks[stage][+boss]);
  gb.set_audio_ch1_enabled(false);gb.set_audio_ch4_enabled(false);gb.audio_buffer_eager(true);
  const first=row();frames(gb,120);const last=row(),musicEnergy=energy();
  assert(last>first,'music advances during real gameplay');assert(musicEnergy>0,'isolated BGM emits PCM');
  tap(PadKey.Start);assert.equal(byte('_ce_pause'),1);const paused=row();frames(gb,90);assert.equal(row(),paused);
  gb.audio_buffer_eager(true);frames(gb,16);assert.equal(energy(),0,'paused music is silent after high-pass settling');
  tap(PadKey.Start);assert.equal(byte('_ce_pause'),0);frames(gb,20);assert(row()>paused,'resume restores music clock');
  let bombEnergy;
  if(stage===0){
   gb.set_audio_ch1_enabled(true);gb.set_audio_ch4_enabled(true);gb.set_audio_ch2_enabled(false);gb.set_audio_ch3_enabled(false);
   gb.audio_buffer_eager(true);gb.key_press(PadKey.A);gb.key_press(PadKey.B);
   until(()=>byte('_ce_bomb_left')>0,600);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);
   frames(gb,40);bombEnergy=energy();assert(bombEnergy>0,'Marisa beam-bomb SFX still audible with new BGM');
   assert.equal(byte('_ce_music_track'),tracks[stage][+boss]);
  }
  const r={mode:label,stage:stage+1,route:boss?'boss':'road',track:tracks[stage][+boss],firstRow:first,lastRow:last,musicEnergy,pause:true,bombEnergy};results.push(r);console.log(r);
 }finally{gb.free();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));}
}
