import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),game=()=>lib.readGame(process.cwd(),'touhou-kouma');
test('side barrages occupy lower-half lanes without increasing the boss bullet ceiling',()=>{
 const g=game(),side=g.patterns.filter(p=>p.launch&&['left','right','both','alternate'].includes(p.launch.kind));assert.equal(side.length,4);
 for(const p of side)for(let sequence=0;sequence<12;sequence++)for(const point of lib.launchPoints(p,g.assets.find(a=>a.id==='fairy'),80*16,20*16,sequence)){assert.ok(point.y>=80*16&&point.y<=132*16);assert.ok(point.x===16||point.x===158*16);}
 assert.ok(g.bosses.every(b=>b.battle.maxBullets<=40));
});
test('every road alternates three armed sections and silent one-hit chain formations',()=>{
 const g=game();assert.equal(g.performance.enemies,8);let maxScore=0;
 for(const id of g.stageOrder){const s=g.stages.find(s=>s.id===id),events=s.events.filter(e=>e.kind==='enemy'),boss=s.events.find(e=>e.kind==='boss'),runs=[];
  assert.ok(boss.frame>=38*60&&boss.frame<=70*60);assert.ok(events.reduce((n,e)=>n+e.count,0)>=56);
  for(const e of events){const actor=g.enemies.find(a=>a.id===e.ref),weak=e.ref.startsWith('raid-');if(runs.at(-1)!==weak)runs.push(weak);
   if(weak){assert.equal(actor.hp,1);assert.equal(actor.pattern,'');assert.deepEqual(actor.attacks,[]);assert.equal(e.count,8);assert.ok(e.interval>=16);}
   assert.ok(e.frame+(e.count-1)*e.interval<boss.frame-200,'last wave has time to leave before boss');maxScore+=e.count*actor.score;
  }
  assert.deepEqual(runs,[false,true,false,true,false,true]);maxScore+=g.bosses.find(b=>b.id===boss.ref).score+s.presentation.baseBonus+s.presentation.lifeBonus*g.player.lives+s.presentation.noMissBonus;
 }
 assert.ok(maxScore<65535,'perfect authored route does not overflow score storage');
});
test('vertical fairies enter the visible road instead of jumping outside their spawn column',()=>{
 const g=game(),motion=g.enemies.find(e=>e.id==='fairy-down').motion;
 assert.deepEqual(lib.motionOffset(motion,0),{x:0,y:0});assert.equal(lib.motionOffset(motion,48).x,0);assert.ok(lib.motionOffset(motion,48).y>32*16);
});
