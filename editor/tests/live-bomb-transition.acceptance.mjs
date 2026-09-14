// Reduced HP/early boss fixture, actual Touhou art and presentation, ordinary input.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
const root=process.cwd(),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v18/transitions'),fixture=path.join(out,'fixture');fs.mkdirSync(fixture,{recursive:true});
if(!process.argv.includes('--reuse')){
 for(const d of['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,d),path.join(fixture,d),{recursive:true});
 const g=lib.readGame(root,'touhou-kouma'),b=g.bosses.find(b=>b.id==='rumia'),s=g.stages.find(s=>s.id==='stage-forest');
 g.name='live-bomb-test';g.stages=[s];g.stageOrder=[s.id];g.startStage=s.id;g.stageFade=false;g.bossCelebration=false;g.timeLimit=false;g.player.invulnerability=1024;g.startup.enabled=false;delete g.ending;
 b.phases=b.phases.slice(0,3);for(const [i,p]of b.phases.entries()){p.hp=20;p.threshold=i?0:2;p.motion={...p.motion,kind:'straight',vx:0,vy:0};}
 s.events=[{id:'boss',frame:0,kind:'boss',ref:b.id,x:80,y:36,count:1,spacing:0,interval:0,value:0}];s.presentation.enabled=false;s.presentation.characterDialogues?.forEach(v=>v.before.enabled=false);
 fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});if(fs.existsSync(path.join(fixture,'projects/live-bomb-test')))lib.saveGame(fixture,g.name,g);else lib.createProject(fixture,g.name,'LIVE BOMB',g);lib.compile(fixture,g.name,'Debug',()=>{});
}
const file=path.join(fixture,'projects/live-bomb-test/build/Debug/live-bomb-test.gb'),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];
for(const mode of[GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of[0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+character;
 const snap=()=>{let m=memory(gb);if(m.ram[syms._ce_scene-0xc000]===1){settledTrace(gb,syms._ce_trace);m=memory(gb);}const r=m.ram,byte=n=>r[syms[n]-0xc000],t=syms._ce_trace-0xc000;let boss;for(let i=0;i<39;i++){const p=syms._ce_entities-0xc000+i*25;if(r[p]===2){boss={phase:r[p+4],hp:r[p+3]};break;}}return{ready:r[t]===67&&r[t+1]===69&&!r[t+22],scene:byte('_ce_scene'),boss,locked:byte('_ce_boss_invulnerable'),image:byte('_ce_bomb_image'),bombLeft:byte('_ce_bomb_left'),bombs:byte('_ce_bombs'),bullets:byte('_ce_bg_count'),intro:r.readUInt16LE(syms._ce_intro_left-0xc000),tick:r.readUInt16LE(syms._ce_state-0xc000)};};
 const until=(f,n=1800)=>{for(let i=0;i<n;i++){const s=snap();if(f(s))return s;frames(gb,1);}throw Error(label+' timeout '+f+' '+JSON.stringify(snap()));};const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};
 try{
  until(s=>s.ready&&s.scene===0);tap(PadKey.Start);until(s=>s.ready&&s.scene===10);if(character){tap(PadKey.Right);frames(gb,80);}tap(PadKey.A);until(s=>s.ready&&s.scene===1&&s.boss?.phase===1&&!s.locked);frames(gb,4);
  gb.key_press(PadKey.A);gb.key_press(PadKey.B);const first=until(s=>s.ready&&s.image);assert.deepEqual(first.boss,{phase:1,hp:0});assert.equal(first.locked,1);assert.equal(first.bombs,1);
  let ticks=0;for(let n=0;n<300;n++){const s=snap();if(!s.image)break;if(s.ready){assert.equal(s.scene,1);assert.equal(s.boss.phase,1);assert.equal(s.bullets,0);ticks++;}frames(gb,1);}assert.ok(ticks>15);
  const card=until(s=>s.scene===7&&s.boss?.phase===2&&s.intro>0);assert.equal(card.boss.hp,20);assert.equal(card.bombs,1);until(s=>s.ready&&s.scene===1&&s.boss?.phase===2&&!s.locked);assert.equal(snap().bombs,1);
  gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);frames(gb,5);gb.key_press(PadKey.A);gb.key_press(PadKey.B);const last=until(s=>s.ready&&s.image);assert.equal(last.boss,undefined);assert.equal(last.bombs,0);
  let victoryWait=0;for(let n=0;n<300;n++){const s=snap();if(!s.image)break;if(s.ready){assert.equal(s.scene,1);assert.equal(s.boss,undefined);victoryWait++;}frames(gb,1);}assert.ok(victoryWait>15);
  until(s=>s.scene===9);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);frames(gb,8);const pages=new Set();let score=false;
  for(let n=0;n<1800;n++){const s=snap();if(s.scene===6){score=true;break;}assert.equal(s.scene,9);const r=memory(gb).ram;pages.add(r[syms._ce_dialogue_page-0xc000]);if(n%40<20)gb.key_press(PadKey.A);else gb.key_lift(PadKey.A);frames(gb,1);}assert.ok(score);assert.ok(pages.size>=4);
  results.push({label,phaseWait:true,cutInHp:card.boss.hp,heldChordSingleActivation:true,victoryWait:true,victoryPages:pages.size,scoreAfterDialogue:true});console.log(label+' passed');
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,fixture:'Rumia at tick 0, stationary, entry plus two 20HP phases; startup/ending disabled; no runtime/RAM patching',results},null,2));
