import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=path.resolve(import.meta.dirname,'../..');

test('Kouma uses three 100-HP attacks, increasing density ceilings up to 40, and distinct downward volleys',()=>{
 const g=lib.readGame(root,'touhou-kouma'),owners=new Map();let previousCap=0;
 for(const stageId of g.stageOrder){
  const s=g.stages.find(s=>s.id===stageId),b=g.bosses.find(b=>b.id===s.events.find(e=>e.kind==='boss').ref),phases=b.phases.filter(p=>p.until==='hp');
  assert.equal(phases.length,3);assert.deepEqual(phases.map(p=>p.hp),[100,100,100]);assert.equal(b.hp,100);
  assert.ok(b.battle.maxBullets>previousCap&&b.battle.maxBullets<=40);previousCap=b.battle.maxBullets;
  for(const phase of phases)for(const id of [phase.pattern,...phase.attacks.map(a=>a.pattern)]){assert.ok(!owners.has(id)||owners.get(id)===b.id,'bosses own their attack patterns');owners.set(id,b.id);}
 }
 const hostile=new Set([...owners.keys(),...g.enemies.flatMap(e=>[e.pattern,...e.attacks.map(a=>a.pattern)])]);hostile.delete('');
 for(const id of hostile){const p=g.patterns.find(p=>p.id===id);
  for(let sequence=0;sequence<256;sequence++)for(const [dx,dy]of [[0,-120],[0,120],[-120,0],[120,0]]){
   const angles=lib.shotAngles(p,sequence,dx,dy);assert.equal(new Set(angles).size,angles.length,id+' does not stack identical directions');
   for(const a of angles)assert.ok(-lib.COS[a]>0,id+' always travels down, including when the player moves above the boss');
  }
 }
});
