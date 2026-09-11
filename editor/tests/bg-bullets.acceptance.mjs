// Real SM83/PPU oracle: independent bullet geometry, composite cells and timing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {boot, memory, symbols, GameBoyMode} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs');
const out=path.resolve(process.argv[2]??path.join(root,'.cache/bg-bullets-qa'));
const limit=Number(process.argv[4]??64);assert.ok([32,64].includes(limit));
const scenario=process.argv[3]??'spread';assert.ok(['spread','pairs','motion','cluster'].includes(scenario));
fs.mkdirSync(out,{recursive:true});
const fixture=path.join(out,'fixture');fs.mkdirSync(fixture,{recursive:true});
for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
const runtime=path.join(fixture,'engine/caravan/runtime.c');
fs.appendFileSync(runtime,'\nvoid ce_qa_marker(void) NONBANKED { __asm nop __endasm; }\n');
fs.writeFileSync(path.join(fixture,'engine/caravan/mainloop.c'),`#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
void ce_qa_marker(void) NONBANKED;
uint8_t ce_qa_tick, ce_qa_flags;
void ce_mainloop(void) BANKED {
    uint8_t i;
    ce_is_cgb = _cpu == CGB_TYPE; if (ce_is_cgb) cpu_fast();
    add_VBL(ce_count_frame); add_LCD(ce_hud_scanline); add_LCD(nowait_int_handler);
    LYC_REG=ce_hud_height; STAT_REG=STATF_LYC; set_interrupts(VBL_IFLAG|LCD_IFLAG);
    ce_reset(0,1); ce_scene=1; ce_load_stage(); ce_battle_mode=2; ce_bg_limit=${limit};
    ce_battle_asset=ce_bosses[0].asset; ce_battle_setup();
    ce_bg_request.x=32*16;ce_bg_request.y=32*16;ce_bg_request.vx=0;ce_bg_request.vy=0;ce_bg_request.life=1;ce_bg_request.damage=1;
    for(i=0;i!=${limit}u;++i)ce_bg_spawn();
    if(ce_bg_count==${limit}u)ce_qa_flags|=1;
    ce_bg_spawn();if(ce_bg_count==${limit}u&&ce_state.dropped==1u)ce_qa_flags|=2;
    ce_bg_update();if(!ce_bg_count)ce_qa_flags|=4;
    ce_bg_request.life=10;ce_bg_request.x=-32;ce_bg_spawn();if(!ce_bg_count)ce_qa_flags|=8;
    ce_bg_request.x=ce_state.player_x+ce_hitboxes[ce_player_asset].x*16;ce_bg_request.y=ce_state.player_y+ce_hitboxes[ce_player_asset].y*16;ce_bg_spawn();if(ce_bg_hit==1&&!ce_bg_count)ce_qa_flags|=16;
    ce_bg_clear();ce_bg_begin();ce_bg_request.x=32*16;ce_bg_request.y=32*16;ce_bg_request.life=2;
    for(i=0;i!=200u;++i){ce_bg_spawn();ce_bg_update();}
    ce_bg_update();if(!ce_bg_count)ce_qa_flags|=32;
    ce_bg_clear();ce_bg_begin();
    ce_bg_request.vx=0; ce_bg_request.vy=0; ce_bg_request.life=1024; ce_bg_request.damage=1;
    for(i=0;i!=${limit}u;++i) {
        ce_bg_request.x=${scenario==='cluster'?'(8u+(i>>4)*32u+(i&3u)*2u)*16u':scenario==='pairs'?'(5u+((i>>1)&15u)*9u+(i&1u)*2u)*16u':'(7u+(i&15u)*9u)*16u'};
        ce_bg_request.y=${scenario==='cluster'?'(32u+((i>>2)&3u)*2u)*16u':scenario==='pairs'?'(23u+(i>>5)*22u)*16u':'(23u+(i>>4)*11u)*16u'};
        ce_bg_request.vx=${scenario==='cluster'?'8':scenario==='motion'?'(i&15u)<8u?8:-8':'0'};
        ce_bg_spawn();
    }
    for(;;) { ce_bg_update(); ce_render(); ++ce_qa_tick; ce_qa_marker(); }
}
`);
const game=lib.readGame(root,'star-caravan'); game.stageFade=false; game.music={title:0,boss:0,clear:0,gameover:0};
game.player.invulnerability=0;
if(!fs.existsSync(path.join(fixture,'projects','bg-test'))) {fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});lib.createProject(fixture,'bg-test','BG TEST',game);}
const report=lib.compile(fixture,'bg-test','Release',()=>{}),rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map'));
function expectedAt(tick){const expected=new Set();for(let i=0;i<limit;i++){
 const x=Math.floor(scenario==='cluster'?8+(i>>4)*32+(i%4)*2+tick*.5:scenario==='pairs'?5+((i>>1)%16)*9+(i%2)*2:7+(i%16)*9+(scenario==='motion'?tick*((i%16)<8?.5:-.5):0))&~1;
 const y=(scenario==='cluster'?32+((i>>2)%4)*2:scenario==='pairs'?23+(i>>5)*22:23+(i>>4)*11)&~1;
 for(const [dx,dy]of [[0,0],[1,0],[0,1],[1,1]])expected.add((y+dy)*160+x+dx);
}return expected;}
const results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]) {
 const gb=boot(rom,mode),gaps=[];let last=0;
 try {
  for(let frame=0;frame<33;frame++) {
   gb.step_to(syms._ce_qa_marker);
   const m=memory(gb),read=n=>m.ram[syms[n]-0xc000],offset=m.state.readUInt32LE(m.core+0xa4),vram=m.state.subarray(offset,offset+8192);
   assert.equal(read('_ce_bg_count'),limit,'all requested shots remain active');
   assert.equal(read('_ce_qa_flags'),63,'capacity, rejection, expiry, offscreen, collision and repeated allocation wrap verified by SM83');
   assert.equal(m.ram.readUInt16LE(syms._ce_bg_tile_drops-0xc000),0,'test fits the BG tile budget');
   assert.equal(m.io[0x42],0,'no background scroll');assert.equal(m.io[0x40]&32,0,'window stays hidden');
   const base=m.io[0x40]&8?0x1c00:0x1800,plane=read('_ce_bg_plane');
   const actual=new Set();
   for(let y=16;y<144;y++)for(let x=0;x<160;x++) {
    const id=vram[base+(y>>3)*32+(x>>3)],addr=(id<128?0x1000:0)+id*16+(y&7)*2+plane;
    if(vram[addr]&(128>>(x&7)))actual.add(y*160+x);
   }
   assert.deepEqual(actual,expectedAt(frame+1),'every visible BG pixel matches all 2x2 bullets');
   if(mode===GameBoyMode.Cgb)assert.ok(read('_ce_bg_dma_end_ly')>=144&&read('_ce_bg_dma_end_ly')<=153,'CGB DMA completes inside VBlank');
   assert.deepEqual(m.oam,m.ram.subarray(syms._shadow_OAM-0xc000,syms._shadow_OAM-0xc000+160),'published OAM is complete');
   if(frame>0)gaps.push(gb.ppu_frame()-last);last=gb.ppu_frame();
   if(frame===2)fs.writeFileSync(path.join(out,mode===GameBoyMode.Dmg?'dmg.rgb':'cgb.rgb'),gb.frame_buffer_eager());
   gb.clock();
  }
  const mean=gaps.reduce((a,b)=>a+b)/gaps.length;
  if(mode===GameBoyMode.Cgb)assert.ok(gaps.every(n=>n===1),'one CGB update per PPU frame at the supported bullet budget');
  results.push({mode:mode===GameBoyMode.Dmg?'DMG':'CGB',scenario,bullets:limit,verifiedPixels:expectedAt(1).size,framesPerUpdate:mean,updatesPerSecond:59.7275/mean,gaps});
 } finally {gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:report.romPath,ramBytes:report.ramBytes,results},null,2));
console.log(JSON.stringify({rom:report.romPath,ramBytes:report.ramBytes,results},null,2));
