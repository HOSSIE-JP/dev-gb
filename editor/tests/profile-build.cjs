// Build an instrumented copy only; never ship this diagnostic ROM.
const fs=require('fs'),path=require('path'),lib=require('../build/library.cjs');
const root=path.resolve(__dirname,'../..');
fs.mkdirSync(path.join(root,'.cache'),{recursive:true});
const dir=fs.mkdtempSync(path.join(root,'.cache/profile-fixture-'));
for(const f of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,f),path.join(dir,f),{recursive:true});
let runtime=fs.readFileSync(path.join(root,'engine/caravan/runtime.c'),'utf8');
let render=fs.readFileSync(path.join(root,'engine/caravan/render.c'),'utf8');
runtime=runtime.replace('CE_Entity ce_entities','volatile uint8_t ce_profile_phase;\nCE_Entity ce_entities');
runtime=runtime.replace('step_player(input); finish = stage_events(); step_entities(); collide_shots(); collide_player();','ce_profile_phase=1; step_player(input); ce_profile_phase=2; finish = stage_events(); ce_profile_phase=3; step_entities(); ce_profile_phase=4; collide_shots(); collide_player(); ce_profile_phase=0;');
runtime=runtime.replace('ce_render();','ce_profile_phase=5; ce_render(); ce_profile_phase=0;').replace('ce_trace_write();','ce_profile_phase=8; ce_trace_write(); ce_profile_phase=0;').replace('        ce_audio_sync();','        ce_profile_phase=9; ce_audio_sync(); ce_profile_phase=0;');
render=render.replace('    if (row + 1u', '    ce_profile_phase=6;\n    if (row + 1u').replace('    previous_row = row;', '    ce_profile_phase=5;\n    previous_row = row;').replace('    if (!(ce_state.tick & 7u)) ce_hud();','    ce_profile_phase=7;\n    if (!(ce_state.tick & 7u)) ce_hud();\n    ce_profile_phase=5;');
render=render.replace('    vsync();\n    move_bkg', '    ce_profile_phase=0; vsync();\n    ce_profile_phase=5; move_bkg');
fs.writeFileSync(path.join(dir,'engine/caravan/runtime.c'),runtime);fs.writeFileSync(path.join(dir,'engine/caravan/render.c'),render);fs.appendFileSync(path.join(dir,'engine/caravan/caravan.h'),'\nextern volatile uint8_t ce_profile_phase;\n');
fs.mkdirSync(path.join(dir,'projects'));
const g=lib.readGame(root,'nova-spear');g.stageFade=false;lib.createProject(dir,'nova-prof','NOVA PROFILE',g);
const r=lib.compile(dir,'nova-prof','Release',()=>{});console.log(r.romPath);
