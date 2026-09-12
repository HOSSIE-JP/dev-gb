// Authored campaign, no fixture edits or memory writes. Real losses and restart.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {capture,assertImage,overlay} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),game=lib.readGame(root,'touhou-kouma'),glyphs=lib.readFont(root),file=path.resolve(process.argv[2]??'projects/touhou-kouma/build/Debug/touhou-kouma.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v16/production-play'),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];fs.mkdirSync(out,{recursive:true});
for(const mode of[GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of[0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu');let displayFrame=0;
 const snap=()=>{let m=memory(gb);if(m.ram[syms._ce_scene-0xc000]===1){settledTrace(gb,syms._ce_trace);m=memory(gb);}const r=m.ram,b=n=>r[syms[n]-0xc000],w=n=>r.readUInt16LE(syms[n]-0xc000),s=syms._ce_state-0xc000,t=syms._ce_trace-0xc000;return{r,scene:b('_ce_scene'),ready:r[t]===67&&r[t+1]===69&&!r[t+22],stage:r[s+18],lives:r[s+19],stageTick:r.readUInt16LE(s+2),score:r.readUInt16LE(s+6),x:r.readInt16LE(s+14),y:r.readInt16LE(s+16),battle:b('_ce_battle_mode'),character:b('_ce_character'),bombs:b('_ce_bombs'),pause:b('_ce_pause'),left:w('_ce_continue_left'),generation:w('_ce_save_generation'),scores:Array.from({length:5},(_,i)=>r.readUInt16LE(syms._ce_scores-0xc000+i*2))};};
 const frame=()=>{frames(gb,1);displayFrame++;};const until=(f,n=1600)=>{for(let i=0;i<n;i++){const s=snap();if(f(s))return s;frame();}throw Error(label+' timeout '+f+' '+JSON.stringify({...snap(),r:undefined}));};const tap=k=>{gb.key_press(k);for(let i=0;i<3;i++)frame();gb.key_lift(k);for(let i=0;i<3;i++)frame();};
 try{
 until(s=>s.scene===0&&s.ready);tap(PadKey.Start);until(s=>s.scene===10&&s.ready);if(character){tap(PadKey.Right);until(s=>s.character===1&&s.ready);}tap(PadKey.A);until(s=>s.scene===1&&s.ready);
 const lives=new Set([snap().lives]);let lost=null;
 for(let n=0;n<25000;n++){
  const s=snap();lives.add(s.lives);for(const k of[PadKey.Up,PadKey.Down,PadKey.Left,PadKey.Right,PadKey.A])gb.key_lift(k);
  if(s.scene===14&&s.ready){lost=s;break;}
  if(s.scene===5){if(n%30<15)gb.key_press(PadKey.A);}
  else if(s.scene===1&&s.battle){
   const e=syms._ce_entities-0xc000;for(let i=0;i<39;i++)if(s.r[e+i*25]===2){const dx=s.r.readInt16LE(e+i*25+12)-s.x,dy=s.r.readInt16LE(e+i*25+14)-s.y;if(dy>48)gb.key_press(PadKey.Down);if(dy < -48)gb.key_press(PadKey.Up);if(dx>48)gb.key_press(PadKey.Right);if(dx < -48)gb.key_press(PadKey.Left);break;}
  }else if(s.scene===1&&n<1600)gb.key_press(PadKey.A);
  frame();
 }
 assert.ok(lost,'all lives lost through normal collisions');assert.equal(lost.lives,0);assert.ok(lost.score>0,'earned score through shooting');assert.equal(lives.size,game.player.lives+1);assert.deepEqual(lost.scores,[lost.score,0,0,0,0]);const deathFrame=displayFrame;capture(gb,path.join(out,label+'-death.png'));
 const offer=until(s=>s.scene===13&&s.ready);assert.ok(displayFrame-deathFrame>=58);assert.equal(offer.stageTick,lost.stageTick);for(let i=0;i<3;i++)frame();
 const art=lib.gameOverPresentation(game,character),expected=[...art.pixels];for(const item of art.screen.items){overlay(expected,glyphs,item.text,item.x,item.y);if(item.binding!=='none')overlay(expected,glyphs,item.binding==='score'?String(lost.score).padStart(5,'0'):'10',item.x+item.text.length,item.y);}assertImage(gb,expected,label+' portrait score and continue timer');capture(gb,path.join(out,label+'-menu.png'));
 const saved=Buffer.from(gb.ram_data_eager()),reboot=boot(rom,mode);reboot.set_ram_data(saved);frames(reboot,1000);assert.equal(memory(reboot).ram.readUInt16LE(syms._ce_scores-0xc000),lost.score,'ranking persisted before reset');reboot.free();
 until(s=>s.left<=60&&s.left>0);gb.key_press(PadKey.A);const resumed=until(s=>s.scene===1&&s.ready);assert.equal(resumed.stage,lost.stage);assert.equal(resumed.score,0);assert.equal(resumed.lives,game.player.lives);assert.equal(resumed.bombs,2);assert.equal(resumed.character,character);assert.ok(resumed.stageTick<5);assert.equal(resumed.generation,lost.generation);gb.key_lift(PadKey.A);for(let i=0;i<3;i++)frame();capture(gb,path.join(out,label+'-resumed.png'));
 results.push({label,fixture:false,memoryWrites:false,lostStage:lost.stage,lives:[...lives],lostScore:lost.score,rankingPersistedBeforeChoice:true,menuPixelMatch:true,sameCharacter:true,restartedStage:resumed.stage,restartedScore:resumed.score,restartedLives:resumed.lives,restartedBombs:resumed.bombs,frames:displayFrame});console.log(label+' passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({...snap(),r:undefined}));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),projectRevision:lib.revision(game),results},null,2));
