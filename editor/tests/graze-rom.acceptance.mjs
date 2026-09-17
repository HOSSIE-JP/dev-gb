// Authored diagnostic ROM, not host RAM patches: exhaustive near/hit/outside
// positions for both shot backends, plus slot reuse, immunity and sound priority.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const out=path.resolve(process.argv[2]),fixture=path.join(out,'fixture'),reuse=process.argv.includes('--reuse');
fs.mkdirSync(out,{recursive:true});
const g=lib.readGame(process.cwd(),'star-caravan');g.name='graze-test';g.title='GRAZE TEST';g.timeLimit=false;g.stageFade=false;
g.graze={enabled:true,radius:6,score:10,flashFrames:12};
const player=g.assets.find(a=>a.id===g.player.asset),shot=g.assets.find(a=>a.id===g.patterns[0].asset);
player.origin={x:8,y:4};player.hitbox={x:player.origin.x-2,y:player.origin.y-2,w:4,h:4};
shot.hitbox={x:shot.origin.x,y:shot.origin.y,w:2,h:2};
for(const f of player.frames){f.cgbImage=f.image.replace(/\.png$/,"-cgb.png");f.cgbPixels=f.pixels.map(p=>p?parseInt(g.palettes[player.palette].colors[p].slice(1),16):-1);}
g.stages.forEach(s=>{s.events=[];s.scrollSpeed=0;s.requireBoss=false;});
Object.assign(g.patterns[0],{kind:'straight',count:1,emitterOffsets:[{x:0,y:0}],speed:0.0625,angle:180,lifetime:200,delay:0});
const source=g.assets.filter(a=>a.kind==='sprite').findIndex(a=>a.id===player.id);
const code=`#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
uint8_t ce_title_choice,ce_title_stage,ce_demo,ce_demo_abort,ce_demo_cutin;
uint16_t ce_bench_case;uint8_t ce_bench_sample_id;
void ce_bench_sample(void) NONBANKED __naked { __asm ret __endasm; }
static void sample(uint8_t n){ce_bench_sample_id=n;ce_trace_write();ce_bench_sample();}
static void spawn(uint8_t x,uint8_t y){
 uint8_t i;uint16_t respawn=ce_respawn;
 ce_respawn=1;ce_graze_active=0;
 if(ce_battle_mode){ce_bg_request.x=x*16;ce_bg_request.y=y*16;ce_bg_request.vx=ce_bg_request.vy=0;ce_bg_request.life=200;ce_bg_request.damage=1;ce_bg_request.pattern=CE_NONE;ce_bg_spawn();}
 else{ce_shoot(0,${source},x*16,y*16,0,0);for(i=0;i!=ce_used;++i)ce_shot_vx[i]=ce_shot_vy[i]=0;}
 ce_respawn=respawn;
}
void ce_mainloop(void) BANKED {
 uint16_t n;uint8_t x,y,i;
 ce_is_cgb=_cpu==CGB_TYPE;if(ce_is_cgb)cpu_fast();NR52_REG=0x80;NR50_REG=0x77;NR51_REG=0xff;
 add_VBL(ce_count_frame);set_interrupts(VBL_IFLAG);
 ce_reset(0,1);ce_scene=1;ce_battle_mode=2;ce_bg_limit=40;ce_load_stage();
 for(ce_bench_case=0;ce_bench_case!=346u;++ce_bench_case){
  ce_reset(0,1);ce_scene=1;ce_state.player_x=80*16;ce_state.player_y=120*16;ce_state.invulnerable=0;
  ce_battle_mode=ce_bench_case<169u||ce_bench_case>=338u?2u:0u;ce_bg_limit=40;
  n=ce_bench_case%169u;x=68+(n%13u)*2u;y=108+(n/13u)*2u;
  if(ce_bench_case>=338u){x=72;y=120;}
  if(ce_bench_case==338u)ce_state.invulnerable=100;
  if(ce_bench_case==339u)ce_respawn=100;
  if(ce_bench_case==340u)ce_bomb_left=60;
  if(ce_bench_case==341u)ce_state.score=65530u;
  if(ce_bench_case==342u)ce_demo=1;
  if(ce_bench_case==345u){ce_state.player_x=2*16;x=0;y=112;}
  ce_bg_begin();spawn(x,y);ce_step(0);ce_render();sample(0);
  for(i=0;i!=3u;++i)ce_step(0);sample(1);
  if(ce_bench_case==343u){ce_bg_clear();spawn(x,y);ce_step(0);sample(2);}
  if(ce_bench_case==344u){ce_bg_clear();ce_bg_begin();ce_graze_begin();
   ce_bg_request.x=x*16;ce_bg_request.y=y*16;ce_bg_request.vx=ce_bg_request.vy=0;ce_bg_request.life=200;ce_bg_request.damage=1;ce_bg_request.pattern=CE_NONE;
   ce_bg_spawn();ce_graze_finish();sample(2);}
  ce_demo=0;ce_respawn=0;ce_bomb_left=0;
 }
 ce_bench_case=346;ce_bomb_left=90;ce_sound(7);sample(0);
 for(i=1;i!=90u;++i){ce_sound(0);ce_sound(4);ce_sound(1);ce_sound(8);ce_sfx_tick(1);sample(i);}
 ce_bomb_left=0;ce_sfx_tick(1);sample(90);
 ce_bench_case=347;ce_sound(5);ce_sound(0);ce_sfx_tick(6);sample(0);ce_sfx_tick(255);sample(1);
 for(;;)vsync();
}
`;
if(!reuse){
 for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(dir,path.join(fixture,dir),{recursive:true});
 fs.writeFileSync(path.join(fixture,'engine/caravan/mainloop.c'),code);
 fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});
 if(fs.existsSync(path.join(fixture,'projects/graze-test')))lib.saveGame(fixture,g.name,g);else {const errors=lib.validate(g).filter(d=>d.severity==='error');assert.deepEqual(errors,[]);lib.createProject(fixture,g.name,g.title,g);}
 lib.compile(fixture,g.name,'Debug',s=>fs.appendFileSync(path.join(out,'build.log'),s));
}
const file=path.join(fixture,'projects/graze-test/build/Debug/graze-test.gb'),rom=fs.readFileSync(file),syms=symbols(file.replace(/gb$/,'map')),results=[];
for(const [mode,name] of [[GameBoyMode.Dmg,'DMG'],[GameBoyMode.Cgb,'CGB']]){
 const gb=boot(rom,mode);let count=0;
 const sample=(c,id)=>{
  gb.step_to(syms._ce_bench_sample);const m=memory(gb),at=n=>syms[n]-0xc000,r=m.ram;
  assert.equal(r.readUInt16LE(at('_ce_bench_case')),c);assert.equal(r[at('_ce_bench_sample_id')],id);
  const result={score:r.readUInt16LE(at('_ce_state')+6),lives:r[at('_ce_state')+19],flash:r[at('_ce_graze_flash')],sound:r[at('_ce_spell_sound_left')],io:m.io,oam:m.oam};
  gb.clock();count++;return result;
 };
 try{
  for(let c=0;c<346;c++){
   const n=c%169,x=c>=338?72:68+(n%13)*2,y=c>=338?120:108+Math.floor(n/13)*2;
   const hit=x>=77&&x<=81&&y>=117&&y<=121,near=x>=71&&x<=87&&y>=111&&y<=127&&!hit;
   let score=near?10:0;if([338,339,340,342].includes(c))score=0;if(c===341)score=65535;if(c===345)score=10;
   const a=sample(c,0);assert.equal(a.score,score,`${name} case ${c} (${x},${y}) score`);
   if(c<338)assert.equal(a.lives,hit?2:3,`${name} case ${c} hit`);
   if(score){assert.equal(a.flash,12);assert.equal(a.oam[3]&7,mode===GameBoyMode.Cgb?0:a.oam[3]&7);if(mode===GameBoyMode.Dmg)assert(a.oam[3]&16);}
   const b=sample(c,1);assert.equal(b.score,score,`${name} case ${c} repeated bullet`);
   if(c===343||c===344)assert.equal(sample(c,2).score,20,`${name} slot reuse / birth graze`);
  }
  for(let i=0;i<90;i++){const a=sample(346,i);assert(a.sound>0);assert.equal(a.io[0x12],0xa0);assert.equal(a.io[0x21],0xc0);}
  const off=sample(346,90);assert.equal(off.sound,0);assert.equal(off.io[0x12],0);assert.equal(off.io[0x21],0);
  assert.equal(sample(347,0).sound,66);assert.equal(sample(347,1).sound,0);
  results.push({mode:name,samples:count,gridCases:338,immunity:true,slotReuse:true,birthGraze:true,beamPriority:true,spellPriority:true});console.log(results.at(-1));
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),diagnostic:true,results},null,2));
