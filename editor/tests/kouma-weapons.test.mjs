import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const l=createRequire(import.meta.url)('../build/library.cjs');
const load=()=>l.readGame(process.cwd(),'touhou-kouma');
function empty(){const g=load();g.stages.forEach(s=>s.events=[]);g.timeLimit=false;return g;}
test('Kouma normal shots: faster narrow Marisa laser and wider Reimu collision, within pool',()=>{
 const g=empty(),counts=[];
 for(const character of [0,1]){
  const s=new l.Simulation(g,undefined,character),born=new Set();let peak=0;
  for(let i=0;i<120;i++){s.step(16);for(const e of s.entities.filter(e=>e.kind==='pshot'))born.add(i-e.age);peak=Math.max(peak,s.entities.filter(e=>e.kind==='pshot').length);}
  counts.push(born.size);assert.equal(s.dropped,0);assert.ok(peak<=6);
 }
 assert.ok(counts[1]>=counts[0]*2,JSON.stringify(counts));
 const s=new l.Simulation(g),wide=s.box('shot-ofuda',1280,1280),thin=s.box('shot-marisa-laser',1280,1280);
 assert.equal(wide.w,8);assert.equal(thin.w,2);assert.equal(thin.h,16);
 for(const id of ['reimu','marisa'])assert.deepEqual(l.assetById(g,id).hitbox,{x:7,y:11,w:3,h:3});
});
test('Kouma aimed shots change direction for left/right player positions and separate from shooters',()=>{
 const g=empty();
 const p=g.patterns.find(p=>p.id==='fairy-aim');
 assert.equal(p.kind,'aimed-down');assert.equal(l.shotAngles({...p,kind:'aimed'},0,0,-120)[0],0,'ordinary aim still permits upward shots');
 for(const angle of [-360,-90,0,90,360])for(const launch of ['actor','left','right','alternate','both','fixed']){
  const q={...p,angle,launch:{kind:launch,x:80,y:32,step:0,lanes:1}};
  for(const point of l.launchPoints(q,l.assetById(g,'fairy'),80*16,32*16,0))for(const a of l.shotAngles({...q,angle:point.angle},0,-120,-120))assert.ok(-l.COS[a]>=0);
 }
 for(const ref of ['fairy-down','fairy-wave','bat-down','bat-cross'])for(const x of [16,144]){
  const s=new l.Simulation(g);s.playerX=x*16;s.playerY=128*16;s.spawnActor(ref,'enemy',80,0);
  let shot,actor;for(let n=0;n<70&&!shot;n++){s.step(0);shot=s.bgShots[0]??s.entities.find(e=>e.kind==='eshot');actor=s.entities.find(e=>e.kind==='enemy');}
  assert.ok(shot&&actor,ref);assert.equal(Math.sign(shot.vx),Math.sign(x*16-shot.x),ref);assert.ok(shot.vy>0,ref);
  const dx=shot.x-actor.x,dy=shot.y-actor.y;for(let n=0;n<8;n++)s.step(0);
  assert.ok(Math.hypot(shot.x-actor.x-dx,shot.y-actor.y-dy)>8*16,ref);
 }
});
test('Kouma stop-and-fire enemies wait, shoot during the pause, then depart; raids remain unarmed',()=>{
 const g=empty();for(const ref of ['fairy-down','fairy-left','fairy-right','book-stop']){
  const actor=g.enemies.find(e=>e.id===ref),p=g.patterns.find(p=>p.id===actor.pattern),m=actor.motion;
  assert.deepEqual(l.motionOffset(m,p.delay-1),l.motionOffset(m,p.delay+1),ref);
  assert.notDeepEqual(l.motionOffset(m,p.delay),l.motionOffset(m,144),ref);
 }
 for(const e of g.enemies.filter(e=>e.id.startsWith('raid-'))){assert.equal(e.pattern,'');assert.deepEqual(e.attacks,[]);assert.equal(e.hp,1);}
});
test('Reimu broad shot hits a grazing target that the narrow Marisa laser misses',()=>{
 for(const [pattern,expected] of [['reimu-shot',9],['marisa-shot',10]]){
  const g=empty(),enemy=g.enemies[0],art=l.assetById(g,enemy.asset);
  enemy.hp=10;enemy.pattern='';enemy.attacks=[];enemy.motion.kind='straight';enemy.motion.vx=enemy.motion.vy=0;
  art.hitbox={x:art.origin.x,y:art.origin.y,w:1,h:1};
  const s=new l.Simulation(g);s.spawnActor(enemy.id,'enemy',83,80);const target=s.entities.find(e=>e.kind==='enemy');
  s.shoot(pattern,'shot-ofuda',80*16,80*16,true,0);
  // Isolate collision geometry from the already separately tested fan trajectory.
  const shots=s.entities.filter(e=>e.kind==='pshot');shots.slice(1).forEach(e=>s.entities.splice(s.entities.indexOf(e),1));shots[0].vx=shots[0].vy=0;
  s.step(0);assert.equal(target.hp,expected,pattern);
 }
});
