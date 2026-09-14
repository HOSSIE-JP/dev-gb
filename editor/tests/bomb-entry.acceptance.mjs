// Scheduled arrivals through all four edges, durable and weak targets, slot reuse.
// Compiled fixture; normal joypad inputs only, no emulator memory writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const root=process.cwd(),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v19/entries'),fixture=path.join(out,'fixture'),name='bomb-entry';fs.mkdirSync(fixture,{recursive:true});
if(!process.argv.includes('--reuse')){
 for(const d of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,d),path.join(fixture,d),{recursive:true});
 const g=lib.readGame(root,'star-caravan'),kouma=lib.readGame(root,'touhou-kouma');g.name=name;g.mode='campaign';g.stageFade=false;g.timeLimit=false;g.player.x=144;g.player.invulnerability=1024;g.player.bomb=kouma.player.bomb;
 g.assets.push(...kouma.assets.filter(a=>['bomb-yinyang','bomb-spark'].includes(a.id)).map(a=>({...a,palette:0})));
 g.player.characters=[{id:'marisa',name:'MARISA',asset:g.player.asset,speed:2.5,weapon:g.player.weapon,bombBackground:'bomb-spark',bombStyle:'beam'}];
 g.effects.duration=3;
 const straight=(vx=0,vy=0)=>({kind:'straight',vx,vy,amplitude:0,period:120,points:[{frame:0,x:0,y:0},{frame:120,x:0,y:0}],loop:false});
 const template=g.enemies[0];g.enemies=[['present',0,0],['right',-1,0],['left',1,0],['top',0,1],['bottom',0,-1],['late',0,0],['weak',0,0],['after',0,0]].map(([id,vx,vy])=>({...template,id,hp:id==='weak'?10:60,score:10,pattern:'',attacks:[],motion:straight(vx,vy)}));
 const s=g.stages[0];s.scrollSpeed=0;s.walls.fill(0);s.requireBoss=false;s.clearOnBoss=false;s.events=[];
 for(const [i,[frame,ref,x,y]]of [[0,'present',32,40],[0,'right',176,72],[0,'left',-24,96],[0,'top',104,-24],[0,'bottom',104,168],[10,'weak',56,40],[18,'weak',56,40],[24,'late',80,48],[90,'after',120,60]].entries())s.events.push({id:'arrival-'+i,frame,kind:'enemy',ref,x,y,count:1,spacing:0,interval:0,value:0});
 const errors=lib.validate(g).filter(d=>d.severity==='error');assert.deepEqual(errors,[]);
 fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});if(fs.existsSync(path.join(fixture,'projects',name)))lib.saveGame(fixture,name,g);else lib.createProject(fixture,name,'BOMB ENTRY',g);lib.compile(fixture,name,'Debug',()=>{});
}
const file=path.join(fixture,'projects',name,'build/Debug',name+'.gb'),g=lib.readGame(fixture,name),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+character;
 const snap=()=>{if(memory(gb).ram[syms._ce_scene-0xc000]===1)settledTrace(gb,syms._ce_trace);const r=memory(gb).ram,b=n=>r[syms[n]-0xc000],p=syms._ce_state-0xc000,t=syms._ce_trace-0xc000,entities=[];
  for(let i=0;i<39;i++){const e=syms._ce_entities-0xc000+i*25;if(r[e])entities.push({slot:i,kind:r[e],ref:g.enemies[r[e+1]]?.id,hp:r[e+3],x:r.readInt16LE(e+12),y:r.readInt16LE(e+14)});}
  return{ready:r[t]===67&&r[t+1]===69&&!r[t+22],scene:b('_ce_scene'),tick:r.readUInt16LE(p),score:r.readUInt16LE(p+6),image:b('_ce_bomb_image'),left:b('_ce_bomb_left'),bombs:b('_ce_bombs'),character:b('_ce_character'),entities};};
 const until=(f,n=1600)=>{for(let i=0;i<n;i++){const s=snap();if(f(s))return s;frames(gb,1);}throw Error(label+' timeout '+JSON.stringify(snap()));};const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};
 try{
  until(s=>s.ready&&s.scene===0);tap(PadKey.Start);until(s=>s.ready&&s.scene===10);if(character){tap(PadKey.Right);frames(gb,80);}tap(PadKey.A);until(s=>s.ready&&s.scene===1&&s.tick>=4);frames(gb,1);
  gb.key_press(PadKey.A);gb.key_press(PadKey.B);const begin=until(s=>s.ready&&s.image);assert.ok(begin.tick<10);gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);
  const samples=[begin];for(let i=0;i<1500;i++){frames(gb,1);const s=snap();if(s.ready&&s.tick!==samples.at(-1).tick)samples.push(s);if(s.ready&&s.tick>100)break;}
  assert.ok(samples.at(-1).tick>100);
  for(const ref of ['present','right','left','top','bottom','late']){const damaged=samples.flatMap(s=>s.entities.filter(e=>e.kind===1&&e.ref===ref&&e.hp<60).map(e=>({tick:s.tick,hp:e.hp})));assert.ok(damaged.length,ref+' damaged');assert.ok(damaged.every(d=>d.hp===30),ref+' one packet');}
  const after=samples.at(-1).entities.find(e=>e.kind===1&&e.ref==='after');assert.equal(after.hp,60);assert.equal(samples.at(-1).score,20,'both weak arrivals award score once');
  const weakBursts=samples.filter(s=>s.image).flatMap(s=>s.entities.filter(e=>e.kind===5&&e.x===896).map(e=>({slot:e.slot,tick:s.tick})));
  assert.ok(weakBursts.some(e=>e.tick>=10&&e.tick<=14));assert.ok(weakBursts.some(e=>e.tick>=18&&e.tick<=22));assert.equal(new Set(weakBursts.map(e=>e.slot)).size,1,'reused actor slot damaged in both waves');
  capture(gb,path.join(out,label+'-after.png'));results.push({label,beginTick:begin.tick,damage:30,allFourEdges:true,lateSpawn:true,oncePerBomb:true,reusedSlot:true,expiredBombDamage:false,weakKillsScore:20,samples});console.log(label+' passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify(snap(),null,2));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,fixture:'STAR actors, actual Yin-Yang / Spark art, timed arrivals; no runtime patches',results},null,2));
