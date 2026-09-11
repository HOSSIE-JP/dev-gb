// Damage-driven cut-ins and button-mashing/held-button score acceptance on real ROMs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
import {PNG} from '../node_modules/pngjs/lib/png.js';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs');
const out=path.resolve(process.argv[2]??path.join(root,'.cache/boss-presentation-qa')),source=path.resolve(process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:root);
fs.mkdirSync(out,{recursive:true});const fixture=path.join(out,'fixture');fs.mkdirSync(fixture,{recursive:true});
for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
const game=lib.readGame(source,'touhou-kouma'),boss=game.bosses.find(b=>b.id==='rumia'),stage=game.stages.find(s=>s.id==='stage-forest');
game.bosses=[boss];game.stages=[stage];game.stageOrder=[stage.id];game.startStage=stage.id;
game.stageFade=false;game.bossCelebration=false;game.timeLimit=false;game.player.invulnerability=1024;
boss.hp=2;for(const [i,p]of boss.phases.entries()) {p.hp=[2,2,3,1][i];p.threshold=i===0?2:0;p.pattern=i?'rumia-halo':'';p.attacks=[];p.motion={...p.motion,kind:'straight',vx:i?.25:0,vy:i?.125:0};}
stage.events=[{id:'boss',frame:0,kind:'boss',ref:boss.id,x:80,y:36,count:1,spacing:0,interval:0,value:0}];stage.presentation.enabled=false;
const weapon=game.patterns.find(p=>p.id===game.player.weapon);Object.assign(weapon,{kind:'straight',speed:8,interval:2,delay:0,angle:0,damage:20});
Object.assign(game.patterns.find(p=>p.id==='rumia-halo'),{delay:0,speed:.0625,interval:48});
game.enemies=game.enemies.slice(0,1);game.enemies[0].attacks=[];
game.patterns=game.patterns.filter(p=>[game.player.weapon,game.player.focusWeapon,game.enemies[0].pattern,'rumia-halo'].includes(p.id));
game.ending.slides=game.ending.slides.slice(0,1);
const ids=new Set([game.player.asset,game.effects.explosion,...game.patterns.map(p=>p.asset),...game.enemies.map(a=>a.asset),boss.asset,stage.tileset,...game.screens.map(s=>s.background),stage.presentation.dialogueBackground,stage.presentation.clearBackground,...boss.phases.map(p=>p.intro?.background),...game.ending.slides.map(s=>s.background)]);
game.assets=game.assets.filter(a=>ids.has(a.id));
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});
if(!fs.existsSync(path.join(fixture,'projects/boss-test')))lib.createProject(fixture,'boss-test',game.title,game);
else {game.name='boss-test';lib.saveGame(fixture,'boss-test',game);}
const report=process.argv.includes('--reuse')?{romPath:path.join(fixture,'projects/boss-test/build/Debug/boss-test.gb')}:lib.compile(fixture,'boss-test','Debug',()=>{}),rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map')),results=[];
const capture=(gb,file)=>{const p=new PNG({width:160,height:144}),rgb=gb.frame_buffer_eager();for(let i=0;i<160*144;i++){p.data.set(rgb.subarray(i*3,i*3+3),i*4);p.data[i*4+3]=255;}fs.writeFileSync(file,PNG.sync.write(p));};
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]) {
 const gb=boot(rom,mode),label=mode===GameBoyMode.Dmg?'DMG':'CGB',cards=new Map(),breaks=new Map(),returns=new Set(),victoryPages=new Set();let lastScene=0,clearStart=-1,heldAt=-1,exited=false,lastState,peak=0,victoryHold=0,victoryScore;
 try {
  frames(gb,240);gb.key_press(PadKey.Start);frames(gb,2);gb.key_lift(PadKey.Start);
  for(let frame=0;frame<4000;frame++) {
   const m=memory(gb).ram,byte=n=>m[syms[n]-0xc000],word=n=>m.readUInt16LE(syms[n]-0xc000),scene=byte('_ce_scene'),left=word('_ce_intro_left');
   const e=syms._ce_entities-0xc000,phase=m[e+4];peak=Math.max(peak,byte('_ce_bg_count'));
   if(scene===8&&m[syms._ce_trace-0xc000+22]===0){
    const state=byte('_ce_transition_state'),hp=m[e+3],tick=word('_ce_state'),fx=Array.from({length:39},(_,i)=>m[e+i*25]).filter(n=>n===5).length;
    assert.equal(hp,0);assert.equal(byte('_ce_boss_invulnerable'),1);assert.equal(byte('_ce_bg_count'),0);
    if(!breaks.has(phase))breaks.set(phase,{tick,x:m.readInt16LE(e+12),y:m.readInt16LE(e+14),frames:0});
    const event=breaks.get(phase);assert.equal(tick,event.tick,'transition does not advance gameplay');
    if(state===1){assert.equal(fx,1,'exactly one break effect');event.frames++;if(event.frames===4)capture(gb,path.join(out,label+'-break-'+phase+'.png'));}
    if(state===2){assert.equal(fx,0);returns.add(phase);if(m.readInt16LE(e+12)===80*16&&m.readInt16LE(e+14)===36*16)event.returned=true;}
   }
   if(scene===7&&left>0) {
    const phase=m[syms._ce_entities-0xc000+4],hp=m[syms._ce_entities-0xc000+3],tick=word('_ce_state');
    if(!cards.has(phase)){cards.set(phase,{first:frame,last:frame,hp,tick,frames:0});capture(gb,path.join(out,label+'-cutin-'+phase+'.png'));}
    const c=cards.get(phase);if(c.frames<3){const io=memory(gb).io;assert.ok((io[0x26]&9)===9,'cut-in starts pulse and noise decay');assert.equal(io[0x12],0xf4);assert.equal(io[0x21],0xc4);}assert.equal(hp,c.hp,'boss HP freezes throughout cut-in');assert.equal(hp,[2,2,3,1][phase],'next HP fully resets despite overkill');assert.equal(m.readInt16LE(e+12),80*16);assert.equal(m.readInt16LE(e+14),36*16);assert.equal(tick,c.tick,'game clock freezes');assert.equal(byte('_ce_boss_invulnerable'),1);assert.equal(byte('_ce_bg_count'),0);c.last=frame;c.frames++;
    if(c.frames===10)capture(gb,path.join(out,label+'-cutin-'+phase+'.png'));
   }
   if(scene===9){
    const ready=m[syms._ce_trace-0xc000+22]===0;
    if(ready&&byte('_ce_dialogue_page')<4){victoryPages.add(byte('_ce_dialogue_page'));
    const score=m.readUInt16LE(syms._ce_state-0xc000+6);if(victoryScore===undefined)victoryScore=score;assert.equal(score,victoryScore,'bonus is not calculated before dialogue ends');}
    if(victoryHold<60){gb.key_press(PadKey.A);if(ready){++victoryHold;assert.equal(byte('_ce_dialogue_page'),0,'held shooting input cannot skip the first victory page');}}
    else if(frame%4<2)gb.key_lift(PadKey.A);else gb.key_press(PadKey.A);
    if(victoryHold===30)capture(gb,path.join(out,label+'-victory-dialogue.png'));
   } else if(scene===6) {
    assert.equal(victoryPages.size,4,'all victory dialogue pages precede score');
    const wait=word('_ce_clear_wait_left');
    if(wait>0&&wait<120&&clearStart<0){clearStart=frame;capture(gb,path.join(out,label+'-score.png'));}
    if(wait<=6&&clearStart>=0){gb.key_press(PadKey.A);if(!wait&&heldAt<0)heldAt=frame;}
    else if(frame%2)gb.key_press(PadKey.A);else gb.key_lift(PadKey.A);
    if(heldAt>=0&&frame-heldAt>=60){assert.equal(scene,6,'held A never accepts score screen');gb.key_lift(PadKey.A);frames(gb,2);gb.key_press(PadKey.A);frames(gb,3);gb.key_lift(PadKey.A);frames(gb,8);exited=memory(gb).ram[syms._ce_scene-0xc000]!==6;break;}
   } else {
    assert.ok(clearStart<0||lastScene!==6,'mashing did not dismiss score prematurely');
    if(scene===1)gb.key_press(PadKey.A);else if(frame%2)gb.key_press(PadKey.A);else gb.key_lift(PadKey.A);
   }
   lastScene=scene;const regs=gb.registers();lastState={frame,scene,left,pc:regs.pc,sp:regs.sp,ram:Buffer.from(m).toString('base64')};regs.free();frames(gb,1);
  }
  assert.equal(cards.size,3,'all three damage phases announce their own spell');
  for(const c of cards.values())assert.ok(c.frames>=71&&c.frames<=73,'authored 1.20-second timer uses VBlanks');
  assert.ok(peak>0,'real BG shots existed before phase depletion');assert.equal(breaks.size,2);assert.equal(returns.size,2);for(const b of breaks.values()){assert.ok(b.frames>0);assert.ok(b.returned,'boss visibly reaches the configured return position');}
  assert.ok(heldAt-clearStart>=118,'at least 120 VBlanks from counting completion to accepting input');assert.ok(exited,'fresh A accepts after the wait');
  results.push({mode:label,cards:[...cards.values()],breaks:[...breaks.values()],returnPhases:[...returns],victoryPages:[...victoryPages],victoryHeldFrames:victoryHold,peakBgBullets:peak,scoreWaitFrames:heldAt-clearStart,heldButtonFrames:60,freshPressAccepted:exited});
 } catch(error){fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify(lastState));console.error(label,'primary failure:',error);throw error;} finally{try{gb.free();}catch(error){console.error('Emulator cleanup failed:',error.message);}}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:report.romPath,results},null,2));console.log(JSON.stringify(results,null,2));
