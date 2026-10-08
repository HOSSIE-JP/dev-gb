// Unmodified CGB production ROM; all controls are joypad inputs, RAM is read-only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,entityOffset,GameBoyMode,PadKey} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),g=lib.readGame(root,'touhou-kouma');
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),results=[];
fs.mkdirSync(out,{recursive:true});
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({kind:'unmodified production ROM',rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
for(let stage=0;stage<7;stage++)for(const boss of [false,true]){
 const gb=boot(rom,GameBoyMode.Cgb),byte=n=>memory(gb).ram[s[n]-0xc000],row=()=>memory(gb).ram.readUInt16LE(s._ce_music_row-0xc000);
 const until=(f,max=12000)=>{for(let i=0;i<max;i++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('game input timeout '+f+' '+JSON.stringify(settledTrace(gb,s._ce_trace)));};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 const energy=()=>gb.audio_buffer_eager(true).reduce((n,v)=>n+v*v,0);
 const stageData=g.stages.find(t=>t.id===g.stageOrder[stage]),track=stageData[boss?'bossMusic':'music'];
 try{
  until(t=>t.scene===0);assert.equal(byte('_ce_music_track'),g.music.title);
  if(boss)for(let i=0;i<10;i++)tap(PadKey.B);
  tap(PadKey.Down);for(let i=0;i<stage;i++)tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===10);
  if(stage===0&&!boss){
   const title=g.musicUgeTracks.find(t=>t.id===g.music.title);let last=row(),wraps=0;
   for(let i=0;i<title.rows*title.ticksPerRow*2+60;i++){frames(gb,1);const now=row();if(now<last){assert.equal(now,title.loopStartRow);wraps++;}last=now;}
   assert(wraps>=2,'title loops twice in the real character-selection scene');assert.equal(byte('_ce_scene'),10);
   results.push({route:'character selection',titleTrack:g.music.title,loopWraps:wraps});save();
  }
  tap(PadKey.Right);tap(PadKey.A);
  if(boss){until(t=>t.scene===7);until(t=>t.scene===1&&t.bossPhase===1&&!byte('_ce_boss_invulnerable'));}
  else until(t=>t.scene===1&&t.tick>20);
  assert.equal(byte('_ce_music_track'),track);assert.equal(byte('_ce_music_three'),2);
  gb.set_audio_ch1_enabled(false);gb.set_audio_ch4_enabled(false);gb.audio_buffer_eager(true);
  const first=row();frames(gb,120);const last=row(),musicEnergy=energy();assert(last>first);assert(musicEnergy>0,'CH2/CH3 BGM PCM during real gameplay');
  tap(PadKey.Start);assert.equal(byte('_ce_pause'),1);const paused=row();frames(gb,90);assert.equal(row(),paused);
  gb.audio_buffer_eager(true);frames(gb,32);assert.equal(energy(),0,'paused BGM silent after filter settling');
  tap(PadKey.Start);assert.equal(byte('_ce_pause'),0);frames(gb,20);assert(row()>paused);
  let sfxEnergy;
  if(stage===0){
   gb.set_audio_ch1_enabled(true);gb.set_audio_ch4_enabled(true);gb.set_audio_ch2_enabled(false);gb.set_audio_ch3_enabled(false);gb.audio_buffer_eager(true);
   gb.key_press(PadKey.A);gb.key_press(PadKey.B);until(()=>byte('_ce_bomb_left')>0,600);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);
   frames(gb,40);sfxEnergy=energy();assert(sfxEnergy>0,'beam bomb SFX audible on CH1/CH4');assert.equal(byte('_ce_music_track'),track);
   tap(PadKey.Start);const bombLeft=byte('_ce_spell_sound_left');frames(gb,90);assert.equal(byte('_ce_spell_sound_left'),bombLeft);
   gb.audio_buffer_eager(true);frames(gb,32);assert.equal(energy(),0,'pause silences active bomb SFX');tap(PadKey.Start);
   gb.set_audio_ch2_enabled(true);gb.set_audio_ch3_enabled(true);frames(gb,30);
  }
  results.push({stage:stage+1,route:boss?'boss':'road',track,firstRow:first,lastRow:last,musicEnergy,pause:true,sfxEnergy});console.log(stage+1,boss?'boss':'road','passed');save();
  if(stage===0&&!boss){
   const lives=settledTrace(gb,s._ce_trace).lives;until(t=>t.lives<lives&&t.scene===1);assert.equal(byte('_ce_music_track'),track);
   frames(gb,90);assert(row()>0,'music survives death/respawn');
   // This production campaign uses the timed continue screen (13), then title.
   // Advance authored dialogue and approach the boss with ordinary pad input.
   const heard=new Set([track]);let offer=false;
   for(let n=0;n<24000;n++){
    const t=settledTrace(gb,s._ce_trace);heard.add(byte('_ce_music_track'));
    for(const k of [PadKey.Up,PadKey.Down,PadKey.Left,PadKey.Right,PadKey.A])gb.key_lift(k);
    if(t?.scene===13){offer=true;break;}
    if(t?.scene===5&&n%30<15)gb.key_press(PadKey.A);
    else if(t?.scene===1&&byte('_ce_battle_mode')){
     const {ram}=memory(gb);
     for(let i=0;i<39;i++){const p=entityOffset(ram,s,i);if(ram[p]!==2)continue;
      const dx=ram.readInt16LE(p+12)-t.x,dy=ram.readInt16LE(p+14)-t.y;
      if(dx>48)gb.key_press(PadKey.Right);if(dx < -48)gb.key_press(PadKey.Left);
      if(dy>48)gb.key_press(PadKey.Down);if(dy < -48)gb.key_press(PadKey.Up);break;
     }
    }
    frames(gb,1);
   }
   assert(offer,'natural losses reach the production continue screen');assert.equal(byte('_ce_music_track'),g.music.gameover);assert.equal(byte('_ce_music_three'),0);
   const start=row();frames(gb,90);assert(row()>start);
   tap(PadKey.Start);until(t=>t.scene===1&&!t.result);assert.equal(byte('_ce_music_track'),track);frames(gb,60);assert(row()>0);
   results.push({route:'death, respawn, gameover and continue',roadTrack:track,gameoverTrack:g.music.gameover,heard:[...heard],continueRestartsRoad:true});save();
  }
 }finally{gb.free();save();}
}
