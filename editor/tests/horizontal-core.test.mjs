import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url),lib=require('../build/library.cjs');
const authored=require('../scripts/create-side-caravan.cjs').game;
const game=()=>{const g=structuredClone(authored);g.timeLimit=false;g.bossCelebration=false;g.stageFade=false;g.stages[0].events=[];g.stages[0].clearOnBoss=false;g.stages[0].requireBoss=false;g.stages[0].scrollSpeed=0;g.stages[0].walls.fill(0);g.stages[0].destructibles={types:[{id:'panel',name:'PANEL',tiles:[1,2,3,4],hp:3,score:100,solid:false,dropItem:'score'}],objects:[{id:'panel-one',type:'panel',x:10,y:4}]};return g;};

test('horizontal authoring is valid and malformed optional data fails before dereference',()=>{
 assert.deepEqual(lib.validate(authored).filter(d=>d.severity==='error'),[]);
 for(const change of [g=>g.items[0].effects=null,g=>g.player.powerUps.speedLevels=null,g=>g.stages[0].destructibles.objects=null,g=>g.patterns[0].emitterOffsets=[{}]]){
  const g=game();change(g);assert.ok(lib.validate(g).some(d=>d.severity==='error'));
 }
 for(const change of [g=>{g.items[0].effects=[{kind:'bomb',amount:1}];g.player.bomb.enabled=false;},g=>g.stages[0].destructibles.types[0].hp=16,g=>g.stages[0].destructibles.objects[0].x=11,g=>g.stages[0].destructibles.objects.push({...g.stages[0].destructibles.objects[0],id:'overlap'}),g=>g.player.powerUps.shotWeapons=['missing']]){
  const g=game();change(g);assert.ok(lib.validate(g).some(d=>d.severity==='error'));
 }
});

test('legacy schema v1 retains vertical camera, emitter inheritance and admission defaults',()=>{
 const g=lib.readGame(process.cwd(),'star-caravan');assert.deepEqual(lib.validate(g).filter(d=>d.severity==='error'),[]);
 const s=new lib.Simulation(g);assert.equal(lib.horizontalStage(s.stage),false);assert.equal(s.currentWeapon,g.player.weapon);assert.equal(s.currentSpeed,g.player.speed);
 const a=g.assets.find(a=>a.id===g.player.asset),p=g.patterns.find(p=>p.id===g.player.weapon);
 assert.equal(lib.launchPoints(p,a,0,0,0).length,a.emitters.length||1);
});

test('512-tile camera wraps after addition and clamps nonloop maps on either axis',()=>{
 const g=game(),stage=g.stages[0];stage.width=512;stage.loopMap=true;
 assert.equal(lib.advanceCamera(g,stage,65520,64),48);
 stage.loopMap=false;assert.equal(lib.advanceCamera(g,stage,65520,64),(4096-160)*16);
 stage.scrollAxis='vertical';stage.width=20;stage.height=512;stage.scrollDown=true;stage.loopMap=true;
 assert.equal(lib.advanceCamera(g,stage,0,16),65520);
 stage.loopMap=false;assert.equal(lib.advanceCamera(g,stage,0,16),0);
});

test('camera-at-frame includes speed events and HUD conversion shares map coordinates',()=>{
 const g=game(),stage=g.stages[0];stage.scrollSpeed=.5;stage.events=[{id:'speed',kind:'scroll',frame:2,ref:'',x:0,y:0,count:1,spacing:0,interval:0,value:2}];
 const s=new lib.Simulation(g);for(let n=0;n<10;n++){assert.equal(s.camera,lib.cameraAtFrame(g,stage,n));s.step(0);}
 const world=lib.screenToWorld(g,stage,17*16,4,24);assert.deepEqual(lib.worldToScreen(g,stage,17*16,world.x,world.y),{x:4,y:24});
 assert.equal(lib.stageCell(stage,world.x,world.y),Math.floor(world.y/8)*stage.width+Math.floor(world.x/8));
});

