import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const l=createRequire(import.meta.url)('../build/library.cjs'),load=()=>l.readGame(process.cwd(),'touhou-kouma');
function empty(){const g=load();g.stages.forEach(s=>s.events=[]);return g;}
test('continuous ray follows the player, damages the whole column on pulses, and releases immediately',()=>{
 const g=empty(),enemy=g.enemies[0];enemy.pattern='';enemy.attacks=[];enemy.hp=100;enemy.motion={...enemy.motion,kind:'straight',vx:0,vy:0};
 const s=new l.Simulation(g,undefined,1);s.invulnerable=600;
 for(const [x,y]of [[60,24],[60,76],[78,60],[60,136]])s.spawnActor(enemy.id,'enemy',x,y);
 const targets=[...s.entities];s.step(16);assert.equal(s.beamPattern,'marisa-shot');assert.deepEqual(targets.map(e=>e.hp),[99,99,100,100]);
 for(let i=0;i<7;i++)s.step(16);assert.equal(targets[0].hp,99);s.step(16);assert.equal(targets[0].hp,98);
 const x=s.playerX;s.step(17);assert(s.playerX>x);assert.equal(s.entities.filter(e=>e.kind==='pshot').length,0);
 s.step(0);assert.equal(s.beamPattern,'');const hp=targets[0].hp;for(let i=0;i<20;i++)s.step(0);assert.equal(targets[0].hp,hp);
 s.step(32);assert.equal(s.beamPattern,'');s.step(48);assert.equal(s.beamPattern,'marisa-focus');s.invulnerable=0;s.hitPlayer();s.step(16);assert.equal(s.beamPattern,'');
});
test('ray collision stays narrow at the exact two-pixel edge and does not depend on target slot',()=>{
 for(const dx of [-8,-7,-6,0,6,7,8]){
  const g=empty(),e=g.enemies[0];e.hp=100;e.pattern='';e.attacks=[];e.motion={...e.motion,kind:'straight',vx:0,vy:0};
  const s=new l.Simulation(g,undefined,1);s.spawnActor(e.id,'enemy',60+dx,50);const enemy=s.entities[0],b=s.box(e.asset,enemy.x,enemy.y),expected=b.x<61&&b.x+b.w>59;
  s.step(16);assert.equal(enemy.hp,expected?99:100,'dx='+dx);
 }
});
test('all 21 boss modes move continuously inside the field and include a targeted counter',()=>{
 const g=load(),patterns=new Set();
 for(const b of g.bosses)for(const p of b.phases.filter(p=>p.until==='hp')){
  let last=l.motionOffset(p.motion,0),moves=0;
  for(let t=1;t<=256;t++){const at=l.motionOffset(p.motion,t);if(at.x!==last.x||at.y!==last.y)moves++;assert(at.x/16+60>=12&&at.x/16+60<=108);assert(at.y/16+36>=12&&at.y/16+36<=84);last=at;}
  assert.equal(moves,256,b.id+'/'+p.id);const ids=[p.pattern,...p.attacks.map(a=>a.pattern)];ids.forEach(id=>patterns.add(id));
  const targeted=ids.map(id=>g.patterns.find(a=>a.id===id)).filter(a=>['aimed','aimed-fan'].includes(a.kind));assert(targeted.length>0);
  assert(targeted.some(a=>l.shotAngles(a,0,0,-100).some(n=>-l.COS[n]<0)),b.id+' can aim above itself');
  assert(targeted.some(a=>l.shotAngles(a,0,0,-100).includes(0)),b.id+' has no permanent center gap in its aimed counter');
 }
 assert.equal(patterns.size,42);assert.equal(Math.max(...g.bosses.map(b=>b.battle.maxBullets)),40);
});
test('mid/late roads introduce eight behavior variants while keeping early roads and unarmed rushes',()=>{
 const g=load();assert.equal(g.enemies.filter(e=>e.id.startsWith('v37-')).length,8);
 for(let stage=0;stage<7;stage++){const ids=g.stages[stage].events.filter(e=>e.kind==='enemy').map(e=>e.ref);assert.equal(ids.some(id=>id.startsWith('v37-')),stage>=2);assert(ids.some(id=>id.startsWith('raid-')));}
 const speeds=new Set(g.patterns.filter(p=>p.id.startsWith('v37-')&&!g.bosses.some(b=>p.id.startsWith('v37-'+b.id))).map(p=>p.speed));assert(speeds.size>=4);
 const deployed=new Set(g.stages.flatMap(s=>s.events.filter(e=>e.kind==='enemy').map(e=>e.ref)));
 assert(g.enemies.filter(e=>e.id.startsWith('v37-')).every(e=>deployed.has(e.id)),'all added behavior variants appear in the game');
});

test('new road enemies leave the allocation margin even if the player never fires',()=>{
 for(const e of load().enemies.filter(e=>e.id.startsWith('v37-'))){
  const g=empty(),s=new l.Simulation(g);s.invulnerable=1000;s.spawnActor(e.id,'enemy',60,-12);
  for(let n=0;n<320;n++)s.step(0);
  assert(!s.entities.some(a=>a.kind==='enemy'&&a.ref===e.id),e.id+' must not accumulate below the screen');
 }
});
test('8x16 packing fits 128 tiles and paired sprite tiles share a GBC palette',()=>{
 const g=load(),q=l.quantizeSpriteAssets(g),layout=l.spriteLayout(g);
 assert.equal(l.spriteHeight(g),16);assert.equal(layout.tiles+8+4,126);
 for(const a of g.assets.filter(a=>a.kind==='sprite'))for(const f of a.frames){const attr=q.frames.get(a.id+'/'+f.id).attributes;for(let y=0;y+8<a.height;y+=16)for(let x=0;x<a.width/8;x++)assert.equal(attr[y/8*a.width/8+x],attr[(y/8+1)*a.width/8+x],a.id);}
 // Projects without a beam keep the original 8px atlas and renderer ABI.
 for(const p of g.patterns)if(p.kind==='beam')p.kind='laser';assert.equal(l.spriteHeight(g),8);assert.equal(l.spriteLayout(g).tiles,88);
});
