import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const game=()=>{const g=lib.readGame(process.cwd(),'touhou-kouma');g.timeLimit=false;g.stageFade=false;g.stages.forEach(s=>{s.events=[];s.requireBoss=false;s.clearOnBoss=false;});return g;};

test('edge and fixed launch sites do not inherit actor position or emitter count',()=>{
 const g=game(),a=g.assets.find(a=>a.id==='reimu'),p=g.patterns[0];
 const launch={kind:'both',x:74,y:32,step:16,lanes:3};
 assert.deepEqual(lib.launchPoints({...p,launch},a,1000,1100,2),[{x:16,y:1024,angle:90},{x:2528,y:1024,angle:270}]);
 assert.deepEqual(lib.launchPoints({...p,launch:{...launch,kind:'fixed'}},a,-999,-999,3),[{x:1184,y:512,angle:p.angle}]);
 assert.equal(lib.launchPoints({...p,launch:{...launch,kind:'alternate'}},a,0,0,1)[0].x,2528);
});

test('seekers turn gradually, stop steering after their window, and never reverse upward',()=>{
 for(let angle=4;angle<=12;angle++)for(const [dx,dy]of [[0,-120],[-100,100],[100,100]]){
  const next=lib.homingAngle(angle,dx,dy);assert.ok(Math.abs(next-angle)<=1);assert.ok(next>=4&&next<=12);
 }
 const g=game(),s=new lib.Simulation(g),p=g.patterns.find(p=>p.id==='pat-seal');
 s.battleMode='bg-bullets';s.bgLimit=40;s.playerX=144*16;s.playerY=128*16;
 s.shoot(p.id,'reimu',80*16,24*16,false,0);
 const bullet=s.bgShots[0];for(let n=0;n<48;n++)s.step(0);
 assert.notEqual(bullet.angle,8,'the shot actually curves');const angle=bullet.angle;
 s.playerX=16*16;for(let n=0;n<20;n++)s.step(0);assert.equal(bullet.angle,angle,'coasting after guidance deadline');
});

test('Marisa selection changes movement and weapon while retaining the common lives and bomb budget',()=>{
 const g=game(),reimu=new lib.Simulation(g),marisa=new lib.Simulation(g,undefined,1);
 reimu.step(1);marisa.step(1);assert.equal(reimu.playerX,82.25*16);assert.equal(marisa.playerX,83.25*16);
 assert.equal(marisa.game.player.weapon,'marisa-shot');assert.equal(marisa.bombBackground,'bomb-spark');assert.equal(marisa.bombStyle,'beam');
 assert.equal(reimu.bombBackground,'bomb-yinyang');assert.equal(reimu.bombs,2);assert.equal(marisa.bombs,2);assert.equal(marisa.lives,reimu.lives);
});

test('bomb is one stock per fresh chord, clears both bullet pools and damages only visible vulnerable actors',()=>{
 const g=game(),s=new lib.Simulation(g);s.spawnActor('rumia','boss',80,36);
 const b=s.entities.find(e=>e.kind==='boss');b.phase=1;b.hp=100;s.introLeft=0;s.phaseLocked=false;
 s.spawnActor(g.enemies[0].id,'enemy',80,-32); // arena rejects outside reinforcements
 s.shoot('rumia-halo','rumia',80*16,36*16,false,0);s.shoot('reimu-focus','reimu',80*16,120*16,true,0);
 assert.ok(s.bgShots.length);assert.ok(s.entities.some(e=>e.kind==='pshot'));
 s.step(0);s.step(48);assert.equal(s.bombs,1);assert.equal(b.hp,70);assert.equal(s.bgShots.length,0);assert.equal(s.entities.filter(e=>/shot/.test(e.kind)).length,0);
 s.playerX=16*16;for(let n=0;n<70;n++)s.step(48);assert.equal(s.bombs,1,'held chord cannot spend twice');
 s.step(0);s.step(48);assert.equal(s.bombs,0);assert.equal(b.hp,40);
 for(let n=0;n<50;n++)s.step(0);s.step(48);assert.equal(b.hp,40,'no damage at zero stock');
 s.invulnerable=0;s.hitPlayer();assert.equal(s.bombs,2,'new life restores two bombs');
 s.bombs=1;s.finishStage();assert.equal(s.bombs,1,'stage transition does not replenish');
});

test('bomb overkill stops at a phase boundary and final damage awards score once',()=>{
 const g=game();for(const b of g.bosses)for(const p of b.phases)if(p.intro)p.intro.enabled=false;
 const s=new lib.Simulation(g);s.spawnActor('rumia','boss',80,36);const b=s.entities.find(e=>e.kind==='boss');b.phase=1;b.hp=20;s.phaseLocked=false;
 s.step(0);s.step(48);assert.equal(b.hp,0);assert.equal(b.phase,1);assert.equal(s.bossDefeated,false);
 for(let n=0;n<120;n++)s.step(0);assert.equal(b.phase,2);assert.equal(b.hp,100);
 b.phase=3;b.hp=20;s.step(48);assert.equal(s.bossDefeated,true);assert.equal(s.score,1000);
 for(let n=0;n<80;n++)s.step(0);assert.equal(s.score,1000,'no repeated award during subsequent updates');
});

test('legacy projects need no character or bomb fields; malformed special settings fail validation',()=>{
 const g=game();delete g.player.characters;delete g.player.bomb;delete g.player.name;delete g.ending.characterSlides;g.stages.forEach(s=>delete s.presentation.characterDialogues);assert.deepEqual(lib.validate(g).filter(d=>d.severity==='error'),[]);
 g.patterns[0].guidance={frames:48,period:3};assert.ok(lib.validate(g).some(d=>d.severity==='error'));
 g.patterns[0].guidance={frames:48,period:8};g.patterns[0].launch={kind:'left',x:0,y:130,step:16,lanes:3};assert.ok(lib.validate(g).some(d=>d.severity==='error'));
});

test('offscreen enemies and invulnerable boss entry take no bomb damage',()=>{
 const g=game();g.enemies[0].motion={...g.enemies[0].motion,kind:'straight',vx:0,vy:0};const s=new lib.Simulation(g),ref=g.enemies[0].id;
 s.spawnActor(ref,'enemy',80,64);s.spawnActor(ref,'enemy',80,-24);
 const outside=s.entities[1],hp=outside.hp;s.step(0);s.step(48);
 assert.ok(s.entities.includes(outside));assert.equal(outside.hp,hp);assert.equal(s.entities.filter(e=>e.kind==='enemy').length,1);
 const t=new lib.Simulation(g);t.spawnActor('rumia','boss',80,36);t.introLeft=0;t.step(0);t.step(48);
 assert.equal(t.bossHp,100);assert.equal(t.bombs,1,'the defensive clear still spends one stock');
});
