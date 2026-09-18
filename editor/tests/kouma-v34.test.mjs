import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const l=createRequire(import.meta.url)('../build/library.cjs'),game=()=>l.readGame(process.cwd(),'touhou-kouma');
test('all seven 120px maps have equal 32px side bands and a 56px parallax center',()=>{
 const g=game();assert.equal(l.playWidth(g),120);assert.equal(l.validate(g).filter(d=>d.severity==='error').length,0);
 for(const s of g.stages){const p=s.parallax;assert(p.enabled);for(let y=0;y<s.height;y++)for(let x=0;x<15;x++){const tile=s.tiles[y*s.width+x],animated=tile>=p.firstTile&&tile<p.firstTile+p.width*p.height;assert.equal(animated,x>=4&&x<11,s.id+' '+x+','+y);}}
 for(const n of [0,1,2,5,6]){const s=g.stages[n],a=g.assets.find(a=>a.id===s.tileset);assert.equal(a.width*a.height/64,40);assert.equal(s.parallax.width*s.parallax.height,8);}
});
test('focus ring reserves two aligned OAM components and follows the actual hitbox for either character',()=>{
 const g=game();assert(g.player.focusHitbox);for(const character of [0,1]){const s=new l.Simulation(g,g.stages[0].id,character);s.stage.events=[];const base=s.slots(s.game.player.asset);assert.equal(s.oam,base+2+(l.spriteHeight(g)===16?9:0));s.step(32);assert.equal(s.weaponMode,1);const b=s.box(s.game.player.asset,s.playerX,s.playerY);assert.equal(b.w,3);assert.equal(b.h,3);s.step(0);assert.equal(s.weaponMode,0);}
 assert.equal(l.focusMarkerPixels.length,64);assert.equal(l.focusMarkerPixels[3+3*8],3);
});
test('boss-only completion holds combat and score for sixty preview frames',()=>{
 const g=game(),s=new l.Simulation(g,g.stageOrder[0],0,true);s.stage.events=[];s.bossDefeated=true;s.stage.clearOnBoss=true;s.score=123;s.step(0);assert.equal(s.bossExitLeft,60);const tick=s.tick,stage=s.stageIndex;
 for(let i=0;i<59;i++)s.step(16);assert.equal(s.stageIndex,stage);assert.equal(s.tick,tick);assert.equal(s.score,123);s.step(0);assert.equal(s.stageIndex,stage+1);assert.equal(s.score,123);
 const marisa=l.resolveEnding(g,1).at(-1).background,reimu=l.resolveEnding(g,0).at(-1).background;assert.notEqual(marisa,reimu);
});
