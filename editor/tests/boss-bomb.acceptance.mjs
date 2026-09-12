// Ordinary inputs in a reduced-HP encounter; engine and phase/presentation logic are unmodified.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v10/boss-bomb'),fixture=path.join(out,'fixture');
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});for(const d of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,d),path.join(fixture,d),{recursive:true});
const g=lib.readGame(root,'touhou-kouma'),b=g.bosses.find(b=>b.id==='rumia'),s=g.stages.find(s=>s.id==='stage-forest');
g.name='bomb-test';g.stages=[s];g.stageOrder=[s.id];g.startStage=s.id;g.stageFade=false;g.bossCelebration=false;g.timeLimit=false;g.player.invulnerability=1024;
for(const [i,p]of b.phases.entries()){p.hp=20;p.threshold=i?0:2;p.motion={...p.motion,kind:'straight',vx:0,vy:0};}
s.events=[{id:'boss',frame:0,kind:'boss',ref:b.id,x:80,y:36,count:1,spacing:0,interval:0,value:0}];s.presentation.enabled=false;
s.presentation.characterDialogues?.forEach(v=>v.before.enabled=false);
if(!fs.existsSync(path.join(fixture,'projects/bomb-test')))lib.createProject(fixture,'bomb-test',g.title,g);else lib.saveGame(fixture,'bomb-test',g);
const report=process.argv.includes('--reuse')?{romPath:path.join(fixture,'projects/bomb-test/build/Debug/bomb-test.gb')}:lib.compile(fixture,'bomb-test','Debug',()=>{}),rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map')),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+character;
 const snap=()=>{let m=memory(gb);if(m.ram[syms._ce_scene-0xc000]===1){settledTrace(gb,syms._ce_trace);m=memory(gb);}const r=m.ram,byte=n=>r[syms[n]-0xc000],e=syms._ce_entities-0xc000;return {scene:byte('_ce_scene'),phase:r[e+4],hp:r[e+3],locked:byte('_ce_boss_invulnerable'),bombs:byte('_ce_bombs'),bullets:byte('_ce_bg_count'),left:r.readUInt16LE(syms._ce_intro_left-0xc000),tick:r.readUInt16LE(syms._ce_state-0xc000)};};
 const until=(f,n=1600)=>{for(let i=0;i<n;i++){const s=snap();if(f(s))return s;frames(gb,1);}throw Error(label+' timeout '+f+' '+JSON.stringify(snap()));};
 const release=()=>{gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);frames(gb,4);};
 const tap=k=>{gb.key_press(k);frames(gb,2);gb.key_lift(k);frames(gb,2);};
 try{
  frames(gb,240);tap(PadKey.Start);until(s=>s.scene===10);frames(gb,4);if(character)tap(PadKey.Right);tap(PadKey.A);
  const phases=[];
  for(let phase=1;phase<=2;phase++){
   release();until(s=>s.scene===1&&s.phase===phase&&!s.locked&&s.bullets>0);
   const before=snap();gb.key_press(PadKey.A);gb.key_press(PadKey.B);until(s=>s.scene===11);
   const hit=snap();assert.equal(hit.hp,0);assert.equal(hit.phase,phase);assert.equal(hit.bombs,2-phase);assert.equal(hit.bullets,0);assert.equal(hit.locked,1);
   until(s=>s.scene===7&&s.phase===phase+1&&s.left>0);const card=snap();assert.equal(card.hp,20,'bomb overkill cannot damage the next phase');assert.equal(card.bombs,2-phase);assert.equal(card.locked,1);assert.equal(card.bullets,0);
   until(s=>s.scene===1&&s.phase===phase+1&&!s.locked);assert.equal(snap().bombs,2-phase,'held chord cannot fire again through the cut-in');
   phases.push({from:phase,to:phase+1,bulletsCleared:before.bullets,hpAfterBomb:hit.hp,nextHp:card.hp,stock:hit.bombs});
  }
  release();gb.key_press(PadKey.B);until(s=>s.scene===9,3000);assert.equal(snap().bombs,0);release();
  const pages=new Set();let score=false;for(let n=0;n<1400;n++){const s=snap();if(s.scene===6){score=true;break;}assert.equal(s.scene,9);const r=memory(gb).ram;if(r[syms._ce_dialogue_page-0xc000]<4)pages.add(r[syms._ce_dialogue_page-0xc000]);if(n%40<20)gb.key_press(PadKey.A);else gb.key_lift(PadKey.A);frames(gb,1);}
  assert.ok(score);assert.equal(pages.size,4);results.push({label,phases,victoryPages:pages.size,scoreAfterDialogue:true});
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:report.romPath,fixture:'Rumia at frame 0, stationary, 20 HP per phase, 1024-update initial invulnerability; real inputs, no engine patches or RAM writes.',results},null,2));console.log(JSON.stringify(results,null,2));
