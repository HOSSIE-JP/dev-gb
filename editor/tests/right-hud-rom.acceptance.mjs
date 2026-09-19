// ROM-driven phase boundary tests. Diagnostic input/state is authored in a
// fixture mainloop; production combat, transition, HUD and save code is unchanged.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,memory,symbols,GameBoyMode,frames} from './emulator.mjs';
import {entityOffset,supportedModes} from './emulator.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=process.cwd(),out=path.resolve(process.argv[2]),fixture=path.join(out,'fixture');fs.mkdirSync(out,{recursive:true});
const g=lib.readGame(root,'touhou-kouma');g.startupMovie.enabled=false;g.startup.enabled=false;g.stageFade=false;g.bossCelebration=false;g.graze.enabled=false;
for(const b of g.bosses)for(const p of b.phases){p.pattern='';p.attacks=[];p.intro=undefined;}
for(const s of g.stages){s.presentation.enabled=false;s.presentation.victoryDialogue.enabled=false;s.presentation.clearEnabled=false;}
const code=`#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
uint8_t ce_title_choice,ce_title_stage,ce_demo,ce_demo_abort,ce_demo_cutin;
uint8_t ce_qa_stage,ce_qa_route,ce_qa_phase,ce_qa_sample_id;
void ce_qa_sample(void) NONBANKED __naked { __asm ret __endasm; }
static CE_Entity *boss(void){uint8_t i;for(i=0;i!=ce_used;++i)if(CE_ENTITY(i).kind==CE_BOSS)return &CE_ENTITY(i);return 0;}
static void sample(uint8_t n){ce_qa_sample_id=n;if(ce_qa_stage<7u)ce_render();ce_trace_write();ce_qa_sample();}
void ce_mainloop(void) BANKED {
 uint16_t n;uint8_t i;CE_Entity *e;
 ce_is_cgb=_cpu==CGB_TYPE;if(ce_is_cgb)cpu_fast();NR52_REG=0x80;NR50_REG=0x77;NR51_REG=255;
 add_VBL(ce_count_frame);add_LCD(ce_hud_scanline);add_LCD(nowait_int_handler);STAT_REG=STATF_LYC;set_interrupts(VBL_IFLAG|LCD_IFLAG);
 ce_select_player(0);ce_save_load();ce_qa_stage=255;sample(9);
 for(ce_qa_stage=0;ce_qa_stage!=ce_stage_count;++ce_qa_stage)for(ce_qa_route=0;ce_qa_route!=3;++ce_qa_route){
  ce_demo=1;ce_reset(ce_qa_stage,1);ce_boss_seek();ce_scene=1;ce_load_stage();
  do{ce_state.invulnerable=65535u;ce_step(0);e=boss();}while(!e||!e->phase);
  for(ce_qa_phase=1;ce_qa_phase!=4;++ce_qa_phase){
   e=boss();e->phase_age=0;sample(0);
   for(n=0;n!=3599u;++n){ce_state.invulnerable=65535u;ce_step(0);}
   sample(1);
   /* A real damage packet on the deadline update, including the final mode. */
   if(ce_qa_route==1u || (ce_qa_route==2u && ce_qa_phase!=2u)){
    for(i=0;i!=ce_used;++i)if(CE_ENTITY(i).kind==CE_BOSS){ce_damage_actor(i,100);break;}
   }
   ce_step(0);sample(2);
  }
 }
 for(i=4;i;i--)ce_scores[i]=ce_scores[i-1u];ce_scores[0]=7000;ce_save_scores();
 ce_qa_stage=254;sample(9);for(;;)vsync();
}
`;
if(!process.argv.includes('--reuse')){
 for(const d of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(d,path.join(fixture,d),{recursive:true});
 fs.writeFileSync(path.join(fixture,'engine/caravan/mainloop.c'),code);
 fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});
 if(fs.existsSync(path.join(fixture,'projects/touhou-kouma')))lib.saveGame(fixture,'touhou-kouma',g);else lib.createProject(fixture,'touhou-kouma',g.title,g);
 lib.compile(fixture,'touhou-kouma','Debug',s=>fs.appendFileSync(path.join(out,'build.log'),s));
}
const file=path.join(fixture,'projects/touhou-kouma/build/Debug/touhou-kouma.gb'),rom=fs.readFileSync(file),syms=symbols(file.replace(/gb$/, 'map')),reports=[];
function scores(r){return Array.from({length:5},(_,i)=>r.readUInt16LE(syms._ce_scores-0xc000+i*2));}
function crc(bytes){let c=65535;for(const b of bytes){c^=b<<8;for(let n=0;n<8;n++)c=((c<<1)^((c&32768)?0x1021:0))&65535;}return c;}
const old=Buffer.alloc(8192),id=Array.from(Buffer.from(g.name)).reduce((h,b)=>Math.imul(h^b,16777619)>>>0,2166136261).toString(16).padStart(8,'0').match(/../g).map(b=>parseInt(b,16));
for(const slot of [0,1]){const p=slot*32;old[p]=0xa5;old[p+1]=1;Buffer.from(id).copy(old,p+2);old.writeUInt16LE(slot+5,p+6);[65535,12009,7890,100,9].forEach((v,i)=>old.writeUInt16LE(v,p+8+i*2));old.writeUInt16LE(crc(old.subarray(p+1,p+18)),p+18);}
for(const [mode,label] of supportedModes(rom)){
 const gb=boot(rom,mode);gb.set_ram_data(old);let samples=0;
 const sample=(stage,route,phase,id)=>{
  gb.step_to(syms._ce_qa_sample);const m=memory(gb),r=m.ram,byte=n=>r[syms[n]-0xc000];
  assert.equal(byte('_ce_qa_stage'),stage);assert.equal(byte('_ce_qa_sample_id'),id);
  if(stage<7){assert.equal(byte('_ce_qa_route'),route);assert.equal(byte('_ce_qa_phase'),phase);}
  gb.clock();samples++;return m;
 };
 try{
  const booted=sample(255,0,0,9);assert.deepEqual(scores(booted.ram),[6553,1200,789,10,0]);const migrated=Buffer.from(gb.ram_data_eager());
  for(let stage=0;stage<7;stage++)for(let route=0;route<3;route++){
   const boss=g.bosses.find(b=>b.id===g.stages.find(s=>s.id===g.stageOrder[stage]).events.find(e=>e.kind==='boss').ref);let total=0;
   for(let phase=1;phase<=3;phase++){
    sample(stage,route,phase,0);const before=sample(stage,route,phase,1);let entity;
    for(let i=0;i<39;i++){const p=entityOffset(before.ram,syms,i);if(before.ram[p]===2){entity=p;break;}}
    assert.notEqual(entity,undefined);assert.equal(before.ram.readUInt16LE(entity+8),3599);assert.equal(before.ram.readUInt16LE(syms._ce_state-0xc000+6),total);
    if(route===1||(route===2&&phase!==2))total+=boss.score;
    const after=sample(stage,route,phase,2);assert.equal(after.ram.readUInt16LE(syms._ce_state-0xc000+6),total,`${label} ${boss.id} route ${route} phase ${phase}`);
    if(phase===3)assert.equal(after.ram[syms._ce_state-0xc000+20],2);
   }
  }
  assert.deepEqual(scores(sample(254,0,0,9).ram),[7000,6553,1200,789,10]);
  const inserted=boot(rom,mode);try{inserted.set_ram_data(gb.ram_data_eager());inserted.step_to(syms._ce_qa_sample);assert.deepEqual(scores(memory(inserted).ram),[7000,6553,1200,789,10],'new insertion after migration survives reboot without rescaling');}finally{inserted.free();}
  // New record wins once; corrupt/torn migrated slot falls back to v1 and is safely migrated again.
  for(const variant of ['reboot','corrupt','torn']){
   const ram=Buffer.from(migrated);if(variant==='corrupt')ram[8]^=1;if(variant==='torn')ram[0]=0;
   const again=boot(rom,mode);try{again.set_ram_data(ram);again.step_to(syms._ce_qa_sample);assert.deepEqual(scores(memory(again).ram),[6553,1200,789,10,0],variant);}finally{again.free();}
  }
  reports.push({mode:label,samples,bosses:7,modes:21,routes:3,deadlineUpdates:3600,scoreMigration:true,reboot:true,insertAfterMigration:true,corruptRecovery:true,tornRecovery:true});console.log(reports.at(-1));
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({diagnostic:true,rom:file,reports},null,2));
