// Authored ROM diagnostic, not host RAM/ROM patches. Compare the exact state
// after ce_shoot and every subsequent update, including birth-time retirement.
// node editor/tests/bg-volley.acceptance.mjs OUT ENGINE [BEFORE.json] [--reuse]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const out=path.resolve(process.argv[2]),engine=path.resolve(process.argv[3]);
const reuse=process.argv.includes('--reuse');
const before=process.argv[4]&&!process.argv[4].startsWith('--')?JSON.parse(fs.readFileSync(process.argv[4],'utf8')):null;
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
fs.mkdirSync(out,{recursive:true});
const fixture=reuse?path.join(out,fs.readdirSync(out).find(n=>n.startsWith('fixture-'))):fs.mkdtempSync(path.join(out,'fixture-'));
if(!reuse){fs.cpSync(engine,path.join(fixture,'engine'),{recursive:true});
for(const t of ['gbdk','misaki'])fs.cpSync('.tools/'+t,path.join(fixture,'.tools',t),{recursive:true});}
const game=lib.readGame(process.cwd(),'star-caravan'),player=game.assets.find(a=>a.id===game.player.asset);
game.name='bg-volley';game.title='BG VOLLEY';
const title=game.screens.find(s=>s.id==='title')?.items.find(i=>i.id==='title-name');if(title)title.text=game.title;
player.hitbox={x:1,y:1,w:3,h:3};
const source=game.assets.findIndex(a=>a.id===game.bosses[0].asset),first=game.patterns.length;
const template=game.patterns.find(p=>p.id==='boss-fan');
const four=Array.from({length:4},()=>({x:0,y:0}));
for(const [i,patch] of [
 {kind:'fan',count:16,emitterOffsets:four},
 {kind:'fan',count:16,emitterOffsets:[{x:-32,y:0},{x:0,y:0},{x:16,y:0},{x:32,y:0}]},
 {kind:'homing',emitterOffsets:four,guidance:{frames:32,period:8}},
 {kind:'fan',count:8,launch:{kind:'both',x:80,y:80,step:12,lanes:4}},
 {kind:'fan',count:8,launch:{kind:'alternate',x:80,y:80,step:12,lanes:4}},
 {kind:'aimed-down',emitterOffsets:four},
 {kind:'spiral',count:16,rotation:22.5,emitterOffsets:four},
 {kind:'fan',count:8,launch:{kind:'fixed',x:120,y:72,step:8,lanes:4}},
].entries())game.patterns.push({...structuredClone(template),id:'volley-'+i,name:'VOLLEY '+i,lifetime:64,damage:17,speed:0.75,angle:180,spread:90,...patch});
const names=['full-wrap','fills-first-emitter','culled-birth','collision-birth','homing','both-edges','alternate-left','alternate-right','aimed-down','rotating','fixed','bomb','sprite-enemy','sprite-friendly','no-pattern','fills-second-emitter','full-homing'];
const code=`#pragma bank 255
#include "caravan.h"
#include "mainloop.h"
uint8_t ce_title_choice,ce_title_stage,ce_demo,ce_demo_abort,ce_demo_cutin;
uint8_t ce_bench_case,ce_bench_tick;
void ce_bench_start(void) NONBANKED __naked { __asm ret __endasm; }
void ce_bench_end(void) NONBANKED __naked { __asm ret __endasm; }
void ce_bench_sample(void) NONBANKED __naked { __asm ret __endasm; }
void ce_mainloop(void) BANKED {
 uint8_t i,n,p;int16_t x,y;
 ce_is_cgb=_cpu==CGB_TYPE;if(ce_is_cgb)cpu_fast();
 for(ce_bench_case=0;ce_bench_case!=${names.length};++ce_bench_case){
  ce_reset(0,1);ce_scene=1;ce_respawn=1;ce_battle_mode=2;
  ce_bg_limit=40;ce_state.player_x=80*16;ce_state.player_y=120*16;
  LCDC_REG=0x81;ce_bg_setup();ce_bg_begin();
  x=80*16;y=40*16;p=${first};n=0;
  if(ce_bench_case==0u||ce_bench_case==16u){ce_bg_limit=8;n=8;ce_state.dropped=65530u;}
  if(ce_bench_case==1u){ce_bg_limit=20;n=7;}
  if(ce_bench_case==2u){ce_bg_limit=3;n=2;x=16*16;p=${first+1};}
  if(ce_bench_case==3u){ce_bg_limit=3;n=2;y=120*16;ce_respawn=0;ce_state.invulnerable=0;}
  if(ce_bench_case==4u||ce_bench_case==16u)p=${first+2};
  if(ce_bench_case==5u||ce_bench_case==13u)p=${first+3};
  if(ce_bench_case==6u||ce_bench_case==7u)p=${first+4};
  if(ce_bench_case==8u){p=${first+5};ce_state.player_y=24*16;}
  if(ce_bench_case==9u)p=${first+6};
  if(ce_bench_case==10u)p=${first+7};
  if(ce_bench_case==11u)ce_bomb_image=1;
  if(ce_bench_case==12u)ce_battle_mode=0;
  if(ce_bench_case==14u)p=CE_NONE;
  if(ce_bench_case==15u)ce_bg_limit=20;
  ce_bg_begin();
  for(i=0;i!=n;++i){
   ce_bg_request.x=(8+i*4u)*16;ce_bg_request.y=32*16;
   ce_bg_request.vx=0;ce_bg_request.vy=0;ce_bg_request.life=64;
   ce_bg_request.damage=1;ce_bg_request.pattern=CE_NONE;ce_bg_spawn();
  }
  ce_bench_start();ce_shoot(p,${source},x,y,ce_bench_case==13u,ce_bench_case);ce_bench_end();
  ce_bench_tick=0;ce_bench_sample();
  for(ce_bench_tick=1;ce_bench_tick!=33;++ce_bench_tick){
   ++ce_state.tick;ce_bg_update();ce_bench_sample();
  }
 }
 for(;;)vsync();
}
`;
let build;
if(!reuse){fs.writeFileSync(path.join(fixture,'engine/caravan/mainloop.c'),code);
fs.mkdirSync(path.join(fixture,'projects'));lib.createProject(fixture,'bg-volley','BG VOLLEY',game);
build=lib.compile(fixture,'bg-volley','Debug',s=>fs.appendFileSync(path.join(out,'build.log'),s));}
else{assert.equal(fs.readFileSync(path.join(fixture,'engine/caravan/mainloop.c'),'utf8'),code);assert.equal(lib.revision(lib.readGame(fixture,'bg-volley')),lib.revision(game));
assert.equal(digest(fs.readFileSync(path.join(fixture,'engine/caravan/special.c'))),digest(fs.readFileSync(path.join(engine,'caravan/special.c'))));
build={romPath:path.join(fixture,'projects/bg-volley/build/Debug/bg-volley.gb')};}
const rom=fs.readFileSync(build.romPath),stem=build.romPath.replace(/\.gb$/,''),s=symbols(stem+'.map');
const cdb=fs.readFileSync(stem+'.cdb','utf8');
for(const name of ['damage','guide_pattern','guide_angle','has_guidance','spawn_next']){
 const a=cdb.match(new RegExp('^L:Fbg_bullets\\$'+name+'\\$0_0\\$0:([0-9a-f]+)$','mi'));
 assert.ok(a,name);s[name]=parseInt(a[1],16);
}
const result={diagnostic:true,rom:build.romPath,sha256:digest(rom),harnessSha256:digest(code),gameRevision:lib.revision(game),specialSha256:digest(fs.readFileSync(path.join(engine,'caravan/special.c'))),modes:[]};
if(before){assert.equal(result.harnessSha256,before.harnessSha256);assert.equal(result.gameRevision,before.gameRevision);}
for(const [mode,name]of [[GameBoyMode.Dmg,'DMG'],[GameBoyMode.Cgb,'CGB']]){
 const gb=boot(rom,mode),cases=[];
 try{
  for(let c=0;c<names.length;c++){
   gb.step_to(s._ce_bench_start);const cycles=gb.clock()+gb.step_to(s._ce_bench_end),samples=[];
   for(let tick=0;tick<33;tick++){
    gb.clock();gb.step_to(s._ce_bench_sample);const {ram:r}=memory(gb),at=n=>s[n]-0xc000,read=n=>r[at(n)],live=[];
    assert.equal(read('_ce_bench_case'),c);assert.equal(read('_ce_bench_tick'),tick);
    for(let i=0;i<64;i++)if(r.readUInt16LE(at('_ce_bg_life')+i*2)){
     live.push([i,...['x','y','vx','vy','life'].map(k=>r.readUInt16LE(at('_ce_bg_'+k)+i*2)),r[at('damage')+i],r[at('guide_pattern')+i],r[at('guide_pattern')+i]===255?null:r[at('guide_angle')+i]]);
    }
    assert.equal(live.length,read('_ce_bg_count'));
    const bytes=(n,size)=>[...r.subarray(at(n),at(n)+size)];
    const snapshot={live,hit:read('_ce_bg_hit'),dropped:r.readUInt16LE(at('_ce_state')+12),next:read('spawn_next'),guidance:read('has_guidance'),entities:bytes('_ce_entities',39*25),shotPlanes:['x','y','vx','vy','age','lifetime','px','py','oam','simple'].map(k=>bytes('_ce_shot_'+k,k==='oam'?156:k==='simple'?39:78)),pools:bytes('_ce_pool_counts',7),oam:read('_ce_pool_oam')};
    const state=digest(JSON.stringify(snapshot));
    if(before)assert.equal(state,before.modes.find(m=>m.mode===name).cases[c].samples[tick],`${name} ${names[c]} tick ${tick}`);
    samples.push(state);
    if(tick===0){
     if(c===0)assert.equal(snapshot.dropped,58);
     if(c===1)assert.equal(snapshot.dropped,51);
     if(c===2){assert.equal(live.length,3);assert.equal(snapshot.dropped,47);}
     if(c===3){assert.equal(live.length,2);assert.equal(snapshot.hit,17);assert.equal(snapshot.dropped,0);}
     if([11,14].includes(c)){assert.equal(live.length,0);assert.equal(snapshot.dropped,0);}
     if(c===15){assert.equal(live.length,20);assert.equal(snapshot.dropped,44);}
     cases.push({name:names[c],cycles,initial:{count:live.length,hit:snapshot.hit,dropped:snapshot.dropped},samples});
    }
   }
  }
  result.modes.push({mode:name,cases});
 }finally{gb.free();}
}
if(before)for(const mode of result.modes){
 const prior=before.modes.find(m=>m.mode===mode.mode).cases;
 for(const [i,c]of mode.cases.entries())assert.ok(c.cycles<=prior[i].cycles*1.12,`${mode.mode} ${c.name}: bound the small-volley fixed cost`);
 for(const [i,ratio]of [[0,.1],[1,.6],[9,.9],[12,1],[13,1]])assert.ok(mode.cases[i].cycles<=prior[i].cycles*ratio,`${mode.mode} ${mode.cases[i].name}: require measured generation improvement`);
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({parity:!!before,sha256:result.sha256,modes:result.modes.map(m=>({mode:m.mode,cases:m.cases.map(({samples,...c})=>c)}))},null,2));
