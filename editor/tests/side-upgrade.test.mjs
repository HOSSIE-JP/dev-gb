import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const root=path.resolve(import.meta.dirname,'../..');
function game(){const g=lib.readGame(root,'side-caravan');g.stages[0].events=[];g.stages[0].destructibles.objects=[];g.stages[0].requireBoss=false;g.stages[0].clearOnBoss=false;const next=structuredClone(g.stages[0]);next.id='next';g.stages.push(next);g.stageOrder.push(next.id);return g;}

test('live bomb advances camera, firing, enemies and game clock while held B consumes once',()=>{
 const g=game(),s=new lib.Simulation(g);s.step(0);s.spawnActor(g.enemies[0].id,'enemy',140,40);
 s.step(32|16|1);const tick=s.tick,camera=s.camera,player=s.playerX;
 assert.equal(s.bombs,1);assert.equal(s.bombLeft,g.player.bomb.frames);
 for(let i=0;i<20;i++)s.step(32|16|1);
 assert.equal(s.tick,tick+20);assert.ok(s.camera>camera);assert.ok(s.playerX>player);assert.ok(s.entities.some(e=>e.kind==='pshot'));assert.equal(s.bombs,1);
 for(let i=0;i<50;i++)s.step(32);assert.equal(s.bombs,1);s.step(0);s.step(32);assert.equal(s.bombs,0);
});
test('legacy bomb still freezes the update clock when live is omitted',()=>{
 const g=game();delete g.player.bomb.live;const s=new lib.Simulation(g);s.step(0);const tick=s.tick;s.step(32);for(let i=0;i<12;i++)s.step(0);assert.equal(s.tick,tick);
});
test('barrier caps, consumes one per hit, grants protection, and survives stage change',()=>{
 const g=game(),s=new lib.Simulation(g);g.items.find(i=>i.id==='barrier').effects=[{kind:'barrier',amount:8},{kind:'score',amount:500}];
 const collect=()=>{s.spawnItem('barrier',s.playerX/16,s.playerY/16);s.collectItem(s.entities.find(e=>e.kind==='item'));};
 collect();collect();assert.equal(s.barrier,3);assert.equal(s.score,1000);
 s.invulnerable=0;s.hitPlayer();assert.equal(s.barrier,2);assert.equal(s.lives,3);assert.equal(s.invulnerable,45);
 s.hitPlayer();assert.equal(s.barrier,2);s.finishStage();assert.equal(s.barrier,2);
 for(let i=0;i<2;i++){s.invulnerable=0;s.hitPlayer();}assert.equal(s.lives,3);s.invulnerable=0;s.hitPlayer();assert.equal(s.lives,2);
 assert.equal(new lib.Simulation(g).barrier,0);
});
test('laser pickup changes weapon independently of power level; P restores and strengthens spread',()=>{
 const g=game(),s=new lib.Simulation(g);const collect=id=>{s.spawnItem(id,s.playerX/16,s.playerY/16);s.collectItem(s.entities.find(e=>e.kind==='item'));};
 collect('power');collect('laser');assert.equal(s.shotLevel,1);assert.equal(s.currentWeapon,'laser');s.finishStage();assert.equal(s.currentWeapon,'laser');
 collect('power');assert.equal(s.shotLevel,2);assert.equal(s.currentWeapon,'shot-3');collect('laser');s.invulnerable=0;s.hitPlayer();assert.equal(s.currentWeapon,'shot-2');
 assert.equal(lib.shotAngles(g.patterns.find(p=>p.id==='laser'),0,0,0).length,1);
});
test('interpolated paths reach endpoints and waves advance between old sine samples',()=>{
 const m={...lib.normalMotion(),kind:'path',loop:false,smooth:true,points:[{frame:0,x:0,y:0},{frame:100,x:-46,y:17}]};
 assert.deepEqual(lib.motionOffset(m,100),{x:-736,y:272});assert.deepEqual(lib.motionOffset({...m,smooth:false},100),{x:-700,y:200});
 for(const period of [128,256,1024]){
  const wave={...lib.normalMotion(),vx:0,vy:0,kind:'wave',smooth:true,amplitude:34,period,oscillationAxis:'y'},values=Array.from({length:period+1},(_,i)=>lib.motionOffset(wave,i).y);
  assert.equal(values[0],values.at(-1));assert.ok(Math.max(...values.slice(1).map((v,i)=>Math.abs(v-values[i])))<=26,'no 12px discontinuities');
 }
});
test('new fields round-trip and reject missing laser/BG image references and excess BG bullets',()=>{
 const g=game();assert.deepEqual(lib.validate(g).filter(d=>d.severity==='error'),[]);
 for(const change of [g=>g.bosses[0].battle.maxBullets=33,g=>g.bosses[0].battle.graphic='missing',g=>g.items.find(i=>i.id==='laser').effects[0].weapon='missing',g=>g.player.barrierMax=10]){
  const copy=structuredClone(g);change(copy);assert.ok(lib.validate(copy).some(d=>d.severity==='error'));
 }
 const dir=fs.mkdtempSync(path.join(root,'.cache/side-upgrade-core-'));fs.mkdirSync(path.join(dir,'projects'));lib.createProject(dir,'roundtrip','ROUNDTRIP',g);
 const saved=lib.readGame(dir,'roundtrip');assert.deepEqual(saved.items,g.items);assert.deepEqual(saved.player,g.player);assert.deepEqual(saved.bosses,g.bosses);
});

