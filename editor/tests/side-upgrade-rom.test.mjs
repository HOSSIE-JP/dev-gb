// Short authored fixture. The separate side-caravan-play acceptance uses the
// unchanged production ROM for the full 60-second route.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,trace,entityState,simulatedEntities,GameBoyMode,PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=path.resolve(import.meta.dirname,'../..');
function fixture(){
 const g=lib.readGame(root,'side-caravan');g.stages=[g.stages[0]];g.stageOrder=[g.startStage];g.bossCelebration=false;g.player.invulnerability=0;g.player.bomb.damage=1;
 g.screens.find(s=>s.id==='hud').dock='bottom';g.player.respawnDelay=12;
 for(const item of g.items){item.motion={...lib.normalMotion(),vx:0,vy:0};item.lifetime=240;}
 g.items.find(i=>i.id==='barrier').effects=[{kind:'barrier',amount:8},{kind:'score',amount:500}];
 const s=g.stages[0];s.width=64;s.tiles=Array(64*18).fill(0);s.walls=Array(s.tiles.length).fill(0);s.destructibles.objects=[];s.scrollSpeed=.75;s.requireBoss=false;s.clearOnBoss=false;
 const event=(frame,kind,ref,x=28,y=76)=>({id:'event-'+frame,frame,kind,ref,x,y,count:1,spacing:0,interval:0,value:0});
 g.enemies.push({...structuredClone(g.enemies[0]),id:'contact',hp:1,score:10,motion:{...lib.normalMotion(),vx:0,vy:0},pattern:''});
 s.events=[event(5,'item','barrier'),event(10,'enemy','contact'),event(65,'item','barrier'),event(70,'item','laser'),event(90,'item','power'),event(200,'item','barrier'),event(240,'boss',g.bosses[0].id,116,72)];
 const b=g.bosses[0];b.hp=255;
 // A distant contact probe intersects the player while the weakpoint remains
 // 88 pixels away, proving the C body path rather than weakpoint collision.
 b.contactBoxes=[{x:-90,y:0,w:8,h:8}];
 for(const [i,p] of b.phases.entries()){
  delete p.hp;p.until=i===2?'hp':'time';p.threshold=i===2?0:128;p.motion={...lib.normalMotion(),vx:0,vy:0,kind:i===0?'path':'wave',smooth:true,oscillationAxis:'y',amplitude:16,period:i===1?256:1024,loop:false,points:[{frame:0,x:0,y:0},{frame:100,x:-13,y:17}]};
 }
 return g;
}
const inputAt=t=>16|((t>=100&&t<110)?1:(t>=112&&t<122)?2:0)|([100,350].includes(t)?32:0);
test('DMG/CGB C-preview parity: live bomb, barrier, laser, smooth endpoints and bottom-HUD giant boss',{timeout:600000},()=>{
 const dir=process.env.CE_SIDE_UPGRADE_REUSE||fs.mkdtempSync(path.join(root,'.cache/side-upgrade-rom-')),g=fixture();
 if(!process.env.CE_SIDE_UPGRADE_REUSE){fs.mkdirSync(path.join(dir,'projects'));for(const f of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,f),path.join(dir,f),{recursive:true});lib.createProject(dir,'upgrade','UPGRADE TEST',g);lib.compile(dir,'upgrade','Debug',()=>{});}
 const file=path.join(dir,'projects/upgrade/build/Debug/upgrade.gb'),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map'));
 const start=rom.indexOf(Buffer.from([0x21,(s._ce_trace+22)&255,(s._ce_trace+22)>>8,0x36,0]),s._ce_trace_write)+5;assert.ok(start>s._ce_trace_write);
 const results=[];
 for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
  const label=mode===GameBoyMode.Dmg?'DMG':'CGB',gb=boot(rom,mode),sim=new lib.Simulation(g),held=new Set(),phases=new Set();let checked=0,last=-1,live=0,peakBarrier=0;
  const input=mask=>{for(const [bit,key] of [[1,PadKey.Right],[2,PadKey.Left],[16,PadKey.A],[32,PadKey.B]]){if(mask&bit){if(!held.has(key)){gb.key_press(key);held.add(key);}}else if(held.delete(key))gb.key_lift(key);}};
  try{
   frames(gb,240);gb.key_press(PadKey.Start);frames(gb,4);gb.key_lift(PadKey.Start);
   for(let i=0;i<3000;i++){
    gb.step_to(start);const t=trace(gb,s._ce_trace),m=memory(gb);if(!t||t.scene!==1){gb.clock();continue;}
    if(t.tick!==last){
     while(sim.tick<t.tick&&!sim.result)sim.step(inputAt(sim.tick));
     const {scene,stageTick,bossPhase,...actual}=t;assert.deepEqual(actual,sim.trace,label+' trace '+t.tick);
     assert.deepEqual(entityState(gb,s,g),simulatedEntities(sim),label+' entities '+t.tick);
     const byte=name=>m.ram[s[name]-0xc000];
     assert.equal(byte('_ce_barrier'),sim.barrier,label+' barrier '+t.tick);peakBarrier=Math.max(peakBarrier,sim.barrier);
     assert.equal(byte('_ce_bomb_left'),sim.bombLeft,label+' bomb '+t.tick);if(sim.bombLeft)live++;
     assert.equal(byte('_ce_bombs'),sim.bombs);assert.equal(byte('_ce_player_weapon'),g.patterns.findIndex(p=>p.id===sim.currentWeapon));
     assert.equal(m.ram.readUInt16LE(s._ce_state-0xc000+4),sim.camera);
     const shots=[];for(let slot=0;slot<32;slot++)if(m.ram.readUInt16LE(s._ce_bg_life-0xc000+slot*2))shots.push({slot,x:m.ram.readUInt16LE(s._ce_bg_x-0xc000+slot*2)/16,y:m.ram.readUInt16LE(s._ce_bg_y-0xc000+slot*2)/16});
     assert.deepEqual(shots,sim.bgShots.map(({slot,x,y})=>({slot,x,y})).sort((a,b)=>a.slot-b.slot),label+' BG shots '+t.tick);
     const boss=sim.entities.find(e=>e.kind==='boss');if(boss){phases.add(boss.phase);assert.equal(byte('_ce_giant_x'),(g.assets.find(a=>a.id===g.bosses[0].battle.graphic).origin.x-Math.trunc(boss.x/16))&255);assert.equal(byte('_ce_giant_y'),(72-Math.trunc(boss.y/16))&255);}
     if(t.tick===242){assert.ok(sim.barrier<3,'body contact consumes barrier outside the weakpoint');assert.equal(sim.lives,3);}
     checked++;last=t.tick;if(t.tick>=700)break;
    }
    input(inputAt(t.tick));gb.clock();
   }
   assert.ok(checked>600);assert.equal(peakBarrier,3);assert.equal(phases.size,3);assert.equal(live,96);capture(gb,path.join(dir,label+'-bottom-hud.png'));
   results.push({mode:label,checked,live,peakBarrier,phases:[...phases]});
  }catch(e){capture(gb,path.join(dir,label+'-failure.png'));throw e;}finally{gb.free();}
 }
 fs.writeFileSync(path.join(dir,'result.json'),JSON.stringify({fixture:true,results},null,2));console.log('upgrade fixture',dir,results);
});
