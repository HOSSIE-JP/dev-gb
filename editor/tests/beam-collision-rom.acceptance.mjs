// Source-authored diagnostic fixture; uses production allocator, ray collision
// and sprite renderer. No emulator memory writes. Exhaustive hitbox boundaries.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
const l=createRequire(import.meta.url)('../build/library.cjs'),root=process.cwd(),out=path.resolve(process.argv[2]),fixture=path.join(out,'fixture'),g=l.readGame(root,'star-caravan');
fs.mkdirSync(out,{recursive:true});g.name='beam-probe';g.title='BEAM PROBE';g.timeLimit=false;g.stageFade=false;
g.patterns[0].kind='beam';g.patterns[0].delay=0;g.patterns[0].repeats=0;g.patterns[0].damage=1;g.player.weapon=g.patterns[0].id;g.player.focusWeapon='';g.player.bomb=undefined;g.player.powerUps=undefined;
g.stages.forEach(s=>s.events=[]);for(const a of [...g.enemies,...g.bosses]){a.pattern='';a.attacks=[];if(a.phases)for(const p of a.phases){p.pattern='';p.attacks=[];}}
g.enemies[0].motion={...g.enemies[0].motion,kind:'straight',vx:0,vy:0};
g.performance={enemies:8,enemyShots:32,playerShots:6,effects:2};
const art=g.assets.filter(a=>a.kind==='sprite'),target=art.findIndex(a=>a.id===g.enemies[0].asset),small=art.findIndex(a=>a.id===g.patterns[0].asset),xs=[-18,-9,-8,-7,-6,-5,-1,0,1,5,6,7,8,9,18],ys=[-16,-8,0,8,24,60,111,112,113,120,136,160],slots=[0,1,4,8,12,16];
const code=`#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
extern uint8_t allocate(uint8_t kind,uint8_t asset);extern void release(uint8_t slot);
uint8_t ce_title_choice,ce_title_stage,ce_demo,ce_demo_abort,ce_demo_cutin;
uint16_t ce_probe_case;uint8_t ce_probe_hp,ce_probe_slot;
void ce_probe_sample(void) NONBANKED __naked { __asm ret __endasm; }
static const int8_t xs[]={${xs}};static const int16_t ys[]={${ys}};static const uint8_t slots[]={${slots}};
void ce_mainloop(void) BANKED {
 uint8_t a,b,c,i,j;CE_Entity *e;
 ce_is_cgb=_cpu==CGB_TYPE;if(ce_is_cgb)cpu_fast();add_VBL(ce_count_frame);set_interrupts(VBL_IFLAG);
 ce_reset(0,1);ce_scene=1;ce_load_stage();
 for(a=0;a!=${slots.length};++a)for(b=0;b!=${xs.length};++b)for(c=0;c!=${ys.length};++c){
  ce_reset(0,1);ce_scene=1;ce_state.invulnerable=65000;ce_state.player_x=60*16;ce_state.player_y=120*16;
  /* Create holes behind a high target slot through the actual allocator. */
  for(j=0;j<slots[a];++j){i=allocate(CE_ESHOT,${small});if(i==CE_NONE)break;}
  i=allocate(CE_ENEMY,${target});ce_probe_slot=i;if(i==CE_NONE)for(;;)vsync();e=&ce_entities[i];e->ref=0;e->hp=100;e->x=e->base_x=(60+xs[b])*16;e->y=e->base_y=ys[c]*16;
  for(j=0;j<ce_used;++j)if(j!=i)release(j);
  ce_state.cooldown=0;ce_step(J_A);ce_probe_hp=e->hp;ce_render();ce_probe_sample();++ce_probe_case;
 }
 for(;;)vsync();
}
`;
if(!process.argv.includes('--reuse')){
 assert.deepEqual(l.validate(g).filter(d=>d.severity==='error'),[]);
 for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
 fs.writeFileSync(path.join(fixture,'engine/caravan/mainloop.c'),code);fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});
 if(fs.existsSync(path.join(fixture,'projects',g.name)))l.saveGame(fixture,g.name,g);else l.createProject(fixture,g.name,g.title,g);
 l.compile(fixture,g.name,'Debug',v=>fs.appendFileSync(path.join(out,'build.log'),v));
}
const file=path.join(fixture,'projects',g.name,'build/Debug',g.name+'.gb'),s=symbols(file.replace(/gb$/,'map')),rom=fs.readFileSync(file),results=[];
for(const [mode,label]of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']]){
 const gb=boot(rom,mode);let n=0,hits=0;
 try{for(const slot of slots)for(const dx of xs)for(const y of ys){
  gb.step_to(s._ce_probe_sample);const m=memory(gb),a=art[target],left=60+dx-a.origin.x+a.hitbox.x,top=y-a.origin.y+a.hitbox.y,hud=g.screens.find(s=>s.id==='hud'),rayTop=hud.dock==='top'?(hud.rows??2)*8:0;
  const hit=left<61&&left+a.hitbox.w>59&&top<112&&top+a.hitbox.h>rayTop;
  assert.equal(m.ram.readUInt16LE(s._ce_probe_case-0xc000),n);assert.equal(m.ram[s._ce_probe_slot-0xc000],slot);assert.equal(m.ram[s._ce_probe_hp-0xc000],hit?99:100,JSON.stringify({slot,dx,y}));if(hit)hits++;n++;gb.clock();
 }results.push({mode:label,cases:n,hits});console.log(results.at(-1));}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
