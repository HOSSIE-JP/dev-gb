// Real production ROM input and read-only state/VRAM checks.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
import {capture,backgroundColors,expectedColorScreen} from './presentation-qa.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),g=lib.readGame(process.cwd(),'touhou-kouma'),results=[];
for(const [mode,label,stage,character] of [[GameBoyMode.Cgb,'CGB',0,0],[GameBoyMode.Cgb,'CGB',g.stages.length-1,1],[GameBoyMode.Dmg,'DMG',g.stages.length-1,1]]){
 if(mode===GameBoyMode.Dmg&&rom[0x143]===0xc0)continue;
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000];
 const until=(f,max=6000)=>{for(let n=0;n<max;n++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('timeout '+JSON.stringify(settledTrace(gb,s._ce_trace)));};
 const tap=(k,n=4)=>{gb.key_press(k);frames(gb,n);gb.key_lift(k);frames(gb,12);};
 try{
  // Movie and logos retain their real startup route.
  until(t=>t.scene===0);assert.equal(byte('_ce_boss_mode'),0);
  tap(PadKey.B,120);assert.equal(byte('_ce_boss_mode'),0,'held B is one press');
  for(let n=0;n<8;n++)tap(PadKey.B);assert.equal(byte('_ce_boss_mode'),0,'nine presses');
  tap(PadKey.B);assert.equal(byte('_ce_boss_mode'),1,'tenth press');
  if(mode===GameBoyMode.Cgb){
   const menu=lib.titlePresentation(g,g.screens.find(s=>s.id==='title'),0,0,true),expected=expectedColorScreen(g,menu.screen,lib.readFont(process.cwd()),menu.pixels),actual=backgroundColors(gb);
   // Menu labels only; the surrounding art is independently quantized.
   for(const [x,y,w] of [[2,14,9],[2,16,12]])for(let yy=y*8;yy<(y+1)*8;yy++)for(let xx=x*8;xx<(x+w)*8;xx++)assert.equal(actual[yy*160+xx],expected[yy*160+xx],`menu ${xx},${yy}`);
  }
  capture(gb,path.join(out,`${label}-${stage}-title.png`));
  for(let n=0;n<10;n++)tap(PadKey.B);assert.equal(byte('_ce_boss_mode'),0,'toggle off');
  for(let n=0;n<10;n++)tap(PadKey.B);assert.equal(byte('_ce_boss_mode'),1);
  if(stage){tap(PadKey.Down);tap(PadKey.Left);assert.equal(byte('_ce_title_stage'),stage);}
  tap(PadKey.A);until(t=>t.scene===10);if(character)tap(PadKey.Right);
  tap(PadKey.A);let cutin=false;const boss=until(t=>{cutin ||= t.scene===7;return t.scene===1&&t.bossHp>0&&byte('_ce_battle_mode')>=2;});
  assert.equal(boss.stage,stage);assert.equal(byte('_ce_character'),character);assert(boss.tick<30,'road skipped');until(t=>t.scene===7);cutin=true;until(t=>t.scene===1&&t.bossPhase>=1&&!byte('_ce_fade_level'));frames(gb,5);
  capture(gb,path.join(out,`${label}-${stage}-boss.png`));
  let beamSamples=0,audioSamples=0,audioSquares=0,audioMin=32767,audioMax=-32768;
  if(character){
   // Isolate the SFX mixer outputs without changing game RAM or registers.
   gb.set_audio_ch2_enabled(false);gb.set_audio_ch3_enabled(false);gb.audio_buffer_eager(true);
   frames(gb,5);gb.key_press(PadKey.A);gb.key_press(PadKey.B);
   until(()=>byte('_ce_bomb_left')>0);gb.key_lift(PadKey.B);
   for(let n=0;n<350;n++){
    frames(gb,1);const m=memory(gb),left=m.ram[s._ce_bomb_left-0xc000];
    if(!left&&beamSamples)break;
    if(left>4&&left<40){assert(m.ram[s._ce_spell_sound_left-0xc000]>0);assert.equal(m.io[0x12],0xa0,'beam pulse not overwritten by held fire');assert.equal(m.io[0x21],0xc0,'beam roar');beamSamples++;
     const pcm=gb.audio_buffer_eager(true);for(const v of pcm){audioSquares+=v*v;audioMin=Math.min(audioMin,v);audioMax=Math.max(audioMax,v);}audioSamples+=pcm.length;
    }
   }
   gb.key_lift(PadKey.A);assert(beamSamples>10);assert(audioSamples>1000&&audioMax-audioMin>1,JSON.stringify({audioSamples,audioMin,audioMax,audioSquares}));gb.set_audio_ch2_enabled(true);gb.set_audio_ch3_enabled(true);
  }
  // Hardware reset chord resets the hidden mode and returns through startup.
  for(const k of [PadKey.A,PadKey.B,PadKey.Start,PadKey.Select])gb.key_press(k);
  for(let n=0;n<240 && (memory(gb).io[0x26]&0x80);n++)frames(gb,1);
  assert.equal(memory(gb).io[0x26]&0x80,0,"reset chord acknowledged");
  for(const k of [PadKey.A,PadKey.B,PadKey.Start,PadKey.Select])gb.key_lift(k);
  frames(gb,60);until(t=>t.scene===0);assert.equal(byte('_ce_boss_mode'),0);
  // Nine B edges must still start the normal road.
  for(let n=0;n<9;n++)tap(PadKey.B);tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.A);
  const road=until(t=>t.scene===1&&t.tick>=10);assert.equal(byte('_ce_battle_mode'),0);assert.equal(road.bossHp,0);assert(road.stageTick<100);
  results.push({mode:label,stage:stage+1,character,heldB:true,tenthPress:true,toggleOff:true,cutin,beamSamples,audioSamples,sfxRms:audioSamples?Math.sqrt(audioSquares/audioSamples):0,reset:true,normalRoad:true});console.log(results.at(-1));
 }catch(e){capture(gb,path.join(out,`${label}-${stage}-failure.png`));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
