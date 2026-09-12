// Full authored roads, read-only SM83 timing; fixture omits the boss encounters.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v12/roads'),source=path.resolve(process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:root),fixture=path.join(out,'fixture'),baseline=process.argv.includes('--baseline');
const reuse=process.argv.includes('--reuse');
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});if(!reuse)for(const d of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,d),path.join(fixture,d),{recursive:true});
const g=lib.readGame(source,'touhou-kouma'),revision=lib.revision(g);g.name='road-test';g.stageFade=false;g.timeLimit=false;g.bossCelebration=false;g.ending.slides=[];g.ending.characterSlides=[];g.ending.scoreAfter=false;g.player.x=8;g.player.lives=9;g.player.invulnerability=1024;
for(const b of g.bosses)for(const p of b.phases)if(p.intro)p.intro.enabled=false;
for(const s of g.stages){const b=s.events.find(e=>e.kind==='boss');s.events=s.events.filter(e=>e!==b);s.events.push({...b,id:'road-end',kind:'end',ref:'',frame:b.frame-1});s.requireBoss=false;s.clearOnBoss=false;Object.assign(s.presentation,{enabled:false,clearEnabled:false});s.presentation.victoryDialogue.enabled=false;for(const v of s.presentation.characterDialogues??[]){v.before.enabled=false;v.after.enabled=false;}}
if(reuse)assert.equal(lib.revision(lib.readGame(fixture,'road-test')),lib.revision(g),'reused ROM requires the same authored fixture');
else if(!fs.existsSync(path.join(fixture,'projects/road-test')))lib.createProject(fixture,'road-test',g.title,g);else lib.saveGame(fixture,'road-test',g);
const file=process.argv.includes('--reuse')?path.join(fixture,'projects/road-test/build/Debug/road-test.gb'):lib.compile(fixture,'road-test','Debug',()=>{}).romPath,rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),t=syms._ce_trace;
const signature=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(signature,syms._ce_trace_write)+signature.length;assert.ok(published>syms._ce_trace_write&&published<syms._ce_sound);
const results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of (baseline?[0]:[0,1]))for(const fire of [false,true]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+character+'-'+(fire?'fire':'observe'),rows=new Map();let previous,ended=false;
 const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};
 try{
  frames(gb,240);tap(PadKey.Start);for(let n=0;n<400;n++){const r=memory(gb).ram;if(!r[t-0xc000+22]&&r[t-0xc000+17]===10)break;frames(gb,1);}frames(gb,2);if(character){tap(PadKey.Right);frames(gb,12);}tap(PadKey.A);
  for(let n=0;n<35000;n++){
   gb.step_to(published);const m=memory(gb),r=m.ram,tr=r.subarray(t-0xc000),byte=k=>r[syms[k]-0xc000],stageIndex=tr[4],stage=g.stages.find(s=>s.id===g.stageOrder[stageIndex]),tick=tr.readUInt16LE(18),ppu=gb.ppu_frame(),entities=[];
   if(tr[17]===3){ended=true;break;}assert.notEqual(tr[17],2,label+' survives fixture');
   if(tr[17]===1){
    if(!rows.has(stageIndex))rows.set(stageIndex,{stage:stage.id,planned:stage.events.filter(e=>e.kind==='enemy').reduce((n,e)=>n+e.count,0),observedSpawns:0,enemyPeak:0,shotPeak:0,oamPeak:0,scanlinePeak:0,scoreStart:tr.readUInt16LE(5),score:0,kills:0,rapidKills:0,lastKill:-9999,busy:[],gaps:[],drops:0,lives:tr[7]});
    const row=rows.get(stageIndex);let enemy=0,shots=0;for(let slot=0;slot<39;slot++){const p=syms._ce_entities-0xc000+slot*25,kind=r[p];if(kind===1){enemy++;entities.push({x:r.readInt16LE(p+12),y:r.readInt16LE(p+14)});if(r.readUInt16LE(p+6)===1)row.observedSpawns++;}if(kind===4)shots++;}
    if(enemy>row.enemyPeak){row.enemyPeak=enemy;capture(gb,path.join(out,label+'-'+stage.id+'-peak.png'));}
    row.shotPeak=Math.max(row.shotPeak,shots);row.oamPeak=Math.max(row.oamPeak,byte('_ce_pool_oam'));row.drops=tr.readUInt16LE(14);row.lives=tr[7];
    const lines=Array(144).fill(0);for(let i=0;i<40;i++){const y=m.oam[i*4]-16,x=m.oam[i*4+1]-8;if(x>=160||x<=-8)continue;for(let dy=0;dy<8;dy++)if(y+dy>=0&&y+dy<144)lines[y+dy]++;}row.scanlinePeak=Math.max(row.scanlinePeak,...lines);
    const score=tr.readUInt16LE(5);if(previous?.stage===stageIndex&&score>previous.score){row.kills++;if(tick-row.lastKill<=30)row.rapidKills++;row.lastKill=tick;}row.score=score-row.scoreStart;
    // Exclude stage loading / ending from gameplay throughput, on both ROMs.
    if(previous?.stage===stageIndex&&tick===previous.tick+1&&tick>64&&tick<stage.events.find(e=>e.kind==='end').frame-64){const gap=ppu-previous.ppu;row.gaps.push(gap);if(enemy>=3)row.busy.push(gap);}
    previous={stage:stageIndex,tick,ppu,score};
    for(const key of [PadKey.Left,PadKey.Right,PadKey.A,PadKey.B])gb.key_lift(key);
    if(fire)gb.key_press(character?PadKey.A:PadKey.B); // x8 keeps most enemies alive, with continuous player shots.
   }gb.clock();
  }
  assert.ok(ended);assert.equal(rows.size,7);
  const rate=a=>+(59.7275*a.length/a.reduce((n,v)=>n+v,0)).toFixed(3);
  const data=[...rows.values()].map(({gaps,busy,lastKill,scoreStart,...row})=>{assert.ok(gaps.length>1000);assert.ok(row.oamPeak<=40);if(!baseline){assert.ok(row.scanlinePeak<=10);if(!fire)assert.equal(row.observedSpawns,row.planned,'all authored enemies admitted');}return {...row,updatesPerSecond:rate(gaps),busyUpdatesPerSecond:rate(busy),oneFramePercent:+(100*gaps.filter(g=>g===1).length/gaps.length).toFixed(2),maxFrameGap:Math.max(...gaps)};});
  results.push({label,character,fire,stages:data});console.log(label);console.table(data.map(r=>({stage:r.stage,enemy:r.enemyPeak,shots:r.shotPeak,oam:r.oamPeak,line:r.scanlinePeak,spawns:r.observedSpawns,planned:r.planned,kills:r.kills,chains:r.rapidKills,fps:r.updatesPerSecond,busy:r.busyUpdatesPerSecond,maxGap:r.maxFrameGap})));
 }catch(error){capture(gb,path.join(out,label+'-failure.png'));throw error;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),authoredRevision:revision,fixture:'All road event times, enemies, patterns, maps, weapons and engine retained. Boss event becomes stage end; presentation disabled; player stays at x8 with 9 lives and 1024-update initial invulnerability. Fire case continuously shoots while leaving most enemies alive for load measurement. No RAM writes or engine patches.',baseline,results},null,2));
