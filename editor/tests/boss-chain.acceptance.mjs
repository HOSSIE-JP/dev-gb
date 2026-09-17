// Small authored fixture uses the unchanged title, gameplay and continue loops.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]),fixture=path.join(out,'fixture');fs.mkdirSync(out,{recursive:true});
const g=lib.readGame(process.cwd(),'star-caravan');g.name='boss-chain';g.title='BOSS CHAIN';g.debugBossMode=true;g.stageFade=false;g.timeLimit=false;g.bossCelebration=false;g.mode='campaign';
g.screens.find(s=>s.id==='title').stageSelect=true;g.player.x=80;g.player.y=120;g.player.lives=1;g.player.invulnerability=1;g.continue={enabled:true,seconds:10,delaySeconds:0.1};
const template=structuredClone(g.stages[0]),b=g.bosses[0],p=g.patterns.find(p=>p.id===g.player.weapon),attack=g.patterns.find(p=>p.id===b.phases[0].pattern);
Object.assign(p,{damage:255,speed:8,emitterOffsets:[{x:0,y:0}]});Object.assign(attack,{kind:'aimed',angle:0,speed:2,count:1,interval:20,delay:10,emitterOffsets:[{x:0,y:0}]});
b.battle={background:'bg-bullets',maxBullets:40};b.phases=[{...b.phases[0],until:'hp',hp:1,threshold:0,motion:{...b.motion,kind:'straight',vx:0,vy:0},attacks:[]}];delete b.phases[0].intro;
g.stages=[0,1].map(i=>({...structuredClone(template),id:'boss-'+i,name:'Boss '+i,clearOnBoss:true,requireBoss:true,events:[
 {id:'road',frame:10,kind:'enemy',ref:g.enemies[0].id,x:32,y:30,count:1,spacing:0,interval:0,value:0},
 {id:'boss',frame:600,kind:'boss',ref:b.id,x:80,y:36,count:1,spacing:0,interval:0,value:0}]}));
g.stageOrder=g.stages.map(s=>s.id);g.startStage=g.stageOrder[0];
const presentation=process.argv.includes('--v34');
if(presentation){
 g.player.characters=[{id:'alternate',name:'ALTERNATE',asset:g.player.asset,speed:g.player.speed,weapon:g.player.weapon}];
 for(let i=0;i<2;i++)g.assets.push({id:'ending-'+i,name:'Ending '+i,kind:'screen',width:160,height:144,palette:0,origin:{x:80,y:72},hitbox:{x:0,y:0,w:160,h:144},emitters:[],frames:[{id:'ending-f'+i,image:'images/ending-'+i+'.png',duration:1,pixels:Array(160*144).fill(i+1)}]});
 g.ending={seconds:10,slides:[{id:'ending-base',background:'ending-0'}],characterSlides:[{id:'ending-alternate',character:'alternate',slides:[{id:'ending-alt',background:'ending-1'}]}]};
}
if(process.argv.includes('--right-timed')){
 const hud=lib.readGame(process.cwd(),'touhou-kouma').screens.find(s=>s.id==='hud');
 g.screens=g.screens.map(s=>s.id==='hud'?hud:s);g.player.x=60;
 for(const stage of g.stages)stage.events.find(e=>e.kind==='boss').x=60;
 b.phases=Array.from({length:3},(_,i)=>({...structuredClone(b.phases[0]),id:'mode-'+i,hp:100,timeLimitSeconds:60,score:100}));
}
if(!process.argv.includes('--reuse')){assert.deepEqual(lib.validate(g).filter(d=>d.severity==='error'),[]);for(const d of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(d,path.join(fixture,d),{recursive:true});fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});if(fs.existsSync(path.join(fixture,'projects/'+g.name)))lib.saveGame(fixture,g.name,g);else lib.createProject(fixture,g.name,g.title,g);lib.compile(fixture,g.name,'Debug',s=>fs.appendFileSync(path.join(out,'build.log'),s));}
const file=path.join(fixture,'projects/boss-chain/build/Debug/boss-chain.gb'),rom=fs.readFileSync(file),s=symbols(file.replace(/gb$/,'map')),results=[];
for(const [mode,label] of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']])for(const character of (presentation?[0,1]:[0])){
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000],until=(f,max=3000)=>{for(let n=0;n<max;n++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error(label+' timeout '+JSON.stringify(settledTrace(gb,s._ce_trace)));},tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,6);};
 try{
  until(t=>t.scene===0);for(let n=0;n<10;n++)tap(PadKey.B);assert.equal(byte('_ce_boss_mode'),1);tap(PadKey.A);
  if(presentation){until(t=>t.scene===10);if(character)tap(PadKey.Right);tap(PadKey.A);}
  until(t=>t.scene===1&&t.bossHp>0);gb.key_press(PadKey.A);const seen=new Set();
  const pauses=new Map();let frame=0,explosion=false;
  const cleared=until(t=>{frame++;if(t.scene===15){const p=pauses.get(t.stage)??{first:frame,last:frame,tick:t.tick};p.last=frame;assert.equal(t.tick,p.tick);pauses.set(t.stage,p);const r=memory(gb).ram;for(let i=0;i<39;i++)explosion ||= r[s._ce_entities-0xc000+i*25]===5;}if(t.scene===1){seen.add(t.stage);assert(t.stageTick>=600);assert(t.stageTick<800); }return t.result===2&&t.scene===3;});
  gb.key_lift(PadKey.A);frames(gb,8);assert.deepEqual([...seen],[0,1]);assert(cleared.score>0);
  assert(explosion);assert.equal(pauses.size,2);for(const p of pauses.values())assert(p.last-p.first>=55,'one-second visible hold, allowing trace polling overhead');
  if(presentation){const m=memory(gb),v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4)),tile=v[0x1800],off=0x1000+(tile<128?tile:tile-256)*16;assert.equal((v[off]&1)|((v[off+1]&1)<<1),character+1,'clear artwork follows the selected ending route');}
  if(process.argv.includes('--right-timed'))assert.equal(cleared.score,600,'six mode awards, no duplicate final-boss award');
  assert.deepEqual([...memory(gb).ram.subarray(s._ce_scores-0xc000,s._ce_scores-0xc000+10)],Array(10).fill(0),'debug run never enters rankings');
  tap(PadKey.A);until(t=>t.scene===0);tap(PadKey.Down);tap(PadKey.Right);tap(PadKey.Start);
  if(presentation){until(t=>t.scene===10);if(character)tap(PadKey.Right);tap(PadKey.A);}
  until(t=>t.scene===1&&t.stage===1&&t.bossHp>0);until(t=>t.scene===13);
  tap(PadKey.Start);const continued=until(t=>t.scene===1&&t.stage===1&&!t.result&&t.bossHp>0);
  assert.equal(continued.score,0);assert.equal(continued.lives,1);assert.equal(byte('_ce_boss_mode'),1);assert(continued.stageTick<650);
  results.push({mode:label,character,explosion,pauses:[...pauses.values()],selectedClear:presentation,twoBossChain:true,lastBossClear:true,noRanking:true,bossSelect:true,continueSameBoss:true,scoreReset:true});console.log(results.at(-1));
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({diagnostic:true,rom:file,results},null,2));
