// Unmodified authored ROM, both hardware modes, real selection and three lost lives.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
import {capture,assertImage,overlay,expectedDialogue} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),game=lib.readGame(root,'touhou-kouma'),glyphs=lib.readFont(root);
const file=path.resolve(process.argv[2]??'projects/touhou-kouma/build/Debug/touhou-kouma.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v11/screens'),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];
fs.mkdirSync(out,{recursive:true});
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu');
 const snap=()=>{let m=memory(gb);if(m.ram[syms._ce_scene-0xc000]===1){settledTrace(gb,syms._ce_trace);m=memory(gb);}const r=m.ram,byte=n=>r[syms[n]-0xc000],s=syms._ce_state-0xc000,t=syms._ce_trace-0xc000;return {r,byte,scene:byte('_ce_scene'),shown:r[t+22]?255:r[t+17],stage:r[s+18],lives:r[s+19],score:r.readUInt16LE(s+6),x:r.readInt16LE(s+14),y:r.readInt16LE(s+16)};};
 const until=(f,n=1200)=>{for(let i=0;i<n;i++){const s=snap();if(f(s))return s;frames(gb,1);}capture(gb,path.join(out,label+'-failure.png'));throw Error(label+' timeout '+f+' '+JSON.stringify({...snap(),r:undefined,byte:undefined}));};
 const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};
 const art=id=>game.assets.find(a=>a.id===id).frames[0].pixels;
 try{
  frames(gb,240);tap(PadKey.Start);until(s=>s.shown===10);frames(gb,2);assertImage(gb,art('select-reimu'),label+' default menu');
  tap(PadKey.Left);until(s=>s.shown===10&&s.byte('_ce_character')===1);frames(gb,2);assertImage(gb,art('select-marisa'),label+' wrapped menu');
  tap(PadKey.B);until(s=>s.shown===0);tap(PadKey.Start);until(s=>s.shown===10&&s.byte('_ce_character')===0);
  if(character){tap(PadKey.Right);until(s=>s.shown===10&&s.byte('_ce_character')===1);}frames(gb,2);
  assertImage(gb,art(character?'select-marisa':'select-reimu'),label+' image-only selection');capture(gb,path.join(out,label+'-selection.png'));
  tap(PadKey.A);until(s=>s.shown===1);const pages=new Set(),lives=new Set([snap().lives]);let over=false;
  for(let n=0;n<22000;n++){
   const s=snap();lives.add(s.lives);for(const k of [PadKey.Up,PadKey.Down,PadKey.Left,PadKey.Right,PadKey.A])gb.key_lift(k);
   if(s.shown===2){over=true;break;}
   if(s.scene===5){
    if(s.shown===5){const page=s.byte('_ce_dialogue_page');if(page<4&&!pages.has(page)){frames(gb,2);assertImage(gb,expectedDialogue(lib,game,glyphs,lib.resolvePresentation(game,game.stages.find(t=>t.id===game.stageOrder[s.stage]),character),false,page),label+' before page '+page);capture(gb,path.join(out,label+'-before-'+page+'.png'));pages.add(page);}}
    if(pages.has(s.byte('_ce_dialogue_page'))&&n%30<15)gb.key_press(PadKey.A);
   }else if(s.scene===1&&s.byte('_ce_battle_mode')){
    const e=syms._ce_entities-0xc000;for(let i=0;i<39;i++)if(s.r[e+i*25]===2){const dx=s.r.readInt16LE(e+i*25+12)-s.x,dy=s.r.readInt16LE(e+i*25+14)-s.y;if(dy>48)gb.key_press(PadKey.Down);if(dy < -48)gb.key_press(PadKey.Up);if(dx>48)gb.key_press(PadKey.Right);if(dx < -48)gb.key_press(PadKey.Left);break;}
   }frames(gb,1);
  }
  assert.ok(over,label+' all lives lost through collisions');assert.equal(pages.size,4);assert.equal(snap().lives,0);frames(gb,2);
  const s=snap(),expected=[...art(character?'gameover-marisa':'gameover-reimu')];
  for(const item of game.screens.find(s=>s.id==='gameover').items){overlay(expected,glyphs,item.text,item.x,item.y);if(item.binding==='score')overlay(expected,glyphs,String(s.score).padStart(item.digits??5,'0'),item.x+item.text.length,item.y);}
  assertImage(gb,expected,label+' gameover with score');capture(gb,path.join(out,label+'-gameover.png'));
  assert.equal(s.byte('_ce_character'),character);frames(gb,90);assert.equal(snap().scene,2,'gameover remains until input');
  tap(PadKey.A);until(s=>s.shown===0);tap(PadKey.Start);until(s=>s.shown===10&&s.byte('_ce_character')===0);frames(gb,2);assertImage(gb,art('select-reimu'),label+' next-run reset');
  results.push({label,fixture:false,menuPixelMatch:true,noTextOverlay:true,cancelWrapReset:true,beforePages:[...pages],allDialoguePixelsMatch:true,lives:[...lives],gameoverPixelMatch:true,score:s.score,waitForInput:true,newRunReset:true});console.log(label,'passed');
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