test('live flash maps DMG shades and BG colors without changing sprite palettes or authored data',()=>{
 const g=game(),s=new lib.Simulation(g),before=structuredClone(g.palettes);
 s.bombLeft=g.player.bomb.frames-g.player.bomb.flashPeriod;
 const bg=lib.backgroundPaletteGame(s);assert.equal(bg.dmgPalette,(g.dmgPalette??0xe4)^255);
 for(let p=0;p<g.palettes.length;p++)for(let c=0;c<4;c++)assert.equal(parseInt(bg.palettes[p].colors[c].slice(1),16)^parseInt(g.palettes[p].colors[c].slice(1),16),0xffffff);
 assert.deepEqual(g.palettes,before);s.bombLeft=0;assert.equal(lib.backgroundPaletteGame(s),s.game);
});

test('a barrier image reused by a boss remains resident alongside exclusive boss graphics',()=>{
 const g=game();g.bosses.push({...structuredClone(g.bosses[0]),id:'shield-shaped-boss',asset:g.player.barrierAsset});
 const layout=lib.spriteLayout(g);assert.equal(layout.overlay.has(g.player.barrierAsset),false);
 assert.ok(layout.offsets.get(g.player.barrierAsset)<layout.base);
 assert.ok(layout.overlay.has(g.bosses[0].asset));
});

test('boss contact body protects shell while only the separate weakpoint takes shots',()=>{
 const g=game();const b=g.bosses[0];b.motion={...lib.normalMotion(),vx:0,vy:0};b.phases.forEach(p=>{p.motion=b.motion;p.pattern='';});b.contactBoxes=[{x:16,y:-20,w:30,h:40}];
 const s=new lib.Simulation(g);s.step(0);s.spawnActor(b.id,'boss',80,72);const e=s.entities.find(e=>e.kind==='boss');
 s.playerX=110*16;s.playerY=72*16;s.invulnerable=0;s.step(0);assert.equal(s.lives,2,'shell contact outside weakpoint costs a life');
 const next=new lib.Simulation(g);next.step(0);next.spawnActor(b.id,'boss',80,72);next.playerX=30*16;next.playerY=110*16;next.invulnerable=0;
 for(let i=0;i<8;i++)next.step(16);assert.equal(next.entities.find(e=>e.kind==='boss').hp,b.hp,'shots away from core do not damage shell');
 const round=lib.validate(g).filter(d=>d.severity==='error');assert.deepEqual(round,[]);
 for(const boxes of [[{x:128,y:0,w:10,h:10}],[{x:0,y:0,w:0,h:10}],Array(9).fill({x:0,y:0,w:1,h:1})]){b.contactBoxes=boxes;assert.ok(lib.validate(g).some(d=>d.severity==='error'));}
});