test('event marker and drag coordinates match actual spawns after camera movement and speed changes',()=>{
 for(const dock of ['top','bottom'])for(const axis of ['horizontal','vertical']){
  const g=game(),stage=g.stages[0];g.screens.find(s=>s.id==='hud').dock=dock;stage.scrollAxis=axis;stage.width=axis==='horizontal'?64:20;stage.height=axis==='horizontal'?18:64;stage.tiles=Array(stage.width*stage.height).fill(0);stage.walls=Array(stage.tiles.length).fill(0);stage.destructibles.objects=[];stage.scrollSpeed=.5;
  const event=(id,frame,kind,value=0)=>({id,frame,kind,ref:kind==='item'?'score':'',x:60,y:40,count:1,spacing:0,interval:0,value});
  g.items.find(i=>i.id==='score').motion={...lib.normalMotion(),vx:0,vy:0};
  stage.events=[event('speed-first',0,'scroll',2),event('spawn-first',0,'item'),event('spawn-second',1,'item'),event('speed-later',2,'scroll',4),event('spawn-later',2,'item'),event('spawn-last',3,'item')];
  const sim=new lib.Simulation(g);
  for(let frame=0;frame<4;frame++){
   sim.step(0);const spawn=stage.events.find(e=>e.kind==='item'&&e.frame===frame),item=sim.entities.filter(e=>e.kind==='item').at(-1),camera=lib.cameraAtEventFrame(g,stage,frame);
   assert.equal(camera,sim.camera,`${axis}/${dock} post-move spawn camera frame ${frame}`);
   const marker=lib.screenToWorld(g,stage,camera,spawn.x,spawn.y),actual=lib.screenToWorld(g,stage,sim.camera,item.baseX/16,item.baseY/16);
   assert.deepEqual(marker,actual);assert.deepEqual(lib.worldToScreen(g,stage,camera,marker.x,marker.y),{x:spawn.x,y:spawn.y},'dragging the marker preserves exact spawn pixels');
  }
 }
});

test('map resize preserves rows and removes only out-of-bounds grouped objects',()=>{
 const g=game(),stage=g.stages[0];stage.tiles[stage.width+2]=7;
 const resized=lib.resizeStage(stage,24,18);assert.equal(resized.tiles[26],7);assert.equal(resized.destructibles.objects.length,1);assert.equal(resized.walls.length,24*18);
 stage.destructibles.objects[0].x=30;assert.equal(lib.resizeStage(stage,24,18).destructibles.objects.length,0);
});

test('PNG save/reopen preserves new definitions, grouped placements and stable revisions',()=>{
 const g=game(),before=structuredClone(g),directory=fs.mkdtempSync(path.join(process.cwd(),'.cache/horizontal-core-'));
 fs.mkdirSync(path.join(directory,'projects'));
 const created=lib.createProject(directory,'roundtrip','ROUNDTRIP',g),loaded=lib.readGame(directory,'roundtrip');
 assert.deepEqual(loaded.items,created.items);assert.deepEqual(loaded.player.powerUps,created.player.powerUps);assert.deepEqual(loaded.stages[0].destructibles,created.stages[0].destructibles);
 assert.deepEqual(loaded.assets.map(a=>a.frames.map(f=>f.pixels)),created.assets.map(a=>a.frames.map(f=>f.pixels)));
 const revision=lib.revision(loaded);lib.saveGame(directory,'roundtrip',loaded,revision);assert.equal(lib.revision(lib.readGame(directory,'roundtrip')),revision);
 assert.deepEqual(g,before,'copy/save leaves the authoring recipe untouched');
});

