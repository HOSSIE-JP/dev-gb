// Selected heroine, six ten-second slides, real input and final bonus ordering.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';import {capture,assertImage,expectedColorScreen,expectedDialogue,overlay} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v13/ending'),fixture=path.join(out,'fixture');
const font=lib.readFont(root);
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
const game=lib.readGame(root,'touhou-kouma'),revision=lib.revision(game),stage=game.stages.find(s=>s.id===game.stageOrder.at(-1));const allStages=process.argv.includes('--all-stages');if(!allStages){game.stages=[stage];game.stageOrder=[stage.id];game.startStage=stage.id;}game.player.invulnerability=1024;game.bossCelebration=false;game.stageFade=false;
game.name='ending-test';for(const st of game.stages){const event=st.events.find(e=>e.kind==='boss');st.events=[{...event,frame:0,x:80,y:36}];}
for(const player of [game.player,...game.player.characters])Object.assign(game.patterns.find(p=>p.id===player.weapon),{kind:'straight',speed:8,interval:2,delay:0,angle:0,damage:1});
for(const b of game.bosses){b.hp=1;for(const p of b.phases){p.hp=1;p.motion={...p.motion,kind:'straight',vx:0,vy:0};}}
if(!fs.existsSync(path.join(fixture,'projects/ending-test')))lib.createProject(fixture,'ending-test',game.title,game);else lib.saveGame(fixture,'ending-test',game);
const report=process.argv.includes('--reuse')?{romPath:path.join(fixture,'projects/ending-test/build/Debug/ending-test.gb')}:lib.compile(fixture,'ending-test','Debug',()=>{}),rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map')),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1])for(const action of mode===GameBoyMode.Cgb?['auto','buttons']:['auto']){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu')+'-'+action,slides=lib.resolveEnding(game,character),seen=new Map(),pages=new Set(),dialogues=new Set(),cutins=new Set();let baseline,scoreSeen=false,done=false,buttonPhase=0;
 const snap=()=>{const r=memory(gb).ram,b=n=>r[syms[n]-0xc000],w=n=>r.readUInt16LE(syms[n]-0xc000),t=r.subarray(syms._ce_trace-0xc000);return {b,w,scene:b('_ce_scene'),ready:t[0]===67&&t[1]===69&&!t[22]&&t[17]===b('_ce_scene'),stage:r[syms._ce_state-0xc000+18],score:r.readUInt16LE(syms._ce_state-0xc000+6),slide:b('_ce_ending_slide'),left:w('_ce_ending_left')};};
 const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);},until=fn=>{for(let n=0;n<2000;n++){if(fn(snap()))return;frames(gb,1);}throw Error('menu timeout');};
 try{until(s=>s.scene===0&&s.ready);tap(PadKey.Start);until(s=>s.scene===10&&s.ready);if(character){tap(PadKey.Right);until(s=>s.b('_ce_character')===1&&s.ready);}tap(PadKey.A);
  for(let f=0;f<(allStages?40000:9500);f++){
   const s=snap();
   if(s.ready&&s.scene===7&&s.w("_ce_intro_left")>0){const ram=memory(gb).ram;for(let n=0;n<(syms._ce_state-syms._ce_entities)/25;n++){const e=syms._ce_entities-0xc000+n*25;if(ram[e]!==2)continue;const boss=game.bosses[ram[e+1]],phase=ram[e+4],intro=boss.phases[phase].intro,key=boss.id+"-"+phase;if(!cutins.has(key)){const name=[...intro.spellName],items=[{text:name.slice(0,18).join(""),x:1,y:14},{text:name.slice(18).join(""),x:1,y:16}],screen={id:"clear",background:intro.background,palette:0,items},expected=[...game.assets.find(a=>a.id===intro.background).frames[0].pixels];for(const t of items)overlay(expected,font,t.text,t.x,t.y);expected.cgb=expectedColorScreen(game,screen,font);assertImage(gb,expected,label+" cutin "+key);capture(gb,path.join(out,label+"-cutin-"+key+".png"));cutins.add(key);}break;}}
   if(s.ready&&(s.scene===5||s.scene===9)){const key=s.stage+"-"+s.scene+"-"+s.b("_ce_dialogue_page");if(!dialogues.has(key)){const st=game.stages.find(st=>st.id===game.stageOrder[s.stage]),p=lib.resolvePresentation(game,st,character);if(s.b("_ce_dialogue_page")<(s.scene===9?p.victoryDialogue.pages:p.dialogue).length){assertImage(gb,expectedDialogue(lib,game,font,p,s.scene===9,s.b("_ce_dialogue_page")),label+" dialogue "+key);capture(gb,path.join(out,label+"-dialogue-"+key+".png"));dialogues.add(key);}}}
   if(s.scene===11){
    gb.key_lift(PadKey.Start);
    if(action==='auto')gb.key_lift(PadKey.A);
    if(s.ready&&s.left>0&&s.left<=595){
     baseline??=s.score;assert.equal(s.score,baseline,'bonus waits for the entire ending');assert.equal(s.b('_ce_music_track'),34,'dedicated ending music');assert.ok(!scoreSeen);
     if(!seen.has(s.slide)){const expected=[...game.assets.find(a=>a.id===slides[s.slide].background).frames[0].pixels];expected.cgb=expectedColorScreen(game,{background:slides[s.slide].background,items:[]},{});assertImage(gb,expected,label+' slide '+s.slide);capture(gb,path.join(out,label+'-'+s.slide+'.png'));seen.set(s.slide,{first:f,last:f,firstLeft:s.left,lastLeft:s.left});}
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
    if(s.ready&&s.scene===6&&seen.size>0){assert.equal(pages.size,4);assert.equal(seen.size,action==='auto'?6:2);assert.ok(s.score>baseline,'final bonus is added after ending');assert.equal(s.b('_ce_music_track'),27);scoreSeen=true;}
    if(s.ready&&s.scene===4){assert.ok(scoreSeen);done=true;break;}
    if(s.scene===1||f%16<8)gb.key_press(PadKey.A);
   }
   frames(gb,1);
  }
  assert.ok(done,'ending returns to final ranking');if(action==='auto')for(const v of seen.values()){assert.ok(v.firstLeft>=592);assert.ok(v.lastLeft<=2);assert.ok(v.last-v.first>=589&&v.last-v.first<=599,'ten-second full display interval');}
  else assert.ok(seen.get(1).firstLeft-seen.get(1).lastLeft>=100,'held A does not skip another picture');
  assert.equal(dialogues.size,game.stages.reduce((n,st)=>{const p=lib.resolvePresentation(game,st,character);return n+(p.enabled?p.dialogue.length:0)+(p.victoryDialogue?.enabled?p.victoryDialogue.pages.length:0);},0),'all conversation pages checked');results.push({label,cutinImages:cutins.size,dialogueImages:dialogues.size,stageCount:game.stages.length,slides:[...seen],postbattlePages:pages.size,finalBonusAfterEnding:scoreSeen,rankingReached:done,buttonAdvanceAndSkip:action==='buttons'});console.log(label+' passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({state:snap(),seen:[...seen],pages:[...pages],buttonPhase}));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({authoredRevision:revision,rom:report.romPath,sha256:crypto.createHash('sha256').update(rom).digest('hex'),fixture:(allStages?'All stages':'Final stage only')+', instant stationary HP 1 bosses, fast player shots, invulnerability 1024, no fades or victory explosion. Original engine, art, dialogue and ten-second ending; real joypad inputs only.',results},null,2));
