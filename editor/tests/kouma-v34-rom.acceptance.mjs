// Actual production ROM input. No state, VRAM or gameplay register writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),g=lib.readGame(process.cwd(),'touhou-kouma'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),marker=128+lib.spriteLayout(g).tiles,results=[];
fs.mkdirSync(out,{recursive:true});
for(const [mode,label] of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']])for(const character of [0,1]){
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000],vram=()=>{const m=memory(gb);return m.state.subarray(m.state.readUInt32LE(m.core+0xa4));};
 const until=(f,max=6000)=>{for(let n=0;n<max;n++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('timeout '+JSON.stringify(settledTrace(gb,s._ce_trace)));};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 const select=(stage,boss=false)=>{until(t=>t.scene===0);if(boss)for(let i=0;i<10;i++)tap(PadKey.B);tap(PadKey.Down);for(let i=0;i<stage;i++)tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===10);if(character)tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===1&&t.tick>=20&&!byte('_ce_fade_level'));};
 const reset=()=>{for(const k of [PadKey.A,PadKey.B,PadKey.Start,PadKey.Select])gb.key_press(k);for(let n=0;n<240&&(memory(gb).io[0x26]&128);n++)frames(gb,1);for(const k of [PadKey.A,PadKey.B,PadKey.Start,PadKey.Select])gb.key_lift(k);frames(gb,60);until(t=>t.scene===0);};
 function focus(boss){gb.key_press(PadKey.B);frames(gb,12);until(t=>t.scene===1);const m=memory(gb),p=s._ce_state-0xc000,a=g.assets.find(a=>a.id===(character?g.player.characters[character-1]:g.player).asset),b=a.hitbox;assert.equal(m.oam[2],marker+character*(lib.spriteHeight(g)/4)-(boss?128:0));assert.equal(m.oam[1],Math.trunc(m.ram.readInt16LE(p+14)/16)+8+Math.floor((b.x+Math.floor(b.w/2)-3)/8)*8-a.origin.x);assert.equal(m.oam[0],Math.trunc(m.ram.readInt16LE(p+16)/16)+16+b.y-a.origin.y+Math.floor(b.h/2)-3);capture(gb,path.join(out,`${label}-${character}-${boss?'boss':'road'}-focus.png`));gb.key_lift(PadKey.B);frames(gb,12);until(t=>t.scene===1);assert.notEqual(memory(gb).oam[2],marker+character*(lib.spriteHeight(g)/4)-(boss?128:0));}
 try{
  select(0);focus(false);
  const sprites=Buffer.from(vram().subarray(0x800,0x800+(lib.spriteLayout(g).tiles+(lib.spriteHeight(g)===16?12:4))*16)),atlas=Buffer.from(vram().subarray(0,0x800)),phases=new Set(),camera=new Set();
  gb.key_press(PadKey.A);gb.key_press(PadKey.B);until(()=>byte('_ce_bomb_image')===2);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);
  while(byte('_ce_bomb_left')){frames(gb,1);const t=settledTrace(gb,s._ce_trace);if(t?.scene!==1||byte('_ce_bomb_image')!==2)continue;const m=memory(gb),v=vram(),visible=!!(m.io[0x40]&16);assert.equal(!!(m.io[0x40]&8),visible);assert(m.io[0x40]&32);assert.equal(m.io[0x4b],127);assert.deepEqual(v.subarray(0x800,0x800+sprites.length),sprites,'resident OBJ atlas survives both BG address modes');assert.deepEqual(v.subarray(0,0x800),atlas,'bomb tiles are never retransferred during the effect');if(!phases.has(visible))capture(gb,path.join(out,`${label}-${character}-bomb-${visible?'art':'road'}.png`));phases.add(visible);camera.add(m.ram.readUInt16LE(s._ce_state-0xc000+4));}
  frames(gb,6);until(t=>t.scene===1);assert.equal(memory(gb).io[0x40]&24,0);assert.equal(phases.size,2);assert(camera.size>5,'stage keeps scrolling during bomb');focus(false);
  if(character===0)for(let stage=1;stage<7;stage++){reset();select(stage);capture(gb,path.join(out,`${label}-stage-${stage+1}.png`));}
  reset();select(6,true);until(t=>t.scene===7);until(t=>t.scene===1&&t.bossPhase===1&&!byte('_ce_fade_level'));focus(true);
  results.push({mode:label,character,focusRoad:true,focusBoss:true,bombResidentTiles:true,bothBackgrounds:true,scrollSamples:camera.size});console.log(results.at(-1));
 }catch(e){capture(gb,path.join(out,`${label}-${character}-failure.png`));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
