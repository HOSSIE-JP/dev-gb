// ROM-side fixture: the real allocator, shot updater, collision kernel and OAM.
// No emulator memory patches. Exercise holes/high pool indices and both weapons.
// node editor/tests/shot-hitbox-rom.acceptance.mjs OUT [--engine=DIR] [--reuse]
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=process.cwd(),out=path.resolve(process.argv[2]),fixture=path.join(out,'fixture'),g=lib.readGame(root,'star-caravan'),art=lib.readGame(root,'touhou-kouma');
fs.mkdirSync(out,{recursive:true});g.name='shot-probe';g.title='SHOT PROBE';g.timeLimit=false;g.stageFade=false;g.graze={enabled:false,radius:6,score:1,flashFrames:12};
g.player.bomb={enabled:false,stock:2,damage:30,frames:48,flashPeriod:2,background:''};
g.screens.find(s=>s.id==='hud').dock='right';Object.assign(g.screens.find(s=>s.id==='hud'),{columns:5,rows:18,items:[]});
g.stages.forEach(s=>{s.events=[];s.scrollSpeed=0;s.requireBoss=false;s.clearOnBoss=false;s.walls.fill(0);s.destructibles=undefined;});
for(const id of ['fairy','shot-ofuda','shot-marisa-laser'])g.assets.push({...structuredClone(art.assets.find(a=>a.id===id)),palette:0});
const enemy=g.enemies[0];Object.assign(enemy,{asset:'fairy',hp:10,pattern:'',attacks:[],motion:{...enemy.motion,kind:'straight',vx:0,vy:0}});
const sprites=g.assets.filter(a=>a.kind==='sprite'),idx=id=>sprites.findIndex(a=>a.id===id),target=idx('fairy'),small=idx('shot-ofuda'),laser=idx('shot-marisa-laser');
const xs=[-14,-10,-8,-6,-4,-2,0,2,4,6,8,10,14],ys=[-16,-10,-6,0,6,10,16],slots=[1,2,4,8,9,10,12,16,20,24,28];
const code=`#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
extern uint8_t allocate(uint8_t kind,uint8_t asset);extern void release(uint8_t slot);
uint8_t ce_title_choice,ce_title_stage,ce_demo,ce_demo_abort,ce_demo_cutin;
uint16_t ce_probe_case;uint8_t ce_probe_slot,ce_probe_hp;
void ce_probe_sample(void) NONBANKED __naked { __asm ret __endasm; }
static const int8_t xs[]={${xs}},ys[]={${ys}};static const uint8_t slots[]={${slots}};
void ce_mainloop(void) BANKED {
 uint8_t a,b,c,d,i,j;CE_Entity *e;
 ce_is_cgb=_cpu==CGB_TYPE;if(ce_is_cgb)cpu_fast();add_VBL(ce_count_frame);set_interrupts(VBL_IFLAG);
 ce_reset(0,1);ce_scene=1;ce_load_stage();
 for(a=0;a!=2;++a)for(b=0;b!=${slots.length};++b)for(c=0;c!=${xs.length};++c)for(d=0;d!=${ys.length};++d){
  ce_reset(0,1);ce_scene=1;ce_state.invulnerable=65000;
  i=allocate(CE_ENEMY,${target});e=&ce_entities[i];e->ref=0;e->hp=10;e->x=e->base_x=60*16;e->y=e->base_y=64*16;
  for(i=1;i<slots[b];++i)allocate(CE_ESHOT,${small});
  i=allocate(CE_PSHOT,a?${laser}:${small});ce_probe_slot=i;e=&ce_entities[i];e->damage=1;
  ce_shot_x[i]=(60+xs[c])*16;ce_shot_y[i]=(64+ys[d])*16;ce_shot_vx[i]=ce_shot_vy[i]=0;ce_shot_age[i]=0;ce_shot_lifetime[i]=100;ce_init_shot_visual(i);
  for(j=1;j<slots[b];++j)release(j);
  ce_step(0);ce_render();ce_probe_hp=ce_entities[0].hp;ce_trace_write();ce_probe_sample();++ce_probe_case;
 }
 for(;;)vsync();
}
`;
if(!process.argv.includes('--reuse')){
 assert.deepEqual(lib.validate(g).filter(d=>d.severity==='error'),[]);
 for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
 const old=process.argv.find(a=>a.startsWith('--engine='));if(old)fs.cpSync(path.resolve(old.slice(9)),path.join(fixture,'engine/caravan'),{recursive:true});
 fs.writeFileSync(path.join(fixture,'engine/caravan/mainloop.c'),code);fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});
 if(fs.existsSync(path.join(fixture,'projects',g.name)))lib.saveGame(fixture,g.name,g);else lib.createProject(fixture,g.name,g.title,g);
 const library=process.argv.find(a=>a.startsWith('--library='));
 const compiler=library?createRequire(import.meta.url)(path.resolve(library.slice(10))):lib;
 compiler.compile(fixture,g.name,'Debug',v=>fs.appendFileSync(path.join(out,'build.log'),v));
}
const file=path.join(fixture,'projects',g.name,'build/Debug',g.name+'.gb'),rom=fs.readFileSync(file),s=symbols(file.replace(/gb$/,'map')),authored=lib.readGame(fixture,g.name),results=[];
for(const [mode,label] of [[GameBoyMode.Dmg,'DMG'],[GameBoyMode.Cgb,'CGB']]){
 const gb=boot(rom,mode);let n=0,hits=0,misses=0;const failures=[];
 try{for(const id of ['shot-ofuda','shot-marisa-laser'])for(const slot of slots)for(const x of xs)for(const y of ys){
  gb.step_to(s._ce_probe_sample);const m=memory(gb),r=m.ram;assert.equal(r.readUInt16LE(s._ce_probe_case-0xc000),n);assert.equal(r[s._ce_probe_slot-0xc000],slot);
  const e=authored.assets.find(a=>a.id==='fairy'),b=authored.assets.find(a=>a.id===id),ex=60-e.origin.x+e.hitbox.x,ey=64-e.origin.y+e.hitbox.y,bx=60+x-b.origin.x+b.hitbox.x,by=64+y-b.origin.y+b.hitbox.y;
  const hit=bx<ex+e.hitbox.w&&bx+b.hitbox.w>ex&&by<ey+e.hitbox.h&&by+b.hitbox.h>ey;
  const hp=r[s._ce_probe_hp-0xc000];if(hp!==(hit?9:10))failures.push({n,id,slot,x,y,expected:hit?9:10,actual:hp});
  if(hit)hits++;else misses++;
  // Surviving shots must actually be drawn at their authored origin.
  if(!hit){const visible=[];for(let i=0;i<40;i++)if(m.oam[i*4])visible.push([...m.oam.subarray(i*4,i*4+4)]);
   const last=visible.slice(-(b.height/8));assert.equal(last[0][1],60+x-b.origin.x+8);assert.equal(last[0][0],64+y-b.origin.y+16);
   if(b.height===16){assert.equal(last[1][0],last[0][0]+8);assert.equal(last[1][2],last[0][2]+1);}
  }
  n++;gb.clock();
 }results.push({mode:label,cases:n,hits,misses,failures:failures.length,examples:failures.slice(0,12)});console.log(results.at(-1));}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
assert(results.every(r=>r.failures===0),'visible shot/hitbox parity, including high pool slots');
