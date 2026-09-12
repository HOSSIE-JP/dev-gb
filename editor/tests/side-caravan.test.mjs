import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),lib=require('../build/library.cjs');
const root=path.resolve(import.meta.dirname,'../..');

test('SIDE CARAVAN remains an editable horizontal sample with all five pickup effects and dense grouped BG',()=>{
 const game=lib.readGame(root,'side-caravan'),stage=game.stages[0];
 assert.deepEqual(lib.validate(game).filter(d=>d.severity==='error'),[]);
 assert.equal(game.title,'SIDE CARAVAN');assert.equal(game.timeLimit,false);
 assert.equal(stage.scrollAxis,'horizontal');assert.equal(stage.height,18);
 assert.equal(stage.events.find(e=>e.kind==='boss').frame,180*60);
 assert.equal(stage.requireBoss,true);assert.equal(stage.clearOnBoss,true);
 assert.deepEqual(new Set(game.items.flatMap(i=>i.effects.map(e=>e.kind))),new Set(['shot','speed','bomb','life','score']));
 assert.equal(game.player.bomb.button,'b');assert.equal(game.player.bomb.destroyBackground,true);
 assert.deepEqual(game.player.powerUps.speedLevels,[1.5,1.75,2,2.25]);
 assert.equal(game.player.powerUps.shotOnMiss,'down');assert.equal(game.player.powerUps.speedOnMiss,'keep');
 const objects=stage.destructibles.objects,types=new Map(stage.destructibles.types.map(t=>[t.id,t]));
 assert.ok(objects.length>=256&&objects.length<=512);
 assert.ok([...types.values()].every(t=>!t.solid));
 let peak=0;for(let x=0;x<stage.width-20;x+=2)peak=Math.max(peak,objects.filter(o=>o.x>=x&&o.x+2<=x+20&&o.y<16).length);
 assert.ok(peak>=64,'at least64 grouped objects share a screen in the dense region');
 let maximum=game.clearBonus;
 for(const e of stage.events){if(e.kind==='enemy')maximum+=game.enemies.find(a=>a.id===e.ref).score*e.count;if(e.kind==='boss')maximum+=game.bosses.find(a=>a.id===e.ref).score;
  if(e.kind==='item')maximum+=game.items.find(i=>i.id===e.ref).effects.filter(f=>f.kind==='score').reduce((n,f)=>n+f.amount,0);}
 for(const o of objects){const type=types.get(o.type);maximum+=type.score;if(type.dropItem)maximum+=game.items.find(i=>i.id===type.dropItem).effects.filter(f=>f.kind==='score').reduce((n,f)=>n+f.amount,0);}
 assert.ok(maximum<60000,`all-clear score ceiling ${maximum}`);
 const tiers=game.player.powerUps.shotWeapons.map(id=>game.patterns.find(p=>p.id===id));
 assert.deepEqual(tiers.map(p=>(p.emitterOffsets?.length??1)*(p.kind==='fan'?p.count:1)),[1,2,3,5]);
 assert.ok(lib.spriteLayout(game).tiles<=128);
});
