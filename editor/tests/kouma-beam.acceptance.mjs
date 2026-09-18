// Production ROM, real menu input, read-only BESS snapshots; no memory patches.
// node editor/tests/kouma-beam.acceptance.mjs ROM OUT
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const l=createRequire(import.meta.url)('../build/library.cjs'),g=l.readGame(process.cwd(),'touhou-kouma'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),results=[];
fs.mkdirSync(out,{recursive:true});const layout=l.spriteLayout(g),beam=128+layout.tiles+8;
for(const [mode,label]of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']]){
 const gb=boot(rom,mode);let samples=0;
 const byte=n=>memory(gb).ram[s[n]-0xc000],tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 const until=(f,max=5000)=>{for(let i=0;i<max;i++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('timeout '+JSON.stringify(settledTrace(gb,s._ce_trace)));};
 const select=(boss=false)=>{until(t=>t.scene===0);if(boss)for(let i=0;i<10;i++)tap(PadKey.B);tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===1&&t.tick>4&&!byte('_ce_fade_level'));};
 function inspect(boss=false){
  // Wait past entry invulnerability: the framebuffer can still show the
  // previous blink frame when the newly published OAM contains the player.
  until(t=>t.scene===1&&!byte('_ce_respawn')&&byte('_ce_beam_pattern')!==255&&!byte('_ce_boss_invulnerable')&&!memory(gb).ram.readUInt16LE(s._ce_state-0xc000+8));
  frames(gb,2);
  const t=settledTrace(gb,s._ce_trace),m=memory(gb),tile=beam-(boss?128:0),rays=[];
  assert(m.io[0x40]&4,'hardware 8x16 mode');assert.deepEqual(m.oam,m.ram.subarray(s._shadow_OAM-0xc000,s._shadow_OAM-0xc000+160));
  for(let i=0;i<40;i++){const at=i*4;if(m.oam[at]&&(m.oam[at+2]===tile||m.oam[at+2]===tile+2))rays.push([...m.oam.subarray(at,at+4)]);}
  const player=g.assets.find(a=>a.id===g.player.characters[0].asset),first=(boss?0:128)+layout.offsets.get(player.id),stride=l.spriteFrameTiles(g,player);
  const body=[...Array(40).keys()].map(i=>[...m.oam.subarray(i*4,i*4+4)]).filter(o=>o[0]&&o[2]>=first&&o[2]<first+stride*player.frames.length);
  assert.equal(body.length,stride/2,'player body survives the 8x16 renderer');
  const bottom=Math.trunc(t.y/16)-8;assert.equal(rays.length,Math.ceil(bottom/16));assert(rays.length<=9);
  const v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4));
  for(let i=0;i<rays.length;i++){const [y,x,id]=rays[i];assert.equal(x,Math.trunc(t.x/16)+4);assert.equal(y,bottom-i*16);assert.equal(id&1,0);for(let row=0;row<16;row++)assert((v[id*16+row*2]|v[id*16+row*2+1])&0x18,'unbroken core');}
  // Every resident image, including animation and padded rows, is in the
  // paired order expected by the hardware. Palette grouping is tested above.
  if(!boss)for(const a of g.assets.filter(a=>a.kind==='sprite'&&!layout.overlay.has(a.id))){
   const q=mode===GameBoyMode.Cgb?l.quantizeSpriteAssets(g):null;let at=(128+layout.offsets.get(a.id))*16;
   for(const f of a.frames){const pixels=q?q.frames.get(a.id+'/'+f.id).pixels:f.pixels;
    for(let y=0;y<a.height;y+=16)for(let x=0;x<a.width;x+=8)for(let dy=0;dy<16;dy++)for(let bit=0;bit<8;bit++){
     const actual=((v[at+dy*2]>>(7-bit))&1)|(((v[at+dy*2+1]>>(7-bit))&1)<<1),want=y+dy<a.height?pixels[(y+dy)*a.width+x+bit]:0;assert.equal(actual,want,a.id+' atlas');
     if(dy===15&&bit===7)at+=32;
    }
   }
  }
  samples++;return {t,rays};
 }
 try{
  select();gb.key_press(PadKey.A);frames(gb,6);inspect();capture(gb,path.join(out,label+'-road-beam.png'));
  gb.key_press(PadKey.Right);frames(gb,8);const right=inspect().t.x;gb.key_lift(PadKey.Right);gb.key_press(PadKey.Left);frames(gb,10);assert(inspect().t.x<right);gb.key_lift(PadKey.Left);
  gb.key_lift(PadKey.A);until(()=>byte('_ce_beam_pattern')===255);frames(gb,4);assert(![...Array(40).keys()].some(i=>memory(gb).oam[i*4]&&[beam,beam+2].includes(memory(gb).oam[i*4+2])),'release clears ray');
  gb.key_press(PadKey.B);frames(gb,8);inspect();capture(gb,path.join(out,label+'-focus-beam.png'));gb.key_lift(PadKey.B);
  // Software reset through the actual four-button chord.
  for(const k of [PadKey.A,PadKey.B,PadKey.Start,PadKey.Select])gb.key_press(k);frames(gb,120);for(const k of [PadKey.A,PadKey.B,PadKey.Start,PadKey.Select])gb.key_lift(k);frames(gb,90);
  select(true);until(t=>t.scene===7);until(t=>t.scene===1&&t.bossPhase===1&&!byte('_ce_fade_level'));gb.key_press(PadKey.B);frames(gb,8);inspect(true);capture(gb,path.join(out,label+'-boss-beam.png'));
  const hp=settledTrace(gb,s._ce_trace).bossHp;until(t=>t.bossHp<hp&&t.bossHp>0);assert(byte('_ce_beam_pattern')!==255);gb.key_lift(PadKey.B);
  results.push({mode:label,samples,roadAtlas:true,following:true,release:true,focus:true,bossDamage:true});console.log(results.at(-1));
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
