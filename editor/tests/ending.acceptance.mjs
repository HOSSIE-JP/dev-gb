// Selected heroine, six ten-second slides, real input and final bonus ordering.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';import {capture,assertImage} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v13/ending'),fixture=path.join(out,'fixture');
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
const game=lib.readGame(root,'touhou-kouma'),revision=lib.revision(game),stage=game.stages.find(s=>s.id===game.stageOrder.at(-1));game.stages=[stage];game.stageOrder=[stage.id];game.startStage=stage.id;game.player.invulnerability=1024;game.bossCelebration=false;game.stageFade=false;
game.name='ending-test';const event=stage.events.find(e=>e.kind==='boss');stage.events=[{...event,frame:0,x:80,y:36}];
for(const player of [game.player,...game.player.characters])Object.assign(game.patterns.find(p=>p.id===player.weapon),{kind:'straight',speed:8,interval:2,delay:0,angle:0,damage:1});
for(const b of game.bosses){b.hp=1;for(const p of b.phases){p.hp=1;p.motion={...p.motion,kind:'straight',vx:0,vy:0};}}
if(!fs.existsSync(path.join(fixture,'projects/ending-test')))lib.createProject(fixture,'ending-test',game.title,game);else lib.saveGame(fixture,'ending-test',game);
const report=process.argv.includes('--reuse')?{romPath:path.join(fixture,'projects/ending-test/build/Debug/ending-test.gb')}:lib.compile(fixture,'ending-test','Debug',()=>{}),rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map')),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1])for(const action of mode===GameBoyMode.Cgb?['auto','buttons']:['auto']){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu')+'-'+action,slides=lib.resolveEnding(game,character),seen=new Map(),pages=new Set();let baseline,scoreSeen=false,done=false,buttonPhase=0;
 const snap=()=>{const r=memory(gb).ram,b=n=>r[syms[n]-0xc000],w=n=>r.readUInt16LE(syms[n]-0xc000),t=r.subarray(syms._ce_trace-0xc000);return {b,w,scene:b('_ce_scene'),ready:!t[22]&&t[17]===b('_ce_scene'),score:r.readUInt16LE(syms._ce_state-0xc000+6),slide:b('_ce_ending_slide'),left:w('_ce_ending_left')};};
 const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);},until=fn=>{for(let n=0;n<2000;n++){if(fn(snap()))return;frames(gb,1);}throw Error('menu timeout');};
 try{frames(gb,240);tap(PadKey.Start);until(s=>s.scene===10&&s.ready);if(character){tap(PadKey.Right);until(s=>s.b('_ce_character')===1&&s.ready);}tap(PadKey.A);
  for(let f=0;f<9500;f++){
   const s=snap();
   if(s.scene===11){
    gb.key_lift(PadKey.Start);
    if(action==='auto')gb.key_lift(PadKey.A);
    if(s.ready&&s.left>0&&s.left<=595){
     baseline??=s.score;assert.equal(s.score,baseline,'bonus waits for the entire ending');assert.equal(s.b('_ce_music_track'),34,'dedicated ending music');assert.ok(!scoreSeen);
     if(!seen.has(s.slide)){assertImage(gb,game.assets.find(a=>a.id===slides[s.slide].background).frames[0].pixels,label+' slide '+s.slide);capture(gb,path.join(out,label+'-'+s.slide+'.png'));seen.set(s.slide,{first:f,last:f,firstLeft:s.left,lastLeft:s.left});}
     const v=seen.get(s.slide);v.last=f;v.lastLeft=s.left;
     if(action==='buttons'){
      if(s.slide===0&&s.left<560){gb.key_press(PadKey.A);buttonPhase=1;}
      if(s.slide===1&&buttonPhase===1){gb.key_press(PadKey.A);if(s.left<500){buttonPhase=2;gb.key_lift(PadKey.A);}}
      if(s.slide===1&&buttonPhase===2&&s.left<490){gb.key_press(PadKey.Start);buttonPhase=3;}
     }
    }
   }else{
    gb.key_lift(PadKey.Start);gb.key_lift(PadKey.A);
    if(s.ready&&s.scene===9&&s.b('_ce_dialogue_page')<4)pages.add(s.b('_ce_dialogue_page'));
    if(s.ready&&s.scene===6){assert.equal(pages.size,4);assert.equal(seen.size,action==='auto'?6:2);assert.ok(s.score>baseline,'final bonus is added after ending');assert.equal(s.b('_ce_music_track'),27);scoreSeen=true;}
    if(s.ready&&s.scene===4){assert.ok(scoreSeen);done=true;break;}
    if(s.scene===1||f%16<8)gb.key_press(PadKey.A);
   }
   frames(gb,1);
  }
  assert.ok(done,'ending returns to final ranking');if(action==='auto')for(const v of seen.values()){assert.ok(v.firstLeft>=592);assert.ok(v.lastLeft<=2);assert.ok(v.last-v.first>=589&&v.last-v.first<=599,'ten-second full display interval');}
  else assert.ok(seen.get(1).firstLeft-seen.get(1).lastLeft>=100,'held A does not skip another picture');
  results.push({label,slides:[...seen],postbattlePages:pages.size,finalBonusAfterEnding:scoreSeen,rankingReached:done,buttonAdvanceAndSkip:action==='buttons'});console.log(label+' passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({state:snap(),seen:[...seen],pages:[...pages],buttonPhase}));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({authoredRevision:revision,rom:report.romPath,sha256:crypto.createHash('sha256').update(rom).digest('hex'),fixture:'Final stage only, instant stationary HP 1 boss, fast player shots, invulnerability 1024, no fades or victory explosion. Original engine, art, dialogue and ten-second ending; real joypad inputs only.',results},null,2));
