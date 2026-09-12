import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,trace,settledTrace,entityState,simulatedEntities,assertPublishedOam,GameBoyMode,PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const require=createRequire(import.meta.url),lib=require('../build/library.cjs'),root=path.resolve(import.meta.dirname,'../..');
const normal=()=>lib.normalMotion();
function makeFixture(){
 const game=lib.readGame(root,'side-caravan');game.stageFade=false;game.bossCelebration=false;game.player.invulnerability=1024;
 game.player.respawnDelay=12;game.player.bomb.flashPeriod=4;game.performance.enemies=8;
 for(const item of game.items){item.motion=normal();item.lifetime=240;}
 const s=game.stages[0];s.width=512;s.height=18;s.tiles=Array.from({length:512*18},(_,i)=>(i%512+Math.floor(i/512))%4);s.walls=Array(s.tiles.length).fill(0);
 s.loopMap=true;s.scrollSpeed=4;s.clearOnBoss=false;s.requireBoss=false;s.duration=120;
 s.parallax={enabled:true,firstTile:0,width:3,height:1,divisor:3};
 s.destructibles.types=[{id:'panel',name:'PANEL',tiles:[32,33,34,35],hp:3,score:40,solid:false},{id:'cache',name:'CACHE',tiles:[40,41,42,43],hp:1,score:50,solid:false,dropItem:'score'}];
 s.destructibles.objects=Array.from({length:511},(_,i)=>({id:`object-${i}`,type:i===10?'cache':'panel',x:4+Math.floor(i/8)*2,y:i%8*2}));
 s.destructibles.objects.push({id:'object-511',type:'panel',x:510,y:16});
 const event=(id,frame,kind,ref,x=game.player.x,y=game.player.y,extra={})=>({id,frame,kind,ref,x,y,count:1,spacing:0,spacingY:0,interval:0,value:0,...extra});
 s.events=['power','power','power','speed','bomb','life','score'].map((ref,i)=>event(`pickup-${i}`,i*3,'item',ref));
 game.enemies.push({id:'moving-test',name:'MOVING',asset:'drone',hp:255,score:3,motion:{...normal(),kind:'wave',oscillationAxis:'y',vx:-0.125,amplitude:16,period:128},pattern:'core-final'});
 game.enemies.push({id:'contact-test',name:'CONTACT',asset:'drone',hp:255,score:0,motion:normal(),pattern:''});
 s.events.push(event('moving',60,'enemy','moving-test',150,40));
 s.events.push(event('stop',120,'scroll','',0,0,{value:0}));s.events.push(event('resume',160,'scroll','',0,0,{value:4}));
 s.events.push(event('real-death',1100,'enemy','contact-test'));
 const pickupArt=game.items[0].asset;
 game.items.push({id:'combo-cap',name:'COMBINED CAPS',asset:pickupArt,motion:normal(),lifetime:240,effects:[{kind:'shot',amount:8},{kind:'speed',amount:8},{kind:'bomb',amount:8},{kind:'life',amount:8},{kind:'score',amount:500}]});
 game.items.push({id:'score-cap',name:'SCORE CAP',asset:pickupArt,motion:normal(),lifetime:240,effects:[{kind:'score',amount:65535}]});
 s.events.push(event('combo-first',1180,'item','combo-cap'),event('combo-at-cap',1183,'item','combo-cap'),event('score-at-cap',1190,'item','score-cap'));
 return game;
}
function fixtureRoot(){const dir=fs.mkdtempSync(path.join(root,'.cache/horizontal-rom-'));fs.mkdirSync(path.join(dir,'projects'));for(const relative of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,relative),path.join(dir,relative),{recursive:true});return dir;}
const byte=(m,s,name)=>m.ram[s[name]-0xc000];
function hp(m,s,index){const v=m.ram[s._ce_object_hp-0xc000+(index>>1)];return index&1?v>>4:v&15;}
function camera(m,s){return m.ram.readUInt16LE(s._ce_state-0xc000+4);}
function assertBackground(gb,syms,game,label){
 const m=memory(gb),s=game.stages[0],art=game.assets.find(a=>a.id===s.tileset),top=game.screens.find(s=>s.id==='hud').dock==='top'?lib.hudHeight(game):0;
 const v=m.state.subarray(m.state.readUInt32LE(m.core+0xa4)),map=m.io[0x40]&8?0x1c00:0x1800,cam=camera(m,syms)>>4,objects=lib.destructibleIndex(s);
 let checked=0;
 for(let y=top;y<top+144-lib.hudHeight(game);y++)for(let x=0;x<160;x++){
  const wx=(x+cam)%(s.width*8),wy=y-top,cell=Math.floor(wy/8)*s.width+Math.floor(wx/8),object=objects.get(Math.floor(wy/16)*Math.ceil(s.width/2)+Math.floor(wx/16));
  let tile=s.tiles[cell];if(object!==undefined&&hp(m,syms,object)){const o=s.destructibles.objects[object],type=s.destructibles.types.find(t=>t.id===o.type);tile=type.tiles[(Math.floor(wy/8)-o.y)*2+Math.floor(wx/8)-o.x];}
  let sampleX=(tile%(art.width/8))*8+(wx&7),sampleY=Math.floor(tile/(art.width/8))*8+(wy&7);
  // Independent 24px texture-strip oracle: a third-speed texture counteracts the main camera.
  const par=s.parallax;
  if(par?.enabled&&tile>=par.firstTile&&tile<par.firstTile+3){const textureX=((tile-par.firstTile)*8+(wx&7)+Math.floor(cam/3)-cam)%24,wrappedX=(textureX+24)%24,sourceTile=par.firstTile+Math.floor(wrappedX/8);sampleX=(sourceTile%(art.width/8))*8+(wrappedX&7);sampleY=Math.floor(sourceTile/(art.width/8))*8+(wy&7);}
  const expected=art.frames[0].pixels[sampleY*art.width+sampleX];
  const bx=(x+m.io[0x43])&255,by=(y+m.io[0x42])&255,mapIndex=map+(by>>3)*32+(bx>>3),actualTile=v[mapIndex],off=(m.io[0x40]&16?actualTile*16:0x1000+(actualTile<128?actualTile:actualTile-256)*16)+(by&7)*2,bit=7-(bx&7),actual=((v[off]>>bit)&1)|(((v[off+1]>>bit)&1)<<1);
  assert.equal(actual,expected,`${label} BG pixel (${x},${y}) world (${wx},${wy}) tile ${tile}`);checked++;
 }
 return checked;
}

