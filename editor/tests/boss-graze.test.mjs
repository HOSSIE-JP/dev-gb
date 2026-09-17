import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const game=()=>lib.readGame(process.cwd(),'star-caravan');

test('graze settings and boss-only prerequisites are validated',()=>{
 const g=game();g.graze={enabled:true,radius:6,score:10,flashFrames:12};
 assert.equal(lib.validate(g).filter(d=>d.severity==='error').length,0);
 for(const key of ['radius','score','flashFrames']){const bad=structuredClone(g);bad.graze[key]=0;assert(lib.validate(bad).some(d=>d.target==='graze'));}
 g.debugBossMode=true;g.screens.find(s=>s.id==='title').stageSelect=false;
 assert(lib.validate(g).some(d=>d.target==='debugBossMode'));
 g.screens.find(s=>s.id==='title').stageSelect=true;g.stages[0].events=[];
 assert(lib.validate(g).some(d=>d.target==='debugBossMode'));
});
test('graze awards once, ignores hits and invulnerability, and saturates score',()=>{
 const g=game();g.graze={enabled:true,radius:6,score:10,flashFrames:12};g.timeLimit=false;
 g.stages[0].events=[];const player=g.assets.find(a=>a.id===g.player.asset);player.origin={x:8,y:4};player.hitbox={x:player.origin.x-2,y:player.origin.y-2,w:4,h:4};
 const sim=new lib.Simulation(g);sim.invulnerable=0;sim.playerX=80*16;sim.playerY=120*16;sim.battleMode='bg-bullets';
 const shot=x=>({x:x*16,y:120*16,vx:0,vy:0,life:100,damage:1,slot:0,ref:g.patterns[0].id,angle:8});
 sim.bgShots=[shot(72)];sim.step(0);assert.equal(sim.score,10);assert.equal(sim.grazeFlash,12);
 for(let n=0;n<20;n++)sim.step(0);assert.equal(sim.score,10);
 sim.bgShots=[shot(70)];sim.step(0);assert.equal(sim.score,10);
 sim.invulnerable=5;sim.bgShots=[shot(86)];sim.step(0);assert.equal(sim.score,10);
 sim.invulnerable=0;sim.score=65530;sim.step(0);assert.equal(sim.score,65535);
 sim.score=0;sim.bgShots=[shot(80),shot(72)];sim.step(0);assert.equal(sim.score,0);assert.equal(sim.lives,g.player.lives-1);
});
test('boss-only preview skips roads and advances to the next boss',()=>{
 const g=game();g.timeLimit=false;const boss=g.stages[0].events.find(e=>e.kind==='boss');assert(boss);
 const sim=new lib.Simulation(g,g.stages[0].id,0,true);assert.equal(sim.stageTick,boss.frame);
 sim.step(0);assert(sim.entities.some(e=>e.kind==='boss'));assert(!sim.entities.some(e=>e.kind==='enemy'));
 sim.score=123;sim.finishStage();assert.equal(sim.score,123);
 if(g.stageOrder.length>1){assert.equal(sim.stageIndex,1);assert.equal(sim.stageTick,sim.stage.events.find(e=>e.kind==='boss').frame);}
 else assert.equal(sim.result,2);
 const menu=lib.titlePresentation(g,{...g.screens.find(s=>s.id==='title'),stageSelect:true},0,0,true);
 assert(menu.screen.items.some(i=>i.text.includes('BOSS MODE')));assert(menu.screen.items.some(i=>i.text.includes('BOSS SELECT')));
});
