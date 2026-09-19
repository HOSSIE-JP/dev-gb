// Dedicated load fixture, not evidence of a production playthrough.
// Keeps exactly 40 bullets alive, with the actual update/render/audio paths.
// node ... CAPTURED_OBJECTS OUT [spread|cluster|guided] [character]
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';import crypto from 'node:crypto';import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
const [objects,outArg,scenario='spread',character='0']=process.argv.slice(2),out=path.resolve(outArg);
fs.mkdirSync(out,{recursive:true});
const baseline=process.argv.includes('--baseline'),engineArg=process.argv.indexOf('--engine');
const engine=engineArg>=0?process.argv[engineArg+1]:baseline?'.cache/gbc-runtime-v41/baseline/caravan':'engine/caravan';
assert(['spread','cluster','moving','guided','graze','burst','bomb'].includes(scenario));
const patterns=JSON.parse(fs.readFileSync('projects/touhou-kouma/assets-src/game.json')).patterns, guided=patterns.findIndex(p=>p.kind==='homing');
assert(guided>=0);
const moving=scenario==='moving'||scenario==='guided';
const source=path.join(out,'mainloop.c');
let c=fs.readFileSync(path.join(engine,'mainloop.c'),'utf8');
const harness=`
extern uint8_t allocate(uint8_t kind,uint8_t asset);
extern uint16_t event_cursor;
uint16_t ce_qa_updates;
uint8_t ce_qa_bad_count;uint16_t ce_qa_spawns;
void ce_qa_marker(void) NONBANKED { __asm nop __endasm; }
static void ce_qa_fill(void) {
 uint8_t i=0;
 if(ce_bomb_left)return;
 ce_bg_request.life=${scenario==='guided'?patterns[guided].lifetime:3000};ce_bg_request.damage=1;
 ce_bg_request.pattern=${scenario==='guided'?guided:'CE_NONE'};ce_bg_request.angle=8;
 while(ce_bg_count<40u && i<40u){
  ce_bg_request.vx=${moving?'((ce_qa_spawns&1u)?3:-3)':'0'};ce_bg_request.vy=${moving?'6':'0'};
  ce_bg_request.x=${scenario==='cluster'?'(16u+(i%4u)*2u+(i/16u)*16u)*16u':'(8u+(i%10u)*10u)*16u'};
  ce_bg_request.y=${scenario==='cluster'?'(48u+((i/4u)%4u)*2u)*16u':'(20u+(i/10u)*20u)*16u'};
  ${scenario==='graze'?'if(ce_bg_count==39u){ce_bg_request.x=97*16;ce_bg_request.y=130*16;}':''}
  ce_bg_spawn();++ce_qa_spawns;++i;
 }
}
static void ce_qa_run(void) {
 uint8_t i,slot;CE_Entity *boss;
 ce_select_player(${+character});ce_reset(6,1);event_cursor=ce_stage->event_count;
 ce_scene=1;ce_state.scroll=0;ce_state.invulnerable=${scenario==='graze'?0:65000};ce_state.player_x=104*16;ce_state.player_y=130*16;
 slot=allocate(CE_BOSS,ce_bosses[5].asset);boss=&CE_ENTITY(slot);
 boss->ref=5;boss->hp=255;boss->phase=1;boss->x=boss->base_x=60*16;boss->y=boss->base_y=32*16;
 ce_boss_invulnerable=1;ce_battle_asset=boss->asset;ce_battle_mode=2;ce_bg_limit=40;
 ce_load_stage();ce_music_play(ce_stage->boss_music);ce_bg_begin();
 ce_qa_fill();
 ce_audio_sync();
 for(;;){
  ${scenario==='burst'?'if(ce_qa_updates && !(ce_qa_updates&31u)){ce_bg_clear();ce_bg_begin();ce_qa_fill();}':''}
  ce_step(${scenario==='bomb'?'ce_qa_updates==199u?0:(ce_qa_updates==200u?(J_A|J_B):J_A)':'J_A'});ce_qa_fill();ce_render();ce_audio_sync();ce_trace_write();
  if(!ce_bomb_left && ce_bg_count!=40u)ce_qa_bad_count=1;
  ++ce_qa_updates;ce_qa_marker();
 }
}
`;
c=c.replace('void ce_mainloop(void) BANKED {',harness+'\nvoid ce_mainloop(void) BANKED {').replace('    ce_save_load();','    ce_qa_run();\n    ce_save_load();');
if(baseline)c=c.replaceAll('CE_ENTITY(slot)','ce_entities[slot]');
fs.writeFileSync(source,c);
const run=(exe,args)=>{const r=spawnSync(exe,args,{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stdout+r.stderr);};
const object=path.join(out,'mainloop.o');
run(path.resolve('.tools/gbdk/bin/lcc.exe'),['-DCE_CGB_ONLY='+(baseline?0:1),'-DCE_GRAZE_ENABLED=1','-DCE_OBJ_16=1','-DCE_HUD_RIGHT=1','-Wf--opt-code-speed','-Wf--max-allocs-per-node50000','-debug','-I'+engine,'-c','-o',object,source]);
run(process.execPath,['editor/tests/gbc-runtime-relink.mjs',objects,out,object,...(baseline?['--dual']:[])]);
const rom=path.join(out,'touhou-kouma.gb'),clock=parseInt(fs.readFileSync(rom.replace('.gb','.map'),'utf8').match(/\b([\da-fA-F]{8})\s+_sys_time\b/)[1],16),s=symbols(rom.replace('.gb','.map')),gb=boot(fs.readFileSync(rom),GameBoyMode.Cgb),rows=[];
try{
 let previous,cleared=0,minimumStack=0xffff;
 for(let n=0;n<600;n++){
  gb.step_to(s._ce_qa_marker);const m=memory(gb),read=name=>m.ram[s[name]-0xc000],frame=m.ram.readUInt16LE(clock-0xc000);
  if(scenario==='bomb' && read('_ce_bomb_left')){assert.equal(read('_ce_bg_count'),0);cleared++;}else assert.equal(read('_ce_bg_count'),40);assert.equal(read('_ce_qa_bad_count'),0);
  const reg=gb.registers();minimumStack=Math.min(minimumStack,reg.sp);reg.free();
  assert.equal(m.ram.readUInt16LE(s._ce_bg_tile_drops-0xc000),0);
  assert.ok(read('_ce_bg_dma_end_ly')>=144&&read('_ce_bg_dma_end_ly')<=153);
  assert.deepEqual(m.oam,m.ram.subarray(s._shadow_OAM-0xc000,s._shadow_OAM-0xc000+160));
  if(previous!==undefined)rows.push((frame-previous)&65535);previous=frame;gb.clock();
 }
 if(scenario==='bomb')assert(cleared>30,'live bomb clears incoming barrage for its duration');
 if(scenario==='graze')assert.equal(memory(gb).ram.readUInt16LE(s._ce_state-0xc000+6),fs.readFileSync(rom)[s._ce_graze_score],'stationary bullet only grazes once at the compiled point value');
 const report={romHash:crypto.createHash('sha256').update(fs.readFileSync(rom)).digest('hex'),fixture:true,baseline,spawns:memory(gb).ram.readUInt16LE(s._ce_qa_spawns-0xc000),cleared,minimumSampledSp:minimumStack,scenario,character:+character,bullets:40,updates:rows.length,framesPerUpdate:rows.reduce((n,x)=>n+x,0)/rows.length,deadlineMisses:rows.filter(x=>x!==1).length,gaps:rows};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,gaps:undefined}));
}finally{gb.free();}
