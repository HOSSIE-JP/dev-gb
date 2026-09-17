import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
function game(){
 const g=lib.readGame(process.cwd(),'touhou-kouma');
 g.stages.forEach(s=>{s.events=[];s.requireBoss=false;s.clearOnBoss=false;});g.timeLimit=false;
 g.enemies[0].hp=60;g.enemies[0].pattern='';g.enemies[0].attacks=[];g.enemies[0].motion={kind:'straight',vx:0,vy:0,amplitude:0,period:120,points:[{frame:0,x:0,y:0},{frame:120,x:0,y:0}],loop:false};
 return g;
}
test('live bombs hit late entrants once, allow a new bomb to hit again, and stop at expiry',()=>{
 for(const presentation of ['image','palette']){
  const g=game();g.player.bomb.live=true;g.player.bomb.presentation=presentation;
  const s=new lib.Simulation(g),ref=g.enemies[0].id;s.step(0);s.spawnActor(ref,'enemy',24,40);
  const first=s.entities.find(e=>e.kind==='enemy');s.step(48);assert.equal(first.hp,30);
  for(let i=0;i<10;i++)s.step(0);assert.equal(first.hp,30);
  s.spawnActor(ref,'enemy',44,40);const late=s.entities.find(e=>e.kind==='enemy'&&e!==first);
  s.step(0);assert.equal(late.hp,30);while(s.bombLeft)s.step(0);assert.equal(late.hp,30);
  s.spawnActor(ref,'enemy',64,40);const after=s.entities.find(e=>e.kind==='enemy'&&e!==first&&e!==late);
  s.step(0);assert.equal(after.hp,60);s.step(48);assert.ok(!s.entities.includes(first));assert.ok(!s.entities.includes(late));assert.equal(after.hp,30);
 }
});
test('bomb entry uses sprite edges and reused slots belong to fresh targets',()=>{
 const g=game();g.effects.explosion='';const s=new lib.Simulation(g),ref=g.enemies[0].id,a=lib.assetById(g,g.enemies[0].asset);s.step(0);s.step(48);
 const x=lib.playWidth(g)+a.origin.x;s.spawnActor(ref,'enemy',x,48);const e=s.entities.find(e=>e.kind==='enemy');
 s.step(0);assert.equal(e.hp,60);e.baseX-=16;s.step(0);assert.equal(e.hp,30);
 e.hp=1;s.damageActor(e,1);const slot=e.slot;
 s.spawnActor(ref,'enemy',32,48);const replacement=s.entities.find(e=>e.kind==='enemy');assert.equal(replacement.slot,slot);
 s.step(0);assert.equal(replacement.hp,30);for(let n=0;n<6;n++)s.step(0);assert.equal(replacement.hp,30);
});
test('title menu reserves four rows, supports sixteen stage labels, and is opt-in',()=>{
 const g=game(),base=g.screens.find(s=>s.id==='title');delete base.stageSelect;
 assert.equal(lib.titlePresentation(g,base).screen,base);
 base.stageSelect=true;g.stages=Array(16).fill(g.stages[0]);
 const art=g.assets.find(a=>a.id===base.background),before=[...art.frames[0].pixels];
 const a=lib.titlePresentation(g,base,0,0),b=lib.titlePresentation(g,base,1,15);
 assert.equal(a.screen.items.find(i=>i.id==='menu-start').text,'>START');
 assert.equal(b.screen.items.find(i=>i.id==='menu-stage').text,'>STAGE SELECT <16>');
 assert.ok(b.screen.items.every(i=>i.x+i.text.length<=20));assert.ok(b.pixels.slice(160*112).every(p=>p===0));
 assert.deepEqual(art.frames[0].pixels,before);
});
test('both character portraits get the exact Japanese heading and their own palette',()=>{
 const g=game();g.player.selectionHeading=true;const font=lib.readFont(process.cwd());
 for(const i of [0,1]){const s=lib.selectionPresentation(g,i),heading=s.items[0];assert.equal(heading.text.trim(),'キャラクター選択');assert.equal(heading.text.length,20);assert.ok([...heading.text].every(c=>font[c]));assert.equal(s.palette,g.assets.find(a=>a.id===s.background).palette);}
 g.player.selectionHeading=false;assert.deepEqual(lib.selectionPresentation(g).items,[]);
 g.screens.find(s=>s.id==='hud').stageSelect=true;assert.ok(lib.validate(g).some(d=>d.severity==='error'&&d.target==='hud'));
});
