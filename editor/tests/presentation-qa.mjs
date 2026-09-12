// Read-only VRAM assertions for real compiled screens; no emulator memory writes.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {PNG} from '../node_modules/pngjs/lib/png.js';
import {memory} from './emulator.mjs';
export function capture(gb,file){const p=new PNG({width:160,height:144}),rgb=gb.frame_buffer_eager();for(let i=0;i<23040;i++){p.data.set(rgb.subarray(i*3,i*3+3),i*4);p.data[i*4+3]=255;}fs.writeFileSync(file,PNG.sync.write(p));}
export function backgroundPixels(gb){
 const m=memory(gb),v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4)),map=m.io[0x40]&8?0x1c00:0x1800,result=[];
 for(let y=0;y<144;y++)for(let x=0;x<160;x++){
  const tile=v[map+(y>>3)*32+(x>>3)],off=(m.io[0x40]&16?tile*16:0x1000+(tile<128?tile:tile-256)*16)+(y%8)*2;
  result.push(((v[off]>>(7-x%8))&1)|(((v[off+1]>>(7-x%8))&1)<<1));
 }return result;
}
export function overlay(pixels,glyphs,text,x,y){for(const [i,ch]of [...text].entries()){const glyph=glyphs[ch];assert.ok(glyph,'supported '+ch);for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++)pixels[(y*8+yy)*160+(x+i)*8+xx]=glyph[yy*8+xx];}return pixels;}
export function assertImage(gb,expected,label){const actual=backgroundPixels(gb);let diff=0,first;for(let i=0;i<23040;i++)if(actual[i]!==expected[i]){diff++;first??=[i%160,Math.floor(i/160),actual[i],expected[i]];}assert.equal(diff,0,label+' pixels, first mismatch '+JSON.stringify(first));}
export function expectedDialogue(lib,game,glyphs,p,after,page){
 const scene=after?p.victoryDialogue:{background:p.dialogueBackground,portrait:p.dialoguePortrait,pages:p.dialogue};
 const pixels=lib.dialoguePixels(game,scene.background,scene.portrait)??[...game.assets.find(a=>a.id===scene.background).frames[0].pixels],line=scene.pages[page];
 overlay(pixels,glyphs,line.speaker,1,12);overlay(pixels,glyphs,line.line1,1,14);overlay(pixels,glyphs,line.line2,1,15);overlay(pixels,glyphs,'A:つぎ START:スキップ',1,17);return pixels;
}