test('a grouped background object shares HP across four tiles, reveals underlay and awards once',()=>{
 const g=game(),s=new lib.Simulation(g),object=s.stage.destructibles.objects[0],cell=object.y*s.stage.width+object.x;
 assert.equal(s.tileAt(cell),1);assert.equal(s.tileAt(cell+1),2);assert.equal(s.tileAt(cell+s.stage.width),3);
 s.damageObject(0,1);assert.equal(s.getObjectHp(0),2);assert.equal(s.score,0);
 s.damageObject(0,2);assert.equal(s.getObjectHp(0),0);assert.equal(s.score,100);assert.equal(s.tileAt(cell),s.stage.tiles[cell]);assert.equal(s.entities.filter(e=>e.kind==='item').length,1);
 s.damageObject(0,255);assert.equal(s.score,100);assert.equal(g.stages[0].destructibles.types[0].hp,3,'authoring source is immutable');
 s.invulnerable=0;s.hitPlayer();assert.equal(s.getObjectHp(0),0,'death retains scenery state');
});

test('the 512th instance uses its own nibble and does not overwrite its neighbor',()=>{
 const g=game(),stage=g.stages[0];stage.width=512;stage.tiles=Array(512*18).fill(0);stage.walls=Array(512*18).fill(0);
 stage.destructibles.objects=Array.from({length:512},(_,i)=>({id:`object-${i}`,type:'panel',x:(i%256)*2,y:Math.floor(i/256)*2}));
 const s=new lib.Simulation(g);s.damageObject(511,1);assert.equal(s.getObjectHp(511),2);assert.equal(s.getObjectHp(510),3);assert.equal(s.objectHp.length,256);
});

test('flyover panels do not hit the player, solid panels do, and shot hits destroy either',()=>{
 const g=game(),s=new lib.Simulation(g),point=lib.worldToScreen(g,s.stage,0,88,40),box={x:point.x-2,y:point.y-2,w:4,h:4};
 assert.equal(s.wall(box),false);s.stage.destructibles.types[0].solid=true;assert.equal(s.wall(box),true);
 s.stage.walls[5*s.stage.width+9]=1;assert.equal(s.terrainCollision({x:79,y:point.y,w:4,h:1},1,3),true);assert.equal(s.getObjectHp(0),3,'a wall reached before the next cell blocks the shot');s.stage.walls.fill(0);
 const p=g.patterns.find(p=>p.id==='shot-1');s.shoot(p.id,g.player.asset,point.x*16,point.y*16,true,0);
 const shot=s.entities.find(e=>e.kind==='pshot');shot.x=point.x*16;shot.y=point.y*16;shot.vx=shot.vy=0;shot.damage=3;s.step(0);
 assert.equal(s.getObjectHp(0),0);assert.equal(s.wall(box),false);assert.equal(s.entities.some(e=>e===shot),false);
});

test('bomb drop priority is stable by authored object ID before enemy drops at the four-item cap',()=>{
 const g=game(),stage=g.stages[0];stage.destructibles.objects=[10,2,8,4,6].map((x,i)=>({id:`object-${i}`,type:'panel',x,y:4}));
 g.enemies[0].hp=1;g.enemies[0].dropItem='life';const s=new lib.Simulation(g);s.spawnActor(g.enemies[0].id,'enemy',140,40);s.step(0);s.step(32);
 const drops=s.entities.filter(e=>e.kind==='item');assert.equal(drops.length,4);assert.ok(drops.every(e=>e.ref==='score'));
 assert.deepEqual(drops.map(e=>e.x/16),[88,24,72,40]);assert.ok(stage.destructibles.objects.every((_,i)=>s.getObjectHp(i)===0));
});

test('five acquisition effects cap independently and death downgrades shot while keeping speed',()=>{
 const g=game();g.items[0].effects=[{kind:'shot',amount:8},{kind:'speed',amount:8},{kind:'bomb',amount:8},{kind:'life',amount:8},{kind:'score',amount:65535}];
 const s=new lib.Simulation(g);s.spawnItem(g.items[0].id,s.playerX/16,s.playerY/16);s.step(0);
 assert.equal(s.shotLevel,3);assert.equal(s.speedLevel,3);assert.equal(s.bombs,9);assert.equal(s.lives,9);assert.equal(s.score,65535);
 const picked=s.entities.filter(e=>e.kind==='item');assert.equal(picked.length,0);s.invulnerable=0;s.hitPlayer();assert.equal(s.shotLevel,2);assert.equal(s.speedLevel,3);
});

