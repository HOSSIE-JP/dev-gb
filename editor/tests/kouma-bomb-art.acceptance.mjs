// Production input; compare every Reimu bomb BG pixel with compiled source art.
// OAM is deliberately excluded so a character/shot cannot hide a missing tile.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,trace,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const l=createRequire(import.meta.url)('../build/library.cjs'),g=l.readGame(process.cwd(),'touhou-kouma'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),art=l.bombViewportPixels(g,g.player.bomb.background,false),q=l.quantizeColorTiles(160,144,art.rgb),results=[];fs.mkdirSync(out,{recursive:true});
for(const [mode,label] of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']])for(const boss of [false,true]){
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000],until=(f,max=6000)=>{for(let n=0;n<max;n++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('timeout '+JSON.stringify({label,boss,trace:settledTrace(gb,s._ce_trace),left:byte('_ce_bomb_left'),image:byte('_ce_bomb_image')}));},tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 try{
  until(t=>t.scene===0);if(boss)for(let i=0;i<10;i++)tap(PadKey.B);tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.A);
  if(boss){until(t=>t.scene===7);until(t=>t.scene===1&&t.bossPhase===1&&!byte('_ce_fade_level'));}else until(t=>t.scene===1&&t.tick>=20&&!byte('_ce_fade_level'));
  frames(gb,8);until(t=>t.scene===1);gb.key_press(PadKey.A);gb.key_press(PadKey.B);until(()=>byte('_ce_bomb_image')>0);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);
  let visible=false;for(let i=0;i<100000;i++){const t=trace(gb,s._ce_trace);if(t?.scene===1){const m=memory(gb),pal=m.state.subarray(m.state.readUInt32LE(m.core+0xc4));visible=byte('_ce_bomb_image')>0&&byte('_ce_bomb_left')<45&&!!(boss?(mode===GameBoyMode.Cgb?pal.subarray(8,64).some(v=>v):true):(m.io[0x40]&16));if(visible)break;}gb.clocks_cycles(256);}assert(visible,'visible completed bomb frame');
  const m=memory(gb),v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4)),pal=m.state.subarray(m.state.readUInt32LE(m.core+0xc4)),base=m.io[0x40]&8?0x1c00:0x1800,diffs=[];
  for(let y=0;y<144;y++)for(let x=0;x<120;x++){
   const xx=(x+m.io[0x43])&255,yy=(y+m.io[0x42])&255,cell=base+(yy>>3)*32+(xx>>3),tile=v[cell],attr=mode===GameBoyMode.Cgb?v[cell+0x2000]:0,px=attr&32?7-(xx&7):xx&7,py=attr&64?7-(yy&7):yy&7,addr=(attr&8?0x2000:0)+(m.io[0x40]&16?tile*16:0x1000+(tile<128?tile:tile-256)*16)+py*2,index=((v[addr]>>(7-px))&1)|(((v[addr+1]>>(7-px))&1)<<1),actual=mode===GameBoyMode.Cgb?pal.readUInt16LE((attr&7)*8+index*2):index,expected=mode===GameBoyMode.Cgb?l.rgb555(q.preview[y*160+x]):art.pixels[y*160+x];
   if(actual!==expected)diffs.push({x,y,actual,expected,mono:art.pixels[y*160+x],tile,attr});
  }
  capture(gb,path.join(out,`${label}-${boss?'boss':'road'}.png`));results.push({mode:label,boss,pixels:17280,mismatches:diffs.length,examples:diffs.slice(0,16)});console.log(results.at(-1));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));assert(results.every(r=>r.mismatches===0),'bomb must match the full source, including pixels absent in its independent DMG image');
