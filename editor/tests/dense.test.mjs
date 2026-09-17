import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
function game(){const g=lib.readGame(process.cwd(),'star-caravan');g.performance={enemies:12,playerShots:6,enemyShots:32,effects:4,dense:true};g.stages[0].events=[];g.stages[0].walls.fill(0);g.enemies[0].pattern='';g.enemies[0].attacks=[];g.enemies[0].motion=lib.normalMotion();return g;}
test('dense logical actor admission is independent of sprite reservation',()=>{
 const g=game(),s=new lib.Simulation(g);for(let i=0;i<12;i++)s.spawnActor(g.enemies[0].id,'enemy',16+i*10,40);
 assert.equal(s.entities.length,12);assert.equal(s.dropped,0);s.planSprites();assert.ok(s.visibleSlots.size<12);
});
test('a completely rejected enemy body cannot damage the player',()=>{
 const g=game(),s=new lib.Simulation(g);s.playerX=80*16;s.playerY=80*16;s.invulnerable=0;
 for(const x of [16,32,48,112,128,144,24,136,80])s.spawnActor(g.enemies[0].id,'enemy',x,80);
 const lives=s.lives;s.step(0);assert.equal(s.lives,lives);assert.equal(s.visible(s.entities.find(e=>e.slot===8)),false);
});
test('road BG rendering requires the explicit backend and obstacle-free stage',()=>{
 const g=game();g.stages[0].bgBullets=true;g.stages[0].bgBulletLimit=40;g.stages[0].walls.fill(0);
 assert.ok(!lib.validate(g).some(d=>d.severity==='error'));g.performance.dense=false;
 assert.ok(lib.validate(g).some(d=>d.severity==='error'&&d.message.includes('道中BG')));
});
test('every paired sprite frame starts at an even tile, including 8-pixel art',()=>{
 const g=game(),layout=lib.spriteLayout(g);
 for(const a of g.assets.filter(a=>a.kind==='sprite'))assert.equal(layout.offsets.get(a.id)%2,0);
});