test('stage changes retain power levels while a new game resets levels and per-stage scenery',()=>{
 const g=game(),first=g.stages[0],second=structuredClone(first);second.id='second-stage';g.stages.push(second);g.stageOrder=[first.id,second.id];g.mode='campaign';
 const s=new lib.Simulation(g);s.shotLevel=3;s.speedLevel=2;s.damageObject(0,3);s.finishStage();
 assert.equal(s.stage.id,second.id);assert.equal(s.shotLevel,3);assert.equal(s.speedLevel,2);assert.equal(s.getObjectHp(0),3);assert.equal(s.currentWeapon,g.player.powerUps.shotWeapons[3]);
 const restarted=new lib.Simulation(g);assert.equal(restarted.shotLevel,0);assert.equal(restarted.speedLevel,0);assert.equal(restarted.getObjectHp(0),3);assert.equal(restarted.currentSpeed,g.player.powerUps.speedLevels[0]);
});

test('reserved slots let four items spawn under bullet pressure',()=>{
 const g=game(),s=new lib.Simulation(g),pattern=g.patterns.find(p=>p.id==='shot-1');g.performance.enemyShots=32;
 for(let n=0;n<45;n++)s.shoot(pattern.id,g.player.asset,1000,1000,false,0);
 for(let n=0;n<4;n++)s.spawnItem(g.items[0].id,80,60);
 assert.equal(s.entities.filter(e=>e.kind==='item').length,4);assert.ok(s.oam<=40);assert.ok(s.entities.length<=39);
 s.spawnItem(g.items[0].id,80,60);assert.equal(s.entities.filter(e=>e.kind==='item').length,4);
});

test('B is a fresh-edge bomb only; gaining a stock while holding B does not fire',()=>{
 const g=game(),s=new lib.Simulation(g);s.step(0);s.bombs=0;s.step(32);
 const item=g.items.find(i=>i.effects.some(e=>e.kind==='bomb'));s.spawnItem(item.id,s.playerX/16,s.playerY/16);s.step(32);assert.equal(s.bombs,1);s.step(32);assert.equal(s.bombLeft,0);
 s.step(0);s.step(32);assert.equal(s.bombs,0);assert.ok(s.bombLeft>0);assert.equal(s.getObjectHp(0),0);assert.ok(s.score>=100);
 assert.equal(s.entities.some(e=>e.kind==='pshot'),false,'B does not trigger shots');
});

test('twin emitters and centered five-way patterns are independent; atomic volleys never truncate',()=>{
 const g=game(),s=new lib.Simulation(g);g.performance.playerShots=6;
 s.shoot('shot-2',g.player.asset,1000,1000,true,0);assert.equal(s.entities.filter(e=>e.kind==='pshot').length,2);assert.equal(new Set(s.entities.map(e=>e.y)).size,2);
 s.entities=[];s.shoot('shot-5',g.player.asset,1000,1000,true,0);assert.equal(s.entities.length,5);const before=s.dropped;
 s.shoot('shot-5',g.player.asset,1000,1000,true,1);assert.equal(s.entities.length,5);assert.equal(s.dropped-before,5);
 assert.equal(new Set(s.entities.map(e=>e.vy)).size,5);
});

test('horizontal motion oscillates vertically and seekers keep their leftward hemisphere',()=>{
 const motion={...lib.normalMotion(),kind:'wave',vx:-1,vy:0,oscillationAxis:'y',amplitude:8,period:16};
 assert.deepEqual(lib.motionOffset(motion,4),{x:-64,y:128});
 for(let a=8;a<=16;a++)for(const [x,y]of [[100,0],[-100,-80],[-100,80]]){const next=lib.homingAngle(a&15,x,y,true);assert.ok(next===0||next>=8);}
});
