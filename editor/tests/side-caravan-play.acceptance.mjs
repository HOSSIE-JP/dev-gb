// Unmodified production ROM, controller input only. No ROM/WRAM edits or shortened stage.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,trace,entityState,GameBoyMode,PadKey} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs');
const positional=process.argv.slice(2).filter(v=>!v.startsWith('--'));
const file=path.resolve(positional[0]??path.join(root,'projects/side-caravan/build/Debug/side-caravan.gb'));
const out=path.resolve(positional[1]??path.join(root,'.cache/side-caravan/play')),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),game=lib.readGame(root,'side-caravan');
fs.mkdirSync(out,{recursive:true});
const build=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'caravan-build.json'),'utf8'));
const romHash=crypto.createHash('sha256').update(rom).digest('hex');
assert.equal(build.romHash,romHash,'ROM matches its successful build manifest');
assert.equal(build.revision,lib.revision(game),'editable source matches the ROM under test');
const signal=Buffer.from([0x21,(s._ce_trace+22)&255,(s._ce_trace+22)>>8,0x36,0]);
const found=rom.indexOf(signal,s._ce_trace_write),published=found+signal.length;
assert.ok(found>=s._ce_trace_write&&found<s._ce_trace_write+1024,'trace publication instruction');
const requested=process.argv.find(v=>v.startsWith('--mode='))?.split('=')[1];
const modes=requested?[requested==='DMG'?GameBoyMode.Dmg:GameBoyMode.Cgb]:[GameBoyMode.Dmg,GameBoyMode.Cgb];
const results=[];
const stats=values=>({samples:values.length,mean:values.length?values.reduce((a,b)=>a+b,0)/values.length:0,max:values.length?Math.max(...values):0});
for(const mode of modes){
 const label=mode===GameBoyMode.Dmg?'DMG':'CGB',gb=boot(rom,mode),press=new Set(),gaps=[],regions=[[],[],[],[]],acquired=new Set(),phases=new Set(),seen=new Set(),dropEvents=[],bombDisplayFrames=[],pendingSince=new Map(),musicCues={};
 let lastTick=-1,lastFrame=0,lastScene=0,lastItems=new Map(),priorLives=3,priorPower=0,priorSpeed=0,priorBombs=2;
 let bombStarted=-1,peakPendingObjects=0,maxPendingAfterPublicationTicks=0;
 let peakOam=0,peakScanline=0,peakShots=0,peakItems=0,peakBg=0,peakPower=0,peakSpeed=0,bombUsed=0,misses=0,clear=false,last,pausing=0,pauseSeen=false,pausedTick=0,goalY=76,lastDropped=0;
 const input=keys=>{const next=new Set(keys);for(const k of press)if(!next.has(k)){gb.key_lift(k);press.delete(k);}for(const k of next)if(!press.has(k)){gb.key_press(k);press.add(k);}};
 const at=(m,key)=>m.ram[s[key]-0xc000];
 const objectsLeft=m=>game.stages[0].destructibles.objects.reduce((n,o,i)=>{const b=m.ram[s._ce_object_hp-0xc000+(i>>1)];return n+!!((b>>((i&1)*4))&15);},0);
 try{
  frames(gb,240);capture(gb,path.join(out,label+'-title.png'));
  musicCues.title=at(memory(gb),'_ce_music_track');assert.equal(musicCues.title,game.music.title);
  assert.ok(gb.audio_buffer_eager(true).some(sample=>sample!==0),'title music emits nonzero PCM without shooting');
  input([PadKey.Start]);frames(gb,4);input([]);
  for(let n=0;n<35000;n++){
   gb.step_to(published);const t=trace(gb,s._ce_trace),m=memory(gb);if(!t){gb.clock();continue;}last=t;
   const scene=t.scene,power=at(m,'_ce_shot_level'),speed=at(m,'_ce_speed_level'),bombs=at(m,'_ce_bombs');
   if(scene===3&&t.result===2){clear=true;input([]);frames(gb,90);capture(gb,path.join(out,label+'-clear.png'));break;}
   if(t.result===1){capture(gb,path.join(out,label+'-gameover.png'));break;}
   if(scene!==1){if(scene===11&&lastScene!==11){bombUsed++;bombStarted=lastFrame;capture(gb,path.join(out,label+'-bomb-'+bombUsed+'.png'));}lastScene=scene;input([]);gb.clock();continue;}
   const enemies=entityState(gb,s,game),items=enemies.filter(e=>e.kind==='item'),boss=enemies.find(e=>e.kind==='boss'),frame=gb.ppu_frame();
   const camera=m.ram.readUInt16LE(s._ce_state-0xc000+4)/16;
   if(bombStarted>=0){bombDisplayFrames.push(frame-bombStarted);bombStarted=-1;}
   const visible=game.stages[0].destructibles.objects.filter(o=>o.x*8>=camera&&o.x*8+16<=camera+160&&o.y<16).length;
   if(t.tick!==lastTick){
    if(lastTick>=0&&t.tick===lastTick+1&&lastScene===1&&!pausing&&t.tick>120){const gap=frame-lastFrame;gaps.push(gap);regions[boss?3:Math.min(2,Math.floor(t.stageTick/3600))].push(gap);}
    if(boss)phases.add(boss.phase);
    for(const [slot,item] of lastItems)if(!items.some(e=>e.slot===slot&&e.asset===item.asset)&&Math.abs(item.x/16-t.x/16)<18&&Math.abs(item.y/16-t.y/16)<16)acquired.add(item.asset.replace('item-',''));
    if(power>priorPower)acquired.add('power');if(speed>priorSpeed)acquired.add('speed');if(bombs>priorBombs&&t.lives===priorLives)acquired.add('bomb');if(t.lives>priorLives)acquired.add('life');
    if(t.lives<priorLives)misses+=priorLives-t.lives;
    priorLives=t.lives;priorPower=power;priorSpeed=speed;priorBombs=bombs;
    peakPower=Math.max(peakPower,power);peakSpeed=Math.max(peakSpeed,speed);
    // Queue age is observed after a completed update: objects flushed in that
    // same update are already absent. Report additional published ticks only.
    let pending=0;
    for(let id=0;id<game.stages[0].destructibles.objects.length;id++){
     const dirty=!!(m.ram[s._ce_object_dirty-0xc000+(id>>3)]&(1<<(id&7)));
     if(dirty){pending++;if(!pendingSince.has(id))pendingSince.set(id,t.tick);}
     else if(pendingSince.has(id)){maxPendingAfterPublicationTicks=Math.max(maxPendingAfterPublicationTicks,t.tick-pendingSince.get(id));pendingSince.delete(id);}
    }
    peakPendingObjects=Math.max(peakPendingObjects,pending);
    lastItems=new Map(items.map(e=>[e.slot,e]));
    const oam=at(m,'_ce_pool_oam');peakOam=Math.max(peakOam,oam);peakItems=Math.max(peakItems,items.length);peakShots=Math.max(peakShots,enemies.filter(e=>e.kind==='pshot').length);
    const scan=Array(144).fill(0);for(let i=0;i<40;i++){const y=m.oam[i*4]-16,x=m.oam[i*4+1]-8;if(x<=-8||x>=160)continue;for(let dy=0;dy<8;dy++)if(y+dy>=0&&y+dy<144)scan[y+dy]++;}
    const linePeak=Math.max(...scan);if(linePeak>peakScanline){peakScanline=linePeak;capture(gb,path.join(out,label+'-scanline-peak.png'));fs.writeFileSync(path.join(out,label+'-scanline-peak.json'),JSON.stringify({tick:t.tick,peak:linePeak,entities:enemies},null,2));}
    if(t.dropped!==lastDropped){dropEvents.push({tick:t.tick,delta:(t.dropped-lastDropped)&65535,entities:enemies.map(e=>({kind:e.kind,asset:e.asset,age:e.age}))});lastDropped=t.dropped;}
    peakBg=Math.max(peakBg,visible);
    const mark=boss?'boss-'+boss.phase:t.stageTick<3600?'approach':t.stageTick<7200?'deck':'reactor';
    if(!seen.has(mark)&&t.stageTick>180){seen.add(mark);capture(gb,path.join(out,label+'-'+mark+'.png'));musicCues[mark]=at(m,'_ce_music_track');assert.equal(musicCues[mark],boss?game.stages[0].bossMusic:game.stages[0].music);}
    if(t.stageTick%1800===0)console.log(label,{tick:t.stageTick,lives:t.lives,score:t.score,power,speed,bombs,objects:objectsLeft(m),drops:t.dropped});
   }
   if(!pauseSeen&&t.tick>300){pauseSeen=true;pausing=1;pausedTick=t.tick;input([PadKey.Start]);}
   else if(pausing){
    if(pausing===1&&at(m,'_ce_pause'))pausedTick=t.tick;
    if(pausing<6)input([]);else if(pausing===6){assert.equal(t.tick,pausedTick,'pause holds game tick');input([PadKey.Start]);}else input([]);
    pausing=pausing>=9?0:pausing+1;
   }else{
    const px=t.x/16,py=t.y/16,immune=m.ram.readUInt16LE(s._ce_state-0xc000+8)>0;
    // Prefer approaching pickups, otherwise align with the nearest enemy/boss firing lane.
    const targetItem=items.filter(e=>e.x/16>px-12).sort((a,b)=>a.x-b.x)[0];
    goalY=targetItem?targetItem.y/16:boss?boss.y/16:76;
    let best={cost:Infinity,x:28,y:goalY};
    const candidates=[];for(let y=16;y<=136;y+=8)for(const x of [20,28,36,44])candidates.push({x,y});
    for(const c of candidates){let cost=Math.abs(c.y-goalY)*0.55+Math.abs(c.x-28)*0.3+Math.abs(c.y-py)*0.3+Math.abs(c.x-px)*0.2;
     if(!immune)for(const e of enemies){if(!['enemy','boss','eshot'].includes(e.kind))continue;const isShot=e.kind==='eshot',ex=e.x/16+(isShot?e.vx/16*8:0),ey=e.y/16+(isShot?e.vy/16*8:0),dx=Math.abs(ex-c.x),dy=Math.abs(ey-c.y);if(dx<(isShot?16:25)&&dy<(isShot?13:20))cost+=600/(1+dx+dy);}
     if(cost<best.cost)best={...c,cost};}
    const collisionTarget=process.argv.includes('--exercise-miss')&&t.tick>=2400&&misses===0?enemies.find(e=>e.kind==='enemy'):undefined;
    if(collisionTarget)best={cost:0,x:Math.min(152,collisionTarget.x/16),y:collisionTarget.y/16};
    const keys=collisionTarget?[]:[PadKey.A];if(best.y-py>2)keys.push(PadKey.Down);if(best.y-py<-2)keys.push(PadKey.Up);if(best.x-px>2)keys.push(PadKey.Right);if(best.x-px<-2)keys.push(PadKey.Left);
    const denseBomb=!seen.has('density-bomb')&&visible>=64&&bombs>0;
    const emergency=!immune&&bombs>0&&enemies.some(e=>['enemy','boss','eshot'].includes(e.kind)&&Math.abs(e.x/16-px)<18&&Math.abs(e.y/16-py)<14);
    if(!collisionTarget&&(denseBomb||emergency)){keys.push(PadKey.B);if(denseBomb)seen.add('density-bomb');}
    input(keys);
   }
   lastTick=t.tick;lastFrame=frame;lastScene=scene;gb.clock();
  }
  const finalMem=memory(gb),row={mode:label,clear,last,acquired:[...acquired],phases:[...phases],misses,bombUsed,pauseSeen,peakOam,peakScanline,peakShots,peakItems,peakBg,peakPower,peakSpeed,remainingBg:objectsLeft(finalMem),frameGaps:stats(gaps),regions:regions.map(stats),dropEvents,peakPendingObjects,maxPendingAfterPublicationTicks,bombDisplayFrames,musicCues,titlePcm:true};
  if(clear){const save=Buffer.from(gb.ram_data_eager()),reboot=boot(rom,mode);try{assert.equal(save.length,8192);reboot.set_ram_data(save);frames(reboot,240);const ranks=Array.from({length:5},(_,i)=>memory(reboot).ram.readUInt16LE(s._ce_scores-0xc000+i*2));assert.equal(ranks[0],last.score,'completed score survives actual SRAM reboot');row.sramReboot=true;row.ranking=ranks;}finally{reboot.free();}}
  results.push(row);fs.writeFileSync(path.join(out,label+'-result.json'),JSON.stringify({fixture:false,rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),...row},null,2));
  assert.ok(clear,label+' completes unmodified180second route and boss');assert.equal(phases.size,3);assert.ok(peakOam<=40);assert.ok(bombUsed>0);assert.ok(pauseSeen);assert.ok(peakBg>=64);
  assert.ok(peakScanline<=10,label+' stays within the ten-sprite scanline limit');
  assert.equal(last.dropped,0,label+' has no skipped entity or item spawns');
  assert.equal(dropEvents.length,0,label+' keeps the spawn diagnostic clear throughout the route');
  assert.equal(peakPower,3);assert.equal(peakSpeed,3);
  if(process.argv.includes('--exercise-miss'))assert.ok(misses>0,'ordinary input exercised an actual player miss');
  for(const item of ['power','speed','bomb','life','score'])assert.ok(acquired.has(item),label+' acquired '+item);
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({fixture:false,rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
console.log(results.map(({mode,clear,last,acquired,misses,bombUsed,peakOam,peakScanline,frameGaps})=>({mode,clear,score:last.score,acquired,misses,bombUsed,peakOam,peakScanline,frameGaps})));
