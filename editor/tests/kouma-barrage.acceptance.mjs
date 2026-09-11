// Profile every authored barrage in a disposable ROM. Stage entry and phase conditions
// are accelerated/timed; movement, patterns, graphics, music and player weapons are retained.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';import {PNG} from '../node_modules/pngjs/lib/png.js';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v09/barrage'),source=path.resolve(process.argv[3]&&!process.argv[3].startsWith('--')?process.argv[3]:root),fixture=path.join(out,'fixture'),baseline=process.argv.includes('--baseline');
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});for(const d of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,d),path.join(fixture,d),{recursive:true});
const runtime=path.join(fixture,'engine/caravan/runtime.c');
fs.writeFileSync(runtime,fs.readFileSync(runtime,'utf8').replace('phase = &actor->phase[e->phase];','phase = &actor->phase[e->phase];\n                /* QA only: complete each non-final attack after 640 updates. */\n                if (e->phase && e->phase + 1u < actor->phases && e->phase_age >= 640u) e->hp = 0;')+'\nvoid ce_qa_marker(void) NONBANKED { __asm nop __endasm; }\n');
const loop=path.join(fixture,'engine/caravan/mainloop.c');fs.writeFileSync(loop,fs.readFileSync(loop,'utf8').replace('static void record_score','void ce_qa_marker(void) NONBANKED;\nstatic void record_score').replace('ce_trace_write();','ce_trace_write(); ce_qa_marker();'));
const game=lib.readGame(source,'touhou-kouma'),authoredRevision=lib.revision(game);game.name='barrage-test';game.stageFade=false;game.bossCelebration=false;game.timeLimit=true;game.player.x=8;game.player.y=128;game.player.lives=9;game.player.invulnerability=1024;
for(const b of game.bosses)for(const [i,p]of b.phases.entries()){if(!i)p.threshold=2;if(p.intro)p.intro.enabled=false;}
for(const s of game.stages){const e=s.events.find(e=>e.kind==='boss');s.events=[{...e,frame:0,x:80,y:36}];s.requireBoss=false;s.clearOnBoss=false;s.duration=34;Object.assign(s.presentation,{enabled:false,clearEnabled:false,victoryDialogue:{...s.presentation.victoryDialogue,enabled:false}});}
if(!fs.existsSync(path.join(fixture,'projects/barrage-test')))lib.createProject(fixture,'barrage-test',game.title,game);else lib.saveGame(fixture,'barrage-test',game);
const report=process.argv.includes('--reuse')?{romPath:path.join(fixture,'projects/barrage-test/build/Release/barrage-test.gb')}:lib.compile(fixture,'barrage-test','Release',()=>{}),rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map')),results=[];
const capture=(gb,file)=>{const p=new PNG({width:160,height:144}),rgb=gb.frame_buffer_eager();for(let i=0;i<23040;i++){p.data.set(rgb.subarray(i*3,i*3+3),i*4);p.data[i*4+3]=255;}fs.writeFileSync(file,PNG.sync.write(p));};
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
 const gb=boot(rom,mode),label=mode===GameBoyMode.Dmg?'DMG':'CGB',rows=new Map();let previous,ended=false;
 try{frames(gb,240);gb.key_press(PadKey.Start);frames(gb,2);gb.key_lift(PadKey.Start);gb.key_press(PadKey.B);
  for(let n=0;n<16000;n++){
   gb.step_to(syms._ce_qa_marker);const m=memory(gb),r=m.ram,byte=s=>r[syms[s]-0xc000],word=s=>r.readUInt16LE(syms[s]-0xc000),t=r.subarray(syms._ce_trace-0xc000),stage=game.stages.find(s=>s.id===game.stageOrder[t[4]]),e=syms._ce_entities-0xc000,phase=r[e+4],count=byte('_ce_bg_count'),ppu=gb.ppu_frame();
   if(t[17]===3){ended=true;break;}assert.notEqual(t[17],2,'fixture survives all seven encounters');
   if(t[17]===1&&r[e]===2&&phase>0){
    const b=game.bosses.find(b=>b.id===stage.events[0].ref),key=b.id+'-'+phase,age=r.readUInt16LE(e+8);if(!rows.has(key))rows.set(key,{boss:b.id,phase,cap:b.battle.maxBullets,peak:0,samples:0,bulletTotal:0,gaps:[],playerShotPeak:0,spawnDrops:0,dropStart:r.readUInt16LE(syms._ce_state-0xc000+12)});const row=rows.get(key);
    assert.ok(count<=row.cap&&(baseline||count<=40),'authored live bullet ceiling');assert.equal(word('_ce_bg_tile_drops'),0,'no missing composite tiles');
    let alive=0;for(let s=0;s<64;s++)if(r.readUInt16LE(syms._ce_bg_life-0xc000+s*2)){alive++;if(!baseline)assert.ok(r.readInt16LE(syms._ce_bg_vy-0xc000+s*2)>0,'actual SM83 shot velocity always points down');}assert.equal(alive,count);
    row.spawnDrops=Math.max(row.spawnDrops,r.readUInt16LE(syms._ce_state-0xc000+12)-row.dropStart);
    row.playerShotPeak=Math.max(row.playerShotPeak,r[syms._ce_pool_counts-0xc000+3]);
    if(count>row.peak){row.peak=count;capture(gb,path.join(out,label+'-'+key+'.png'));}
    if(age>=192&&age<=632&&!word('_ce_respawn')){row.samples++;row.bulletTotal+=count;if(previous?.key===key&&previous.age+1===age)row.gaps.push(ppu-previous.ppu);}
    previous={key,age,ppu};
   }else previous=undefined;
   gb.clock();
  }
  assert.ok(ended);assert.equal(rows.size,21);
  const data=[...rows.values()].map(({bulletTotal,gaps,dropStart,...r})=>{assert.ok(r.samples>=300);assert.ok(gaps.length>250);const average=gaps.reduce((a,b)=>a+b,0)/gaps.length;return {...r,meanBullets:+(bulletTotal/r.samples).toFixed(2),framesPerUpdate:+average.toFixed(4),updatesPerSecond:+(59.7275/average).toFixed(3),oneFramePercent:+(100*gaps.filter(g=>g===1).length/gaps.length).toFixed(2),maxFrameGap:Math.max(...gaps)};});
  if(!baseline&&mode===GameBoyMode.Cgb)assert.ok(data.every(r=>r.updatesPerSecond>=58&&r.maxFrameGap<=2),'CGB sustained barrage budget, including focused player fire');
  results.push({mode:label,rows:data});
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:report.romPath,authoredRevision,fixture:'Seven original bosses, phase HP, patterns, movement, music and return sequence; QA sets non-final phase HP to zero after 640 updates. No intro images/dialogue; stage timeout after 2040 updates, player x8 with focused B held, 9 lives and 1024-update invulnerability. Timing marker and forced phase depletion exist only in this fixture.',results},null,2));for(const r of results){console.log(r.mode);console.table(r.rows);}
