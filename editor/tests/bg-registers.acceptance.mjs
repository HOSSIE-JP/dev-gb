// Isolated engine diagnostic; all mutations happen in the ROM's authored loop.
// node editor/tests/bg-registers.acceptance.mjs OUT [ENGINE_SOURCE] [BEFORE.json]
// CPU timing excludes flush/DMA/waits. Full displayed pixels and live bullet
// state must match the unchanged reference at every publication, in both modes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
import {backgroundColors,backgroundPixels,capture} from './presentation-qa.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const out=path.resolve(process.argv[2]),engine=path.resolve(process.argv[3]??'engine');
const before=process.argv[4]?JSON.parse(fs.readFileSync(process.argv[4],'utf8')):null;
fs.mkdirSync(out,{recursive:true});
const fixture=fs.mkdtempSync(path.join(out,'fixture-'));
fs.cpSync(engine,path.join(fixture,'engine'),{recursive:true});
for(const tool of ['gbdk','misaki'])fs.cpSync('.tools/'+tool,path.join(fixture,'.tools',tool),{recursive:true});
const game=lib.readGame(process.cwd(),'star-caravan');
const player=game.assets.find(a=>a.id===game.player.asset);
player.hitbox={x:1,y:1,w:3,h:3};
const playerId=game.assets.indexOf(player),wideId=game.assets.findIndex(a=>a.id===game.enemies[0].asset);
game.assets[wideId].hitbox={x:0,y:0,w:7,h:7};
const code=`#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
uint8_t ce_title_choice,ce_title_stage,ce_demo,ce_demo_abort,ce_demo_cutin;
uint8_t ce_bench_case,ce_bench_spawn_hit;
void ce_bench_start(void) NONBANKED __naked { __asm ret __endasm; }
void ce_bench_end(void) NONBANKED __naked { __asm ret __endasm; }
void ce_bench_published(void) NONBANKED __naked { __asm ret __endasm; }
void ce_mainloop(void) BANKED {
 uint8_t i,n;int16_t x,y;
 ce_is_cgb=_cpu==CGB_TYPE;if(ce_is_cgb)cpu_fast();
 ce_scene=1;ce_player_asset=${playerId};ce_respawn=1;ce_battle_mode=2;
 ce_bg_limit=64;ce_state.player_x=80*16;ce_state.player_y=120*16;
 LCDC_REG=0x81;ce_bg_clear();ce_bg_setup();ce_bg_palette();
 for(;;){
  ce_bench_case=ce_state.tick/64u;
  if(!(ce_state.tick&63u))ce_bg_clear();
  ce_player_asset=ce_bench_case==7u?${wideId}:${playerId};
  ce_respawn=ce_bench_case<6u?1u:0u;ce_battle_mode=ce_bench_case==8u?3u:2u;
  ce_bg_begin();ce_bench_spawn_hit=0;
  if(!(ce_state.tick&15u)){
   n=(ce_bench_case==1u||ce_bench_case==3u||ce_bench_case==5u)?64u:32u;
   for(i=0;i!=n;++i){
    x=8+(i%16u)*8;y=24+(i/16u)*24;
    if(ce_bench_case==2u){x=8+(i/2u%8u)*16+(i&1u)*2;y=32+(i/16u)*32;}
    if(ce_bench_case==3u){x=8+(i/4u%8u)*16+(i&1u)*2;y=32+(i/32u)*32+((i>>1)&1u)*2;}
    if(ce_bench_case==4u){x=64;y=64;}
    if(ce_bench_case==5u){x=(i%8u)*24-2;y=(i/8u)*22-2;}
    if(ce_bench_case>=6u){x=76+(i%8u)*2;y=112+(i/8u)*2;}
    ce_bg_request.x=x*16;ce_bg_request.y=y*16;
    ce_bg_request.vx=(int8_t)(i%3u)-1;ce_bg_request.vy=4+(i&3u);
    ce_bg_request.life=24+(i&15u);ce_bg_request.damage=1+(i&3u);
    ce_bg_request.pattern=CE_NONE;ce_bg_spawn();
   }
   ce_bench_spawn_hit=ce_bg_hit;
  }
  ce_bench_start();ce_bg_update();ce_bench_end();
  if(ce_battle_mode==2u){ce_bg_flush();vsync();ce_bg_publish();}else vsync();
  ++ce_state.tick;ce_trace_write();ce_bench_published();
  if(ce_state.tick==576u)for(;;)vsync();
 }
}
`;
fs.writeFileSync(path.join(fixture,'engine/caravan/mainloop.c'),code);
fs.mkdirSync(path.join(fixture,'projects'));
lib.createProject(fixture,'bg-registers','BG REGISTERS',game);
const report=lib.compile(fixture,'bg-registers','Debug',s=>fs.appendFileSync(path.join(out,'build.log'),s));
const rom=fs.readFileSync(report.romPath),s=symbols(report.romPath.replace(/\.gb$/,'.map'));
const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const results={diagnostic:true,rom:report.romPath,sha256:digest(rom),harnessSha256:digest(code),
 ramBytes:report.ramBytes,sourceHashes:Object.fromEntries(['bg-bullets.c','bg-state-kernels.h','bg-update-kernel.h'].map(f=>[f,digest(fs.readFileSync(path.join(engine,'caravan',f)))])),modes:[]};
