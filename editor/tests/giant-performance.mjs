// Same authored load for both engines; samples actual CPU cycles and BG pixels.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,trace,GameBoyMode,PadKey} from './emulator.mjs';import {backgroundColors,backgroundPixels} from './presentation-qa.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=process.cwd(),out=path.resolve(process.argv[2]),engine=path.resolve(process.argv[3]||'engine');fs.mkdirSync(out,{recursive:true});
const dir=path.join(out,'fixture');fs.mkdirSync(dir,{recursive:true});fs.cpSync(engine,path.join(dir,'engine'),{recursive:true});for(const tool of ['gbdk','misaki'])fs.cpSync('.tools/'+tool,path.join(dir,'.tools',tool),{recursive:true});
const g=lib.readGame(root,'side-caravan');g.stageFade=false;g.timeLimit=false;g.bossCelebration=false;g.player.invulnerability=1024;g.player.lives=9;
if(process.env.CE_BENCH_DENSE)g.performance={...g.performance,dense:true};
g.stages=[g.stages[0]];g.stageOrder=[g.startStage];const stage=g.stages[0];stage.width=32;stage.tiles=Array(32*18).fill(0);stage.walls=Array(32*18).fill(0);stage.destructibles.objects=[];stage.scrollSpeed=0;stage.requireBoss=false;stage.clearOnBoss=false;stage.duration=60;
delete stage.presentation;const boss=g.bosses[0];boss.hp=255;boss.battle.maxBullets=32;boss.motion=lib.normalMotion();
const p=g.patterns.find(p=>p.id===boss.phases.find(p=>p.pattern).pattern);Object.assign(p,{kind:'fan',count:8,angle:270,spread:140,speed:0.6,interval:40,delay:0,lifetime:240});
boss.pattern=p.id;boss.attacks=[];boss.phases=[{...boss.phases[0],hp:255,until:'hp',threshold:0,pattern:p.id,attacks:[],motion:lib.normalMotion()}];boss.contactBoxes=[];stage.events=[{id:'boss',kind:'boss',ref:boss.id,frame:0,x:120,y:72,count:1,spacing:0,interval:0,value:0}];
console.log(lib.validate(g).filter(d=>d.severity==='error'));fs.mkdirSync(path.join(dir,'projects'),{recursive:true});lib.createProject(dir,'giant-bench','GIANT BENCH',g);const report=lib.compile(dir,'giant-bench','Debug',()=>{}),rom=fs.readFileSync(report.romPath),s=symbols(report.romPath.replace(/\.gb$/,'.map')),results=[];
for(const [label,mode]of [['DMG',GameBoyMode.Dmg],['CGB',GameBoyMode.Cgb]]){
 const gb=boot(rom,mode),gaps=[],hash=crypto.createHash('sha256');let cycles=0,last=0,previous=0,peak=0;
 try{frames(gb,240);gb.key_press(PadKey.Start);frames(gb,5);gb.key_lift(PadKey.Start);gb.step_to(s._ce_step);
 for(let i=0;i<1500;i++){cycles+=gb.clock();cycles+=gb.step_to(s._ce_step);const t=trace(gb,s._ce_trace);if(!t||t.scene!==1||t.tick<=previous)continue;
 if(previous>=120){assert.equal(t.tick,previous+1);gaps.push((cycles-last)/(70224*gb.multiplier()));hash.update(JSON.stringify({tick:t.tick,bg:mode===GameBoyMode.Cgb?backgroundColors(gb):backgroundPixels(gb)}));}
 const m=memory(gb);peak=Math.max(peak,m.ram[s._ce_bg_count-0xc000]);previous=t.tick;last=cycles;if(t.tick>=480)break;}
 assert.equal(previous,480);assert.ok(peak>=24);const sorted=[...gaps].sort((a,b)=>a-b);results.push({mode:label,peakShots:peak,samples:gaps.length,mean:gaps.reduce((a,b)=>a+b,0)/gaps.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),pixelHash:hash.digest('hex')});
 }finally{gb.free();}}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:report.romPath,ramBytes:report.ramBytes,projectRevision:lib.revision(g),results},null,2));console.log(results);
