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
