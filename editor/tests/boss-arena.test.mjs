import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=path.resolve(import.meta.dirname,'../..');
const game=()=>{const g=lib.readGame(root,'star-caravan'),a=structuredClone(g.assets[0]);Object.assign(a,{id:'test-cut-in',kind:'screen',width:160,height:144});a.frames=[{id:'art',image:'images/test-cut-in.png',duration:8,pixels:Array(160*144).fill(0)}];g.assets.push(a);return g;};
test('boss arena validates capacity, cut-in art, name, duration and score wait',()=>{
 const g=game(),b=g.bosses[0];b.battle={background:'bg-bullets',maxBullets:64};
 b.phases[0].intro={enabled:true,background:'test-cut-in',spellName:'Spell',seconds:.75};
 assert.equal(lib.validate(g).filter(d=>d.severity==='error').length,0);
 for(const mutate of [()=>b.battle.maxBullets=65,()=>b.battle.background='broken',()=>b.phases[0].intro.seconds=0,()=>b.phases[0].intro.spellName='',()=>b.phases[0].intro.background='missing']){
  const save=structuredClone(b);mutate();assert.ok(lib.validate(g).some(d=>d.severity==='error'));Object.assign(b,save);
 }
 g.stages[0].presentation={enabled:false,dialogueBackground:'',clearBackground:'',rightPalette:0,dialogue:[],clearEnabled:false,baseBonus:0,lifeBonus:0,noMissBonus:0,clearWaitSeconds:0};
 assert.ok(lib.validate(g).some(d=>d.severity==='error'));g.stages[0].presentation.clearWaitSeconds=2;assert.equal(lib.validate(g).filter(d=>d.severity==='error').length,0);
});
test('boss overlay preserves sprites that are also used by regular enemies or bullets',()=>{
 const g=game(),b=g.bosses[0],layout=lib.spriteLayout(g);assert.ok(layout.overlay.has(b.asset));
 g.enemies[0].asset=b.asset;const mixed=lib.spriteLayout(g);assert.ok(!mixed.overlay.has(b.asset));
 assert.ok(mixed.offsets.has(b.asset));assert.ok(mixed.tiles>=layout.tiles);
});
test('preview clears bullets and freezes game time for the whole cut-in',()=>{
 const g=game(),sim=new lib.Simulation(g),p=g.bosses[0].phases[0];
 p.intro={enabled:true,background:g.screens[0].background,spellName:'Spell',seconds:.75};
 sim.bgShots=[{x:800,y:800,vx:1,vy:1,life:50,damage:1}];
 sim.startIntro(p);const tick=sim.tick,x=sim.playerX;
 for(let n=0;n<45;n++)sim.step(17);
 assert.equal(sim.tick,tick);assert.equal(sim.playerX,x);assert.equal(sim.bgShots.length,0);assert.equal(sim.introLeft,0);
 sim.step(0);assert.equal(sim.tick,tick+1);
});

test('phase HP overkill clears combat, breaks once, returns invulnerable and refills only the next phase',()=>{
 const g=game(),b=g.bosses[0];g.stages[0].events=[];g.timeLimit=false;
 b.battle={background:'bg-bullets',maxBullets:64,returnX:80,returnY:36};
 const phase=structuredClone(b.phases[0]);Object.assign(phase,{until:'hp',threshold:0,hp:2,pattern:'',attacks:[],intro:undefined,motion:{...phase.motion,kind:'straight',vx:0,vy:0}});
 b.phases=[phase,{...structuredClone(phase),id:'next',hp:5,intro:{enabled:true,background:'test-cut-in',spellName:'Next',seconds:1.2}}];
 const sim=new lib.Simulation(g);sim.spawnActor(b.id,'boss',130,70);const boss=sim.entities.find(e=>e.kind==='boss');
 sim.bgShots=[{slot:0,ref:g.patterns[0].id,angle:8,x:0,y:0,vx:0,vy:0,life:100,damage:1}];
 const weapon=g.patterns.find(p=>p.id===g.player.weapon);
 sim.add({...structuredClone(boss),kind:'pshot',ref:weapon.id,asset:weapon.asset,damage:20,lifetime:100});
 sim.step(0);assert.equal(boss.hp,0);assert.equal(boss.phase,0);assert.equal(sim.bossDefeated,false);assert.equal(sim.bgShots.length,0);assert.equal(sim.phaseLocked,true);
 sim.step(0);assert.equal(sim.transition.stage,'break');assert.equal(sim.entities.filter(e=>e.kind==='fx').length,1);
 const tick=sim.tick,playerX=sim.playerX;
 for(let n=0;n<g.effects.duration;n++){sim.step(17);assert.equal(boss.hp,0);}
 assert.equal(sim.transition.stage,'return');assert.equal(sim.entities.filter(e=>e.kind==='fx').length,0);
 for(let n=0;n<32;n++){sim.step(17);assert.equal(boss.hp,0);assert.equal(sim.phaseLocked,true);}
 sim.step(17);assert.equal(boss.phase,1);assert.equal(boss.hp,5);assert.equal(boss.x,80*16);assert.equal(boss.y,36*16);assert.equal(sim.introLeft,72);
 for(let n=0;n<72;n++)sim.step(17);
 assert.equal(sim.tick,tick);assert.equal(sim.playerX,playerX);assert.equal(sim.phaseLocked,false);assert.equal(sim.introLeft,0);
 sim.add({...structuredClone(boss),kind:'pshot',ref:weapon.id,asset:weapon.asset,damage:20,lifetime:100});sim.step(0);assert.equal(sim.bossDefeated,true,'only the final phase depletion defeats the boss');
});

test('authored phase HP and victory dialogue reject values that cannot reach the ROM safely',()=>{
 const g=game(),b=g.bosses[0];b.phases[0].hp=256;
 assert.ok(lib.validate(g).some(d=>d.severity==='error'));b.phases[0].hp=2;b.phases[0].until='hp';b.phases[0].threshold=1;
 assert.ok(lib.validate(g).some(d=>d.severity==='error'));b.phases[0].threshold=0;
 g.stages[0].presentation={enabled:false,dialogueBackground:'',clearBackground:'',rightPalette:0,dialogue:[],clearEnabled:false,baseBonus:0,lifeBonus:0,noMissBonus:0,victoryDialogue:{enabled:true,background:'test-cut-in',pages:[{id:'one',speaker:'Reimu',line1:'Done',line2:''}]}};
 assert.equal(lib.validate(g).filter(d=>d.severity==='error').length,0);
 const v=g.stages[0].presentation.victoryDialogue;v.pages[0].line1='1234567890123456789';assert.ok(lib.validate(g).some(d=>d.severity==='error'));v.pages[0].line1='Done';v.background='missing';assert.ok(lib.validate(g).some(d=>d.severity==='error'));
 v.background='test-cut-in';Object.assign(b.phases.at(-1),{hp:2,until:'time'});assert.ok(lib.validate(g).some(d=>d.severity==='error'),'timed invulnerable phases need a successor');
});
