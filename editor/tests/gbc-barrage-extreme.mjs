// Renderer-only diagnostic ROM. Exercise the provable worst transfer case:
// 96 bullets in 24 four-dot cells, front/back reuse, then an empty field.
// This is not production gameplay or a 96-bullet gameplay-rate claim.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,trace,GameBoyMode} from './emulator.mjs';
import {backgroundColors,capture} from './presentation-qa.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const root=process.cwd(),dir=fs.mkdtempSync(path.join(out,'fixture-'));fs.cpSync('engine',path.join(dir,'engine'),{recursive:true});
for(const t of ['gbdk','misaki'])fs.cpSync('.tools/'+t,path.join(dir,'.tools',t),{recursive:true});
fs.writeFileSync(path.join(dir,'engine/caravan/mainloop.c'),`#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
uint8_t ce_title_choice,ce_title_stage,ce_demo,ce_demo_abort,ce_demo_cutin;
void ce_mainloop(void) BANKED {
 uint8_t i,k,phase;ce_is_cgb=1;SVBK_REG=1;cpu_fast();
 ce_scene=1;ce_state.player_x=0;ce_state.player_y=2200;ce_respawn=1;
 ce_battle_mode=2;ce_bg_limit=96;ce_active_screen=4;ce_fade_level=0;
 LCDC_REG=0x85;ce_bg_clear();ce_bg_setup();ce_bg_palette();
 for(;;){
  phase=(ce_state.tick/32u)%3u;ce_bg_clear();ce_bg_begin();
  if(phase!=2u)for(i=0;i!=24u;++i)for(k=0;k!=4u;++k){
   ce_bg_request.x=(uint16_t)(8u+(i%6u)*24u+(k&1u)*(phase?6u:2u))<<4;
   ce_bg_request.y=(uint16_t)(32u+(i/6u)*24u+(k>>1)*(phase?6u:2u))<<4;
   ce_bg_request.vx=ce_bg_request.vy=0;ce_bg_request.life=1000;
   ce_bg_request.damage=1;ce_bg_request.pattern=255;ce_bg_spawn();
  }
  ce_bg_flush();vsync();ce_bg_publish();++ce_state.tick;ce_trace_write();
 }
}
`);
const g=lib.readGame(root,'star-caravan');g.hardware='gbc';g.performance={enemies:12,playerShots:6,enemyShots:32,effects:4,dense:true};fs.mkdirSync(path.join(dir,'projects'));lib.createProject(dir,'extreme','EXTREME',g);
const r=lib.compile(dir,'extreme','Debug',s=>fs.appendFileSync(path.join(out,'build.log'),s));
const rom=fs.readFileSync(r.romPath),syms=symbols(r.romPath.replace(/\.gb$/,'.map')),gb=boot(rom,GameBoyMode.Cgb);let checked=0,peak=0,dmaMax=0;const phases=new Set();
try{for(let f=0;f<1600;f++){
 frames(gb,1);const t=trace(gb,syms._ce_trace);if(!t||t.tick<1||t.tick%32===0)continue;
 const m=memory(gb),phase=Math.floor((t.tick-1)/32)%3,expected=new Uint16Array(23040);
 if(phase!==2)for(let i=0;i<24;i++)for(let k=0;k<4;k++){
  const x=8+i%6*24+(k&1)*(phase?6:2),y=32+Math.floor(i/6)*24+(k>>1)*(phase?6:2);
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)expected[(y+dy)*160+x+dx]=32767;
 }
 const actual=backgroundColors(gb);for(let p=16*160;p<23040;p++)assert.equal(actual[p],expected[p],`tick ${t.tick} pixel ${p}`);
 const dynamic=m.ram[syms._ce_cgb_dynamic_count-0xc000],dma=m.ram[syms._ce_bg_dma_end_ly-0xc000];
 // Rendering the next field may already be underway, so inspect transfer
 // counters only once that field is published and the trace remains coherent.
 assert.ok(dynamic<=24);assert.ok(dma>=144&&dma<=153);dmaMax=Math.max(dmaMax,dma);peak=Math.max(peak,dynamic);phases.add(phase);checked++;
 if(checked===12)capture(gb,path.join(out,'extreme.png'));
 if(t.tick>200&&phases.size===3)break;
}assert.ok(checked>100);assert.equal(peak,24);assert.equal(phases.size,3);
}finally{gb.free();}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({diagnostic:true,rom:r.romPath,sha256:r.romHash,checked,peakDynamicTiles:peak,peakBullets:96,dmaMax,phases:[...phases]},null,2));console.log({checked,peak,dmaMax});
