// Production ROM + normal input. Every stage / character, no RAM writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
import {capture,overlay,assertImage,expectedColorScreen} from './presentation-qa.mjs';
const file=path.resolve(process.argv[2]??'projects/touhou-kouma/build/Debug/touhou-kouma.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v19/menu'),lib=createRequire(import.meta.url)('../build/library.cjs'),g=lib.readGame(process.cwd(),'touhou-kouma'),font=lib.readFont(process.cwd());
const rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];fs.mkdirSync(out,{recursive:true});
function expected(screen,pixels){const color=expectedColorScreen(g,screen,font,pixels),p=pixels??[...g.assets.find(a=>a.id===screen.background).frames[0].pixels];for(const t of screen.items)overlay(p,font,t.text,t.x,t.y);p.cgb=color;return p;}
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1])for(let stage=0;stage<g.stageOrder.length;stage++){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+character+'-stage'+(stage+1);
 const snap=()=>{if(memory(gb).ram[syms._ce_scene-0xc000]===1)settledTrace(gb,syms._ce_trace);const r=memory(gb).ram,b=n=>r[syms[n]-0xc000],s=syms._ce_state-0xc000,t=syms._ce_trace-0xc000;return{ready:r[t]===67&&r[t+1]===69&&!r[t+22],scene:b('_ce_scene'),choice:b('_ce_title_choice'),selected:b('_ce_title_stage'),character:b('_ce_character'),stage:r[s+18],score:r.readUInt16LE(s+6),bombs:b('_ce_bombs')};};
 const until=(f,n=2200)=>{for(let i=0;i<n;i++){const s=snap();if(f(s))return s;frames(gb,1);}throw Error(label+' timeout '+JSON.stringify(snap()));};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,4);};
 const checkTitle=(choice,index)=>{frames(gb,2);const t=lib.titlePresentation(g,g.screens.find(s=>s.id==='title'),choice,index);assertImage(gb,expected(t.screen,t.pixels),label+' title');};
 try{
  until(s=>s.ready&&s.scene===0);assert.equal(snap().choice,0);checkTitle(0,0);
  tap(PadKey.Down);until(s=>s.choice===1);tap(PadKey.Left);assert.equal(snap().selected,g.stageOrder.length-1);checkTitle(1,g.stageOrder.length-1);
  gb.key_press(PadKey.Right);frames(gb,24);gb.key_lift(PadKey.Right);frames(gb,4);assert.equal(snap().selected,0,'held direction moves once');
  for(let i=0;i<stage;i++)tap(PadKey.Right);assert.equal(snap().selected,stage);checkTitle(1,stage);
  if(character===0&&stage===0)capture(gb,path.join(out,label+'-title.png'));
  tap(PadKey.A);until(s=>s.ready&&s.scene===10);
  if(stage===2&&character===0){tap(PadKey.B);until(s=>s.ready&&s.scene===0);assert.equal(snap().selected,stage);assert.equal(snap().choice,1);checkTitle(1,stage);tap(PadKey.Start);until(s=>s.ready&&s.scene===10);}
  if(character){tap(PadKey.Right);until(s=>s.ready&&s.character===1);}
  frames(gb,2);assertImage(gb,expected(lib.selectionPresentation(g,character)),label+' heading portrait');
  if(stage===0)capture(gb,path.join(out,label+'-character.png'));
  tap(PadKey.A);const playing=until(s=>s.ready&&s.scene===1);assert.equal(playing.stage,stage);assert.equal(playing.character,character);assert.equal(playing.bombs,2);assert.equal(playing.score,0);
  results.push({label,selectedStage:stage+1,character,exactTitlePixels:true,exactPortraitPixels:true,cancelPreserved:stage===2&&character===0,gameStarted:true});console.log(label+' passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));throw e;}finally{gb.free();}
}
// START must ignore the previously selected stage; SELECT still opens rankings.
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
 const gb=boot(rom,mode);const read=n=>memory(gb).ram[syms[n]-0xc000];const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,80);};
 frames(gb,1500);tap(PadKey.Select);assert.equal(read('_ce_scene'),4);tap(PadKey.B);assert.equal(read('_ce_scene'),0);tap(PadKey.Down);tap(PadKey.Left);assert.equal(read('_ce_title_stage'),6);tap(PadKey.Up);assert.equal(read('_ce_title_choice'),0);tap(PadKey.Start);assert.equal(read('_ce_scene'),10);tap(PadKey.A);assert.equal(read('_ce_scene'),1);assert.equal(memory(gb).ram[syms._ce_state-0xc000+18],0);gb.free();
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results,startAndRankingRegression:2},null,2));
