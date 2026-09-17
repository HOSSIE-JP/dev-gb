// Actual ROM input/audio, without modifying RAM or shortening authored stages.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map'));
fs.mkdirSync(out,{recursive:true});const results=[];
function wav(gb,samples,file){const b=Buffer.alloc(44+samples.length*2),channels=gb.audio_channels(),rate=gb.audio_sampling_rate();b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);samples.forEach((v,i)=>b.writeInt16LE(v,44+i*2));fs.writeFileSync(file,b);}
for(const [label,mode] of (rom[0x143]===0xC0?[['CGB',GameBoyMode.Cgb]]:[['DMG',GameBoyMode.Dmg],['CGB',GameBoyMode.Cgb]])){
 const gb=boot(rom,mode),audio=[],volumes=new Set();let captured=false;
 const read=()=>{const m=memory(gb),b=n=>m.ram[s[n]-0xc000];return {scene:b('_ce_scene'),tick:m.ram.readUInt16LE(s._ce_state-0xc000),fade:b('_ce_fade_level'),sound:b('_ce_spell_sound_left'),left:m.ram.readUInt16LE(s._ce_intro_left-0xc000),pause:b('_ce_pause'),color:b('_ce_is_cgb'),scores:Buffer.from(m.ram.subarray(s._ce_scores-0xc000,s._ce_scores-0xc000+10)),io:m.io};};
 const until=(f,max=24000)=>{for(let i=0;i<max;i++){frames(gb,1);const t=read();gb.audio_buffer_eager(true);if(f(t))return t;}throw Error(label+' route timeout');};
 const tap=k=>{gb.key_press(k);frames(gb,8);gb.key_lift(k);frames(gb,35);};
 const restart=()=>{
  const scores=read().scores;for(const k of [PadKey.Start,PadKey.Select,PadKey.A,PadKey.B])gb.key_press(k);
  frames(gb,12);assert.equal(read().io[0x40]&0x80,0,'reset chord blanks LCD while held');
  frames(gb,90);assert.equal(read().io[0x40]&0x80,0,'held chord cannot repeatedly reboot');
  for(const k of [PadKey.Start,PadKey.Select,PadKey.A,PadKey.B])gb.key_lift(k);
  until(t=>t.scene===12,400);frames(gb,60);assert.equal(read().scene,12,'fresh logo sequence after reset');
  assert.deepEqual(read().scores,scores,'ranking survives software restart');assert.equal(read().color,mode===GameBoyMode.Cgb?1:0);
 };
 try{
  until(t=>t.scene===7&&t.sound>0);gb.audio_buffer_eager(true);
  for(let i=0;i<100;i++){
   const t=read();if(t.sound){volumes.add(t.io[0x12]>>4);}
   if(t.scene===7&&t.left<42&&!captured){capture(gb,path.join(out,label+'-cutin.png'));captured=true;}
   frames(gb,1);audio.push(...gb.audio_buffer_eager(true));
  }
  assert.ok(captured&&volumes.size>=7,'rising and fading spell envelope');console.log(label,'audio levels',new Set(audio).size,'samples',audio.length,'volumes',[...volumes]);assert.ok(new Set(audio).size>=4,'actual APU samples');
  wav(gb,audio,path.join(out,label+'-cutin.wav'));
  until(t=>t.scene===1);restart();
  tap(PadKey.A);until(t=>t.scene===0);tap(PadKey.Start);until(t=>t.scene===10);tap(PadKey.A);until(t=>t.scene===1&&!t.fade&&t.tick>20);
  tap(PadKey.Start);assert.equal(read().pause,1);
  // A+B alone is not reset; the complete chord also works while paused.
  gb.key_press(PadKey.A);gb.key_press(PadKey.B);frames(gb,10);assert.equal(read().scene,1);assert.ok(read().io[0x40]&0x80);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);
  restart();until(t=>t.scene===7&&t.sound>30);restart();
  results.push({mode:label,resets:['boss battle','paused gameplay','cutin'],rankingPreserved:true,heldChordConsumed:true,partialChordDoesNotReset:true,volumes:[...volumes],audioSamples:audio.length});
  console.log(label,'reset and cutin passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
