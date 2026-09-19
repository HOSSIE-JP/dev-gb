import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const production=()=>lib.readGame(process.cwd(),'touhou-kouma');
function fixture(id){
 const g=production(),b=g.bosses.find(b=>b.id===id),s=g.stages[0];
 g.timeLimit=false;g.mode='caravan';g.stageOrder=[s.id];g.startStage=s.id;g.player.invulnerability=65535;g.graze.enabled=false;
 s.events=[{id:'boss',kind:'boss',ref:id,frame:0,x:60,y:36,count:1,spacing:0,interval:0,value:0}];s.requireBoss=true;s.clearOnBoss=true;
 b.phases=b.phases.filter(p=>p.until==='hp');for(const p of b.phases){p.intro=undefined;p.pattern='';p.attacks=[];}
 const sim=new lib.Simulation(g,s.id,0,true);sim.step(0);return {g,b,sim};
}
test('right HUD source is editable, fits 5x18, and reserves a 120x144 viewport',()=>{
 const g=production();assert.deepEqual(lib.validate(g).filter(d=>d.severity==='error'),[]);
 assert.equal(lib.playWidth(g),120);assert.equal(lib.hudHeight(g),0);assert.equal(g.graze.score,10);
 const bad=structuredClone(g);bad.screens.find(s=>s.id==='hud').items[0].x=3;assert(lib.validate(bad).some(d=>d.severity==='error'));
 const old=lib.readGame(process.cwd(),'star-caravan');assert.equal(lib.playWidth(old),160);assert.equal(lib.hudHeight(old),16);
 for(const b of g.bosses)for(const p of b.phases.filter(p=>p.until==='hp'))assert.deepEqual([p.hp,p.timeLimitSeconds,p.score],[100,60,b.score]);
});
for(const id of ['rumia','cirno','meiling','patchouli','sakuya','remilia','flandre'])test(`${id}: all three modes time out after exactly 3600 gameplay updates without points`,()=>{
 const {b,sim}=fixture(id);let modes=0;
 while(!sim.result){
  if(sim.bossExitLeft){const tick=sim.tick;sim.step(0);assert.equal(sim.tick,tick);continue;}
  const e=sim.entities.find(e=>e.kind==='boss');assert(e);
  if(sim.transition){sim.step(0);continue;}
  if(e.phaseAge===3599){const score=sim.score;sim.step(0);assert.equal(sim.score,score);modes++;if(modes<3)assert(sim.transition);else assert.equal(sim.bossExitLeft,60);}
  else{assert(e.phaseAge<3600);sim.step(0);}
 }
 assert.equal(modes,3);assert.equal(sim.score,0);assert.equal(b.phases.length,3);
});
test('last-update shot wins; timeout, miss and live bomb cannot duplicate or restart phase scoring',()=>{
 const {sim,b}=fixture('rumia');let e=sim.entities.find(e=>e.kind==='boss');
 e.phaseAge=3599;sim.damageActor(e,100);sim.step(0);assert.equal(sim.score,b.score);assert(sim.transition);
 while(sim.transition)sim.step(0);e=sim.entities.find(e=>e.kind==='boss');assert.equal(e.phase,1);assert.equal(e.phaseAge,0);
 sim.invulnerable=0;e.phaseAge=1200;sim.hitPlayer();assert.equal(e.phaseAge,1200);
 e.phaseAge=3599;sim.bombLeft=40;sim.step(0);assert.equal(sim.score,b.score);assert.equal(sim.bombLeft,0);assert(sim.transition);
 while(sim.transition)sim.step(0);e=sim.entities.find(e=>e.kind==='boss');sim.damageActor(e,100);sim.step(0);
 assert.equal(sim.score,2*b.score);assert.equal(sim.bossExitLeft,60);while(sim.bossExitLeft)sim.step(0);assert.equal(sim.result,2);assert.equal(sim.score,2*b.score);
});
test('player bounds and side emitters use the narrow viewport',()=>{
 const {g,sim}=fixture('cirno');g.stages[0].events=[];sim.entities=[];
 for(let n=0;n<150;n++)sim.step(1);const a=g.assets.find(a=>a.id===g.player.asset);assert.equal(sim.playerX/16,120-a.width+a.origin.x);
 const p={...g.patterns[0],launch:{kind:'right',x:0,y:100,lanes:1,step:0}};
 assert.equal(lib.launchPoints(p,a,0,0,0,120)[0].x,118*16);
 assert.equal(lib.launchPoints(p,a,0,0,0)[0].x,158*16,'legacy width remains default');
});
test('narrow bomb derivatives preserve source pixels and fit entirely inside 120px',()=>{
 const g=production(),id=g.player.bomb.background,a=g.assets.find(a=>a.id===id),original=[...a.frames[0].pixels];
 const art=lib.bombViewportPixels(g,id,false);assert.deepEqual(a.frames[0].pixels,original);
 for(let y=0;y<144;y++)assert(art.pixels.slice(y*160+120,(y+1)*160).every(v=>v===0));
 assert(art.pixels.some(v=>v!==0));assert.equal(art.pixels.length,23040);
});
