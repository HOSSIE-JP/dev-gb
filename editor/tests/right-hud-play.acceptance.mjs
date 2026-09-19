// Production ROM: actual joypad input, read-only RAM/VRAM/OAM inspection.
// node editor/tests/right-hud-play.acceptance.mjs ROM.gb OUTPUT
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
import {entityOffset,supportedModes} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),g=lib.readGame(process.cwd(),'touhou-kouma'),font=lib.readFont(process.cwd()),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map'));
fs.mkdirSync(out,{recursive:true});const results=[];
for(const [mode,label] of supportedModes(rom))for(const character of [0,1]){
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000];
 const until=(f,max=6000)=>{for(let i=0;i<max;i++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('timeout '+JSON.stringify(settledTrace(gb,s._ce_trace)));};
 const tap=(k,n=4)=>{gb.key_press(k);frames(gb,n);gb.key_lift(k);frames(gb,12);};
 const age=()=>{const r=memory(gb).ram;for(let i=0;i<39;i++){const p=entityOffset(r,s,i);if(r[p]===2)return r.readUInt16LE(p+8);}return -1;};
 function hud(boss,values={}){
  const m=memory(gb),v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4)),window=!!(m.io[0x40]&32);
  if(!boss||byte('_ce_bomb_image')){assert(window,'road/bomb Window enabled');assert.equal(m.io[0x4b],127);assert.equal(m.io[0x4a],0);}else assert(!window,'BG boss HUD belongs to the published BG map');
  const cell=(x,y)=>{let xx=x,yy=y,base;if(window&&x>=m.io[0x4b]-7&&y>=m.io[0x4a]){xx-=m.io[0x4b]-7;yy-=m.io[0x4a];base=m.io[0x40]&64?0x1c00:0x1800;}else{xx=(x+m.io[0x43])&255;yy=(y+m.io[0x42])&255;base=m.io[0x40]&8?0x1c00:0x1800;}const p=base+(yy>>3)*32+(xx>>3),tile=v[p],attr=mode===GameBoyMode.Cgb?v[p+0x2000]:0,px=attr&32?7-(xx&7):xx&7,py=attr&64?7-(yy&7):yy&7,addr=(attr&8?0x2000:0)+(m.io[0x40]&16?tile*16:0x1000+(tile<128?tile:tile-256)*16)+py*2;return !!(((v[addr]|v[addr+1])>>(7-px))&1);};
  const text=(str,x,y)=>{for(const [i,ch] of [...str].entries())for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++)assert.equal(cell(120+(x+i)*8+xx,y*8+yy),!!font[ch][yy*8+xx],`${label} ${character} ${boss?'boss':'road'} HUD ${str} ${i},${xx},${yy}`);};
  for(const item of g.screens.find(h=>h.id==='hud').items){if(item.binding==='none')text(item.text,item.x,item.y);else if(values[item.binding]!==undefined)text(String(values[item.binding]).padStart(item.digits,'0'),item.x,item.y);else if(!boss&&['boss','bossTime','bossPhase'].includes(item.binding))text('--'.padStart(item.digits,' '),item.x,item.y);}
  for(let i=0;i<40;i++)if(m.oam[i*4]>0&&m.oam[i*4]<160&&m.oam[i*4+1]>0&&m.oam[i*4+1]<168)assert(m.oam[i*4+1]<=120,'no OBJ component enters HUD');
 }
 try{
  until(t=>t.scene===0);tap(PadKey.A);until(t=>t.scene===10);if(character)tap(PadKey.Right);tap(PadKey.A);
  until(t=>t.scene===1&&t.tick>=20&&!byte('_ce_fade_level'));hud(false);capture(gb,path.join(out,`${label}-${character}-road.png`));
  const camera=memory(gb).io[0x42];frames(gb,140);until(t=>t.scene===1);hud(false);assert.notEqual(memory(gb).io[0x42],camera,'road scroll changes while HUD stays fixed');
  gb.key_press(PadKey.Right);frames(gb,100);gb.key_lift(PadKey.Right);const edge=until(t=>t.scene===1);assert.equal(edge.x/16,112);hud(false);
  gb.key_press(PadKey.A);gb.key_press(PadKey.B);until(()=>byte('_ce_bomb_image')>0);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);
  let bombSamples=0;while(byte('_ce_bomb_left')){frames(gb,2);const t=settledTrace(gb,s._ce_trace);if(t?.scene===1&&byte('_ce_bomb_image')){hud(false);if(bombSamples++===4)capture(gb,path.join(out,`${label}-${character}-road-bomb.png`));}}
  frames(gb,4);until(t=>t.scene===1);hud(false);assert(bombSamples>10);
  // Reset through the real chord, then select the 40-bullet final boss.
  for(const k of [PadKey.A,PadKey.B,PadKey.Start,PadKey.Select])gb.key_press(k);
  for(let n=0;n<240&&(memory(gb).io[0x26]&128);n++)frames(gb,1);
  for(const k of [PadKey.A,PadKey.B,PadKey.Start,PadKey.Select])gb.key_lift(k);
  frames(gb,60);until(t=>t.scene===0);for(let n=0;n<10;n++)tap(PadKey.B);tap(PadKey.Down);tap(PadKey.Left);tap(PadKey.A);until(t=>t.scene===10);if(character)tap(PadKey.Right);tap(PadKey.A);
  until(t=>t.scene===7);const cutinAge=age();frames(gb,30);assert.equal(age(),cutinAge,'cut-in freezes gameplay clock');
  until(t=>t.scene===1&&t.bossPhase===1&&!byte('_ce_fade_level'));frames(gb,4);until(t=>t.scene===1);hud(true,{boss:100,bossTime:60,bossPhase:'1/3'});
  tap(PadKey.Start);assert(byte('_ce_pause'));const paused=age();frames(gb,90);assert.equal(age(),paused);hud(true);tap(PadKey.Start);assert(!byte('_ce_pause'));assert(age()>paused);
  const before=age();gb.key_press(PadKey.A);gb.key_press(PadKey.B);until(()=>byte('_ce_bomb_image')>0);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);
  let liveSamples=0;while(byte('_ce_bomb_left')){frames(gb,2);const t=settledTrace(gb,s._ce_trace);if(t?.scene===1&&byte('_ce_bomb_image')){hud(true);if(liveSamples++===4)capture(gb,path.join(out,`${label}-${character}-boss-bomb.png`));}}
  frames(gb,4);until(t=>t.scene===1);assert(age()>before+30,'timer continues during live bomb');hud(true);capture(gb,path.join(out,`${label}-${character}-boss-restored.png`));
  let peak=0,miss=false,last=settledTrace(gb,s._ce_trace),lastAge=age();
  for(let n=0;n<1200;n++){frames(gb,1);const t=settledTrace(gb,s._ce_trace);if(t?.scene!==1)continue;peak=Math.max(peak,byte('_ce_bg_count'));const now=age();if(t.lives<last.lives){assert(now>=lastAge,'miss does not refill timer');miss=true;break;}last=t;lastAge=now;}
  assert(miss,'production bullet collision causes a miss');hud(true);capture(gb,path.join(out,`${label}-${character}-boss.png`));
  results.push({mode:label,character,windowFixed:true,bgHud:true,bombSamples,liveSamples,pause:true,cutinClock:true,bombClock:true,missClock:true,noHudSprites:true,peak});console.log(results.at(-1));
 }catch(e){capture(gb,path.join(out,`${label}-${character}-failure.png`));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
