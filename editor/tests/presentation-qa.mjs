// Read-only VRAM assertions for real compiled screens; no emulator memory writes.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {PNG} from '../node_modules/pngjs/lib/png.js';
import {memory,GameBoyMode} from './emulator.mjs';
import {createRequire} from 'node:module';
const colorLib=createRequire(import.meta.url)('../build/library.cjs');
export function backgroundColors(gb){
 const m=memory(gb),v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4)),pal=m.state.subarray(m.state.readUInt32LE(m.core+0xc4)),map=m.io[0x40]&8?0x1c00:0x1800,result=[];
 for(let y=0;y<144;y++)for(let x=0;x<160;x++){
  const cell=map+(y>>3)*32+(x>>3),tile=v[cell],attr=v[cell+0x2000],xx=attr&32?7-x%8:x%8,yy=attr&64?7-y%8:y%8,off=(attr&8?0x2000:0)+(m.io[0x40]&16?tile*16:0x1000+(tile<128?tile:tile-256)*16)+yy*2;
  const index=((v[off]>>(7-xx))&1)|(((v[off+1]>>(7-xx))&1)<<1);result.push(pal.readUInt16LE((attr&7)*8+index*2));
 }return result;
}
export function expectedColorScreen(game,screen,glyphs,pixels,portrait){
 const a=game.assets.find(a=>a.id===screen.background);if(!a?.frames[0].cgbPixels)return undefined;
 const rgb=[...a.frames[0].cgbPixels],base=a.frames[0].pixels,left=game.assets.find(a=>a.id===portrait);
 if(pixels)for(let i=0;i<rgb.length;i++){if(left&&i%160<80&&i<160*96)rgb[i]=left.frames[0].cgbPixels[i];else if(pixels[i]!==base[i])rgb[i]=parseInt(game.palettes[screen.palette].colors[pixels[i]].slice(1),16);}
 if(pixels&&(screen.id==='title'||screen.id==='gameover'))rgb.fill(parseInt(game.palettes[0].colors[0].slice(1),16),160*(screen.id==='title'?112:104));
 const result=colorLib.quantizeColorTiles(160,144,rgb).preview.map(colorLib.rgb555),system=game.palettes[0].colors.map(c=>colorLib.rgb555(parseInt(c.slice(1),16)));
 for(const t of screen.items)for(const [i,ch]of [...t.text.normalize('NFC')].entries())for(let y=0;y<8;y++)for(let x=0;x<8;x++)result[(t.y*8+y)*160+(t.x+i)*8+x]=system[glyphs[ch][y*8+x]];
 return result;
}
export function capture(gb,file){const p=new PNG({width:160,height:144}),rgb=gb.frame_buffer_eager();for(let i=0;i<23040;i++){p.data.set(rgb.subarray(i*3,i*3+3),i*4);p.data[i*4+3]=255;}fs.writeFileSync(file,PNG.sync.write(p));}
export function backgroundPixels(gb){
 const m=memory(gb),v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4)),map=m.io[0x40]&8?0x1c00:0x1800,result=[];
 for(let y=0;y<144;y++)for(let x=0;x<160;x++){
  const tile=v[map+(y>>3)*32+(x>>3)],off=(m.io[0x40]&16?tile*16:0x1000+(tile<128?tile:tile-256)*16)+(y%8)*2;
  result.push(((v[off]>>(7-x%8))&1)|(((v[off+1]>>(7-x%8))&1)<<1));
 }return result;
}
export function overlay(pixels,glyphs,text,x,y){for(const [i,ch]of [...text].entries()){const glyph=glyphs[ch];assert.ok(glyph,'supported '+ch);for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++)pixels[(y*8+yy)*160+(x+i)*8+xx]=glyph[yy*8+xx];}return pixels;}
export function assertImage(gb,expected,label){const color=gb.mode()===GameBoyMode.Cgb&&expected.cgb,actual=color?backgroundColors(gb):backgroundPixels(gb),wanted=color||expected;let diff=0,first;for(let i=0;i<23040;i++)if(actual[i]!==wanted[i]){diff++;first??=[i%160,Math.floor(i/160),actual[i],wanted[i]];}assert.equal(diff,0,label+' pixels, first mismatch '+JSON.stringify(first));}
export function expectedDialogue(lib,game,glyphs,p,after,page){
 const scene=after?p.victoryDialogue:{background:p.dialogueBackground,portrait:p.dialoguePortrait,pages:p.dialogue};
 const pixels=lib.dialoguePixels(game,scene.background,scene.portrait)??[...game.assets.find(a=>a.id===scene.background).frames[0].pixels],line=scene.pages[page];
 const items=[{text:line.speaker,x:1,y:12},{text:line.line1,x:1,y:14},{text:line.line2,x:1,y:15},{text:'A:つぎ START:スキップ',x:1,y:17}];
 pixels.cgb=expectedColorScreen(game,{id:'clear',background:scene.background,palette:0,items},glyphs,lib.dialoguePixels(game,scene.background,scene.portrait),scene.portrait);
 overlay(pixels,glyphs,line.speaker,1,12);overlay(pixels,glyphs,line.line1,1,14);overlay(pixels,glyphs,line.line2,1,15);overlay(pixels,glyphs,'A:つぎ START:スキップ',1,17);return pixels;
}