test('horizontal DMG/CGB ROM: C/TS parity,512th object, column wrapping, pickups,5way, bomb and death persistence',{timeout:600000},()=>{
 const dir=process.env.CE_HORIZONTAL_REUSE||fixtureRoot(),game=makeFixture();
 let report;
 if(process.env.CE_HORIZONTAL_REUSE){report=JSON.parse(fs.readFileSync(path.join(dir,'projects/horizontal-test/build/Debug/caravan-build.json'),'utf8'));}
 else {lib.createProject(dir,'horizontal-test','HORIZONTAL TEST',game);report=lib.compile(dir,'horizontal-test','Debug',()=>{});}
 const file=report.romPath,rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map'));
 assert.ok(report.ramBytes<=7168,'retain1024byte stack reserve');
 const results=[];
 for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
  const label=mode===GameBoyMode.Dmg?'DMG':'CGB',gb=boot(rom,mode),sim=new lib.Simulation(game);let checked=0,lastTick=0,wrapped=false,previousCamera=0,peakShots=0,deathChecked=false,capsChecked=false,scrollPixels=0;
  try{
   frames(gb,240);gb.key_press(PadKey.A);
   for(let n=0;n<5000;n++){
    frames(gb,1);const t=settledTrace(gb,syms._ce_trace);if(!t||t.scene!==1||t.tick===lastTick)continue;
    while(sim.tick<t.tick&&!sim.result)sim.step(16);
    const {scene,stageTick,bossPhase,...actual}=t;assert.deepEqual(actual,sim.trace,`${label} trace ${t.tick}`);
    assert.deepEqual(entityState(gb,syms,game),simulatedEntities(sim),`${label} entity ${t.tick}`);
    const m=memory(gb),cam=camera(m,syms);assert.equal(cam,sim.camera);
    assert.deepEqual(m.ram.subarray(syms._ce_object_hp-0xc000,syms._ce_object_hp-0xc000+256),Buffer.from(sim.objectHp),`${label} all packed object HP tick ${t.tick}`);
    assert.equal(m.io[0x43],(cam>>4)&255);assert.equal(m.io[0x42],248);
    if(!scrollPixels&&t.tick>=4&&t.tick<12)scrollPixels=assertBackground(gb,syms,game,`${label} ordinary scrolling parallax`);
    if(previousCamera>60000&&cam<1000)wrapped=true;previousCamera=cam;
    const shots=entityState(gb,syms,game).filter(e=>e.kind==='pshot');peakShots=Math.max(peakShots,shots.length);
    if(t.tick===24||t.tick>24&&lastTick<24){assert.equal(byte(m,syms,'_ce_shot_level'),3);assert.equal(byte(m,syms,'_ce_speed_level'),1);assert.equal(byte(m,syms,'_ce_bombs'),3);assert.equal(t.lives,4);assert.ok(t.score>=500);}
    if(t.tick>=1140&&lastTick<1140){assert.equal(t.lives,3,'actual enemy contact loses one of four lives');assert.equal(byte(m,syms,'_ce_shot_level'),2,'miss reduces shot by one level');assert.equal(byte(m,syms,'_ce_speed_level'),1,'miss retains speed');deathChecked=true;}
    if(t.tick>=1186&&lastTick<1186){
     assert.equal(byte(m,syms,'_ce_shot_level'),3);assert.equal(byte(m,syms,'_ce_speed_level'),3);assert.equal(byte(m,syms,'_ce_bombs'),9);assert.equal(t.lives,9);
     const combo=game.items.findIndex(i=>i.id==='combo-cap');for(let slot=0;slot<39;slot++){const p=syms._ce_entities-0xc000+slot*25;assert.ok(m.ram[p]!==6||m.ram[p+1]!==combo,'already-maxed combined pickup is consumed');}capsChecked=true;
    }
    assert.equal(hp(m,syms,511),3,'highest object ID keeps separate packed HP');
    if(t.tick%41===0)assertPublishedOam(gb,syms,game,mode);
    lastTick=t.tick;checked++;if(t.tick>1220)break;
   }
   assert.ok(checked>400);assert.ok(wrapped,'512tile looping camera crosses65536 without zero-length division');assert.ok(peakShots>=5);
   assert.ok(deathChecked);assert.ok(capsChecked);assert.ok(scrollPixels);assert.equal(sim.lives,9);assert.equal(sim.score,65535,'actual combined pickups and later scoring saturate at65535');
   capture(gb,path.join(dir,`${label}-parity.png`));
   results.push({mode:label,paritySnapshots:checked,wrapped,peakShots,combinedEffectsAtCaps:true,finalScore:sim.score,ordinaryScrollPixels:scrollPixels});
  }catch(error){capture(gb,path.join(dir,`${label}-failure.png`));throw error;}finally{gb.free();}

  // Independently use real input to test bomb hold/re-arm and post-bomb VRAM restoration.
  const bomb=boot(rom,mode);try{
   frames(bomb,240);bomb.key_press(PadKey.Start);frames(bomb,6);bomb.key_lift(PadKey.Start);
   const until=(predicate,limit=1000)=>{for(let n=0;n<limit;n++){const t=settledTrace(bomb,syms._ce_trace),m=memory(bomb);if(t&&predicate(t,m))return {t,m};frames(bomb,1);}throw Error(label+' bomb route timed out');};
   until(t=>t.scene===1&&t.tick>=25);let before=until(t=>t.scene===1&&t.tick>=32),stock=byte(before.m,syms,'_ce_bombs');
   const old=Buffer.from(before.m.ram.subarray(syms._ce_object_hp-0xc000,syms._ce_object_hp-0xc000+256));
   bomb.key_press(PadKey.B);until((t,m)=>byte(m,syms,'_ce_bomb_left')>0);
   const after=until((t,m)=>t.scene===1&&byte(m,syms,'_ce_bomb_left')===0&&t.tick>before.t.tick);
   const pixels=assertBackground(bomb,syms,game,`${label} bomb restore`);
   assert.equal(byte(after.m,syms,'_ce_bombs'),stock-1);assert.ok(after.t.score>before.t.score,'bomb scores visible BG');
   const destroyed=[];for(let i=0;i<512;i++){const was=i&1?old[i>>1]>>4:old[i>>1]&15;if(was&&hp(after.m,syms,i)===0)destroyed.push(i);}
   assert.ok(destroyed.length>0);frames(bomb,80);const held=memory(bomb);assert.equal(byte(held,syms,'_ce_bombs'),stock-1,'holding B uses only one bomb');
   for(const i of destroyed)assert.equal(hp(held,syms,i),0,'stage reload and scroll preserve destruction');
   bomb.key_lift(PadKey.B);frames(bomb,4);bomb.key_press(PadKey.B);until((t,m)=>byte(m,syms,'_ce_bomb_left')>0);assert.equal(byte(memory(bomb),syms,'_ce_bombs'),stock-2);
   const far=until((t,m)=>t.scene===1&&byte(m,syms,'_ce_bomb_left')===0&&camera(m,syms)>=4000*16,5000);
   assert.equal(hp(far.m,syms,511),3,'object511 is alive when its final map column enters view');
   bomb.key_lift(PadKey.B);until((t,m)=>t.tick>far.t.tick&&byte(m,syms,'_ce_bomb_latch')===0);bomb.key_press(PadKey.B);until((t,m)=>byte(m,syms,'_ce_bomb_left')>0);
   const last=until((t,m)=>t.scene===1&&byte(m,syms,'_ce_bomb_left')===0&&t.tick>far.t.tick);
   assert.equal(hp(last.m,syms,511),0,'third bomb destroys actual ROM instance511');assert.equal(hp(last.m,syms,510),hp(far.m,syms,510),'the adjacent HP nibble is unchanged');
   assertBackground(bomb,syms,game,`${label} object511 restore`);
   capture(bomb,path.join(dir,`${label}-bomb.png`));results.at(-1).bombDestroyed=destroyed.length;results.at(-1).postBombBackgroundPixels=pixels;results.at(-1).highestObjectDestroyed=true;
  }finally{bomb.free();}
 }
 fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({fixture:true,rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),ramBytes:report.ramBytes,results},null,2));
 console.log('Horizontal ROM acceptance:',path.join(dir,'results.json'));
});