if(before)assert.equal(results.harnessSha256,before.harnessSha256);
for(const [mode,name]of [[GameBoyMode.Dmg,'DMG'],[GameBoyMode.Cgb,'CGB']]){
 const gb=boot(rom,mode),samples=[],cases=Array.from({length:9},()=>[]);let hitCount=0;
 try{
  gb.step_to(s._ce_bench_start);
  for(let tick=0;tick<576;tick++){
   if(tick)gb.step_to(s._ce_bench_start);
   const cycles=gb.clock()+gb.step_to(s._ce_bench_end);
   gb.clock();gb.step_to(s._ce_bench_published);
   const m=memory(gb),at=n=>s[n]-0xc000,read=n=>m.ram[at(n)],live=[];
   for(let i=0;i<64;i++){
    const life=m.ram.readUInt16LE(at('_ce_bg_life')+i*2);
    if(life)live.push([i,life,...['_ce_bg_x','_ce_bg_y','_ce_bg_vx','_ce_bg_vy'].map(n=>m.ram.readInt16LE(at(n)+i*2))]);
   }
   assert.equal(live.length,read('_ce_bg_count'));
   const c=read('_ce_bench_case'),hit=read('_ce_bg_hit'),spawnHit=read('_ce_bench_spawn_hit');
   if(hit||spawnHit)hitCount++;
   const pixels=name==='CGB'?backgroundColors(gb):backgroundPixels(gb);
   const state=digest(JSON.stringify({live,hit,spawnHit,pixels}));
   if(before)assert.equal(state,before.modes.find(m=>m.mode===name).samples[tick].state,`${name} case ${c} publication ${tick}`);
   samples.push({case:c,cycles,state});cases[c].push(cycles);
   if(tick===195)capture(gb,path.join(out,name+'.png'));
   gb.clock();
  }
  assert.ok(hitCount>0,'actual impact paths exercised');
  results.modes.push({mode:name,hitPublications:hitCount,samples,cases:cases.map((a,caseId)=>({case:caseId,samples:a.length,mean:a.reduce((s,x)=>s+x,0)/a.length,max:Math.max(...a)}))});
 }finally{gb.free();}
}
if(before)for(const m of results.modes)for(const c of m.cases){
 const reference=before.modes.find(x=>x.mode===m.mode).cases[c.case];
 assert.ok(c.mean<=reference.mean*.99,`${m.mode} case ${c.case}: require at least 1% lower update cost`);
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({sha256:results.sha256,ramBytes:results.ramBytes,modes:results.modes.map(({samples,...m})=>m),parity:!!before},null,2));
