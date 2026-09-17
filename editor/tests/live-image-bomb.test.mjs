import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
function game(){const g=lib.readGame(process.cwd(),'touhou-kouma');g.debugBossMode=false;g.player.bomb.live=true;g.player.bomb.presentation='image';g.timeLimit=false;g.stageFade=false;g.stages.forEach(s=>{s.events=[];s.requireBoss=false;s.clearOnBoss=false;});return g;}
test('live image keeps movement and friendly fire, suppresses hidden hostile shots and protects against contact',()=>{
 for(const character of[0,1]){const g=game(),s=new lib.Simulation(g,undefined,character);s.spawnActor('rumia','boss',80,36);const boss=s.entities.find(e=>e.kind==='boss');boss.phase=1;boss.hp=100;s.introLeft=0;s.phaseLocked=false;s.step(0);const x=s.playerX,tick=s.tick;s.step(49);
 assert.equal(s.bombs,1);assert.equal(s.bombImage,true);assert.equal(s.tick,tick+1);assert.ok(s.playerX>x);assert.equal(boss.hp,70);
 for(let n=0;n<20;n++)s.step(49);assert.equal(s.bgShots.length,0);assert.ok(s.entities.some(e=>e.kind==='pshot'));assert.equal(s.bombs,1);assert.equal(lib.backgroundPaletteGame(s),s.game);
 s.invulnerable=0;const lives=s.lives;s.hitPlayer();assert.equal(s.lives,lives);s.shoot('rumia-halo','rumia',1280,576,false,0);assert.equal(s.bgShots.length,0);
 while(s.bombLeft)s.step(0);s.shoot('rumia-halo','rumia',1280,576,false,0);assert.ok(s.bgShots.length);assert.equal(s.bombImage,false);
 }
});
test('legacy untimed phase break and final victory wait until the live image releases the BG',()=>{
 const g=game();for(const b of g.bosses)for(const p of b.phases){delete p.timeLimitSeconds;delete p.score;}const s=new lib.Simulation(g);s.spawnActor('rumia','boss',80,36);const b=s.entities.find(e=>e.kind==='boss');b.phase=1;b.hp=20;s.introLeft=0;s.phaseLocked=false;s.step(0);s.step(48);
 assert.equal(b.hp,0);assert.equal(b.phase,1);for(let n=0;n<47;n++){s.step(0);assert.equal(b.phase,1);assert.equal(s.transition,undefined);}s.step(0);assert.ok(s.transition);assert.equal(s.bombImage,false);
 const t=new lib.Simulation(g);t.stage.clearOnBoss=true;t.spawnActor('rumia','boss',80,36);const final=t.entities.find(e=>e.kind==='boss');final.phase=3;final.hp=20;t.introLeft=0;t.phaseLocked=false;t.step(0);t.step(48);assert.equal(t.bossDefeated,true);const stage=t.stageIndex;for(let n=0;n<47;n++){t.step(0);assert.equal(t.stageIndex,stage);}t.step(0);assert.equal(t.stageIndex,stage+1);
});
test('boss spawn and one-shot end events survive deferral across a live image',()=>{
 for(const boss of[false,true]){const g=game(),stage=g.stages.find(s=>s.id===g.startStage);stage.events=[{id:'pending',frame:4,kind:boss?'boss':'end',ref:'rumia',x:80,y:36,count:1,spacing:0,interval:0,value:0}];const s=new lib.Simulation(g);s.step(0);s.step(48);for(let n=0;n<47;n++)s.step(0);assert.equal(s.stageIndex,0);assert.equal(s.entities.some(e=>e.kind==='boss'),false);s.step(0);if(boss)assert.ok(s.entities.some(e=>e.kind==='boss'));else assert.equal(s.stageIndex,1);}
});
test('live image schema rejects unknown presentation and retains legacy palette default',()=>{
 const g=game();g.player.bomb.presentation='bad';assert.ok(lib.validate(g).some(d=>d.severity==='error'));delete g.player.bomb.presentation;assert.ok(!lib.validate(g).some(d=>d.severity==='error'));const s=new lib.Simulation(g);s.step(0);s.step(48);assert.equal(s.bombImage,false);
});
