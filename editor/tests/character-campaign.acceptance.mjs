// Complete character-specific dialogue linkage. Only encounter timing/HP is accelerated.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
import {capture,assertImage,backgroundPixels,expectedDialogue} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:'.cache/kouma-v11/campaign'),fixture=path.join(out,'fixture');
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
const game=lib.readGame(root,'touhou-kouma'),revision=lib.revision(game);game.name='character-test';game.player.invulnerability=1024;game.bossCelebration=false;
for(const player of [game.player,...game.player.characters])Object.assign(game.patterns.find(p=>p.id===player.weapon),{kind:'straight',speed:8,interval:2,delay:0,angle:0,damage:1});
for(const b of game.bosses){b.hp=1;for(const [i,p]of b.phases.entries()){p.hp=1;p.threshold=i===0?2:0;p.motion={...p.motion,kind:'straight',vx:0,vy:0};}}
for(const s of game.stages){const e=s.events.find(e=>e.kind==='boss');s.events=[{...e,frame:0,x:80,y:36}];}
if(!fs.existsSync(path.join(fixture,'projects/character-test')))lib.createProject(fixture,'character-test',game.title,game);else lib.saveGame(fixture,'character-test',game);
const report=process.argv.includes('--reuse')?{romPath:path.join(fixture,'projects/character-test/build/Debug/character-test.gb')}:lib.compile(fixture,'character-test','Debug',()=>{}),rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map')),glyphs=lib.readFont(root),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu'),pages=new Set(),scores=new Set(),cutins=new Set();let done=false;
 const snap=()=>{const r=memory(gb).ram,byte=n=>r[syms[n]-0xc000],trace=r.subarray(syms._ce_trace-0xc000);return {r,byte,scene:byte('_ce_scene'),shown:trace[22]?255:trace[17],stage:trace[4],page:byte('_ce_dialogue_page')};};
 const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};
 const until=f=>{for(let n=0;n<1500;n++){if(f(snap()))return;frames(gb,1);}throw Error('menu timeout');};
 try{
  frames(gb,240);tap(PadKey.Start);until(s=>s.shown===10);frames(gb,2);if(character){tap(PadKey.Right);until(s=>s.shown===10&&s.byte('_ce_character')===1);}tap(PadKey.A);
  for(let f=0;f<20000;f++){
   const s=snap();gb.key_lift(PadKey.A);
   if((s.shown===5||s.shown===9)&&s.scene===s.shown&&s.page<4){
    const key=s.stage+'-'+s.shown+'-'+s.page;
    if(!pages.has(key)){
     frames(gb,2);const stage=game.stages.find(t=>t.id===game.stageOrder[s.stage]),p=lib.resolvePresentation(game,stage,character);
     assertImage(gb,expectedDialogue(lib,game,glyphs,p,s.shown===9,s.page),label+' '+stage.id+' '+key);
     if(s.page===0)capture(gb,path.join(out,label+'-'+stage.id+(s.shown===9?'-after':'-before')+'.png'));
     pages.add(key);
    }
   }
   if(s.shown===6&&s.scene===6&&!scores.has(s.stage)){
    for(let page=0;page<4;page++)assert.ok(pages.has(s.stage+'-9-'+page),'all postbattle pages precede score');
    frames(gb,2);const stage=game.stages.find(t=>t.id===game.stageOrder[s.stage]),p=lib.resolvePresentation(game,stage,character),expected=lib.dialoguePixels(game,p.clearBackground,p.victoryDialogue?.portrait)??game.assets.find(a=>a.id===p.clearBackground).frames[0].pixels;
    assert.deepEqual(backgroundPixels(gb).slice(8*160,96*160),expected.slice(8*160,96*160),'score retains selected winner');capture(gb,path.join(out,label+'-'+stage.id+'-score.png'));scores.add(s.stage);
   }
   if(s.scene===7&&s.r.readUInt16LE(syms._ce_intro_left-0xc000)===35)cutins.add(s.r[syms._ce_state-0xc000+18]+'-'+s.r[syms._ce_entities-0xc000+4]);
   if(s.shown===(game.ending.scoreAfter?4:3)){done=true;break;}
   if(s.scene===1||((s.scene!==5&&s.scene!==9)||pages.has(s.stage+'-'+s.scene+'-'+s.page))&&f%30<15)gb.key_press(PadKey.A);frames(gb,1);
  }
  assert.equal(pages.size,56);assert.equal(scores.size,7);assert.equal(cutins.size,21);assert.ok(done);
  results.push({label,pages:[...pages],pixelVerifiedPages:pages.size,stages:7,scorePortraitsVerified:scores.size,cutins:cutins.size,endingReached:true});console.log(label,'56 conversation pages and 7 score portraits verified');
 }catch(error){capture(gb,path.join(out,label+'-failure.png'));throw error;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:report.romPath,sha256:crypto.createHash('sha256').update(rom).digest('hex'),authoredRevision:revision,fixture:'All original art, pages, music, phases and engine. Bosses enter at frame 0, stationary with HP 1; player weapons accelerated, initial invulnerability 1024, victory explosion disabled. Real inputs only; not an unmodified full-game clear.',results},null,2));
