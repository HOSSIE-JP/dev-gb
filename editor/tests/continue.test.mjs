import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=path.resolve(import.meta.dirname,'../..');
const game=()=>({...lib.readGame(root,'touhou-kouma'),continue:{enabled:true,seconds:10,delaySeconds:1}});
test('continue settings enforce timing and preserve portrait/menu source data',()=>{
 const g=game(),before=structuredClone(g);assert.deepEqual(lib.validate(g),[]);
 for(const [key,value]of [['seconds',0],['seconds',61],['seconds',1.5],['delaySeconds',-1],['delaySeconds',6],['delaySeconds',NaN]]){const bad=structuredClone(g);bad.continue[key]=value;assert.ok(lib.validate(bad).some(d=>d.severity==='error'&&d.target==='continue'));}
 assert.ok(lib.validateShape({...g,continue:{enabled:true,seconds:'10',delaySeconds:1}}).length);
 for(const c of[0,1]){const p=lib.gameOverPresentation(g,c),a=g.assets.find(a=>a.id===p.screen.background);assert.deepEqual(p.pixels.slice(0,160*104),a.frames[0].pixels.slice(0,160*104));assert.ok(p.pixels.slice(160*104).every(v=>v===0));assert.ok(p.screen.items.some(i=>i.binding==='time'&&i.digits===2));}
 assert.deepEqual(g,before);delete g.continue;assert.equal(lib.gameOverPresentation(g).pixels,undefined);
});
test('continue resets the current stage and heroine but preserves the defeated score once',()=>{
 const g=game(),s=new lib.Simulation(g,g.stageOrder[1],1);s.score=1234;s.lives=0;s.bombs=0;s.result=1;s.stageTick=555;s.tick=678;s.camera=999;s.entities=[];s.battleMode='bg-bullets';
 s.step(16);for(let f=0;f<60;f++)s.step(16);assert.equal(s.gameOverState,'continue');assert.equal(s.continueLeft,600);assert.equal(s.stageTick,555);assert.deepEqual(s.highscores,[1234,0,0,0,0]);
 for(let f=0;f<50;f++)s.step(16);assert.equal(s.gameOverState,'continue','held fire must not continue');assert.deepEqual(s.highscores,[1234,0,0,0,0]);s.step(0);s.step(128);
 const fresh=new lib.Simulation(g,g.stageOrder[1],1);for(const key of['stageIndex','stageTick','tick','camera','lives','bombs','score','invulnerable','playerX','playerY','battleMode','bombBackground','bombStyle','result'])assert.deepEqual(s[key],fresh[key],key);assert.equal(s.character,1);assert.equal(s.game.player.asset,fresh.game.player.asset);assert.deepEqual(s.highscores,[1234,0,0,0,0]);
 s.score=10;s.lives=0;s.result=1;s.step(0);assert.deepEqual(s.highscores,[1234,10,0,0,0]);
});
test('continue deadline is exactly bounded; cancellation and non-ranking scores do not duplicate entries',()=>{
 for(const exit of['timeout','deadline','last-frame','cancel']){const s=new lib.Simulation(game());s.highscores=[500,400,300,200,100];s.score=50;s.lives=0;s.result=1;s.step(0);for(let f=0;f<60;f++)s.step(0);
  if(exit==='cancel')s.step(32);else{for(let f=0;f<(exit==='last-frame'?598:599);f++)s.step(0);s.step(exit==='timeout'?0:16);}
  assert.deepEqual(s.highscores,[500,400,300,200,100]);if(exit==='last-frame')assert.equal(s.result,0);else{assert.equal(s.gameOverState,'done');s.step(0);s.step(16);assert.equal(s.result,1);assert.deepEqual(s.highscores,[500,400,300,200,100]);}
 }
});
