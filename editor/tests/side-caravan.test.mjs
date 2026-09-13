import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=path.resolve(import.meta.dirname,'../..');
test('SIDE CARAVAN v0.3: continuous orbital run, seven pickups, dense BG and giant BG boss',()=>{
 const g=lib.readGame(root,'side-caravan');assert.deepEqual(lib.validate(g).filter(d=>d.severity==='error'),[]);
 assert.equal(g.title,'SIDE CARAVAN');assert.equal(g.timeLimit,false);assert.equal(g.stages.length,1);
 assert.deepEqual(g.stages.map(s=>s.scrollSpeed),[1]);
 assert.deepEqual(g.stages.map(s=>s.scrollAxis),['horizontal']);
 assert.equal(g.stages.reduce((n,s)=>n+s.duration,0),60);
 assert.equal(g.stages[0].events.find(e=>e.kind==='boss').frame,3600);
 assert.equal(g.stages[0].clearOnBoss,true);assert.equal(g.bosses[0].battle.background,'bg-boss');
 assert.deepEqual(new Set(g.items.flatMap(i=>i.effects.map(e=>e.kind))),new Set(['shot','speed','bomb','life','score','weapon','barrier']));
 assert.equal(g.player.bomb.live,true);assert.equal(g.player.bomb.button,'b');assert.equal(g.player.bomb.destroyBackground,true);
 assert.deepEqual(g.player.powerUps.speedLevels,[1.5,1.75,2,2.25]);
 assert.deepEqual(g.player.powerUps.shotWeapons,['shot-1','shot-2','shot-3']);
 assert.ok(g.patterns.find(p=>p.id==='shot-3').interval<20);assert.equal(g.patterns.find(p=>p.id==='laser').kind,'laser');
 assert.ok(g.stages.reduce((n,s)=>n+s.destructibles.objects.length,0)>=256);
 let maximum=g.clearBonus*g.stages.length;
 const itemScore=id=>g.items.find(i=>i.id===id)?.effects.filter(f=>f.kind==='score').reduce((n,f)=>n+f.amount,0)??0;
 for(const s of g.stages){
  assert.ok(s.width*8-160>s.scrollSpeed*3600,'camera moves through the full section');
  let peak=0;for(let x=0;x<s.width-20;x+=2)peak=Math.max(peak,s.destructibles.objects.filter(o=>o.x>=x&&o.x+2<=x+20&&o.y<16).length);
  assert.ok(peak>=64);assert.ok(s.destructibles.types.every(t=>!t.solid));
  for(const e of s.events){
   if(e.kind==='item')maximum+=itemScore(e.ref)*e.count;
   if(e.kind==='enemy'||e.kind==='boss'){const a=(e.kind==='boss'?g.bosses:g.enemies).find(a=>a.id===e.ref);maximum+=(a.score+itemScore(a.dropItem))*e.count;}
  }
  for(const o of s.destructibles.objects){const t=s.destructibles.types.find(t=>t.id===o.type);maximum+=t.score+itemScore(t.dropItem);}
 }
 assert.ok(maximum<60000);assert.ok(lib.spriteLayout(g).tiles<=128);
});
