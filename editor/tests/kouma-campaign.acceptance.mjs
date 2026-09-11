// Full art/music/campaign linkage with shortened boss encounters; not a full-game clear.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';import {PNG} from '../node_modules/pngjs/lib/png.js';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:path.join(root,'.cache/kouma-v07/campaign-qa')),fixture=path.join(out,'fixture');
fs.mkdirSync(fixture,{recursive:true});for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
const game=lib.readGame(root,'touhou-kouma');game.name='kouma-test';game.player.invulnerability=1024;game.bossCelebration=false;
const w=game.patterns.find(p=>p.id===game.player.weapon);Object.assign(w,{kind:'straight',speed:8,interval:2,delay:0,angle:0,damage:1});
for(const b of game.bosses){b.hp=3;for(const [i,p]of b.phases.entries()){p.threshold=i===0?2:i===1?2:i===2?1:0;p.motion={...p.motion,kind:'straight',vx:0,vy:0};}}
for(const s of game.stages){const e=s.events.find(e=>e.kind==='boss');s.events=[{...e,frame:0,x:80,y:36}];}
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});if(!fs.existsSync(path.join(fixture,'projects/kouma-test')))lib.createProject(fixture,'kouma-test',game.title,game);else lib.saveGame(fixture,'kouma-test',game);
const report=process.argv.includes('--reuse')?{romPath:path.join(fixture,'projects/kouma-test/build/Debug/kouma-test.gb')}:lib.compile(fixture,'kouma-test','Debug',()=>{}),rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map')),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){const gb=boot(rom,mode),label=mode===GameBoyMode.Dmg?'DMG':'CGB',cutins=new Set(),scores=new Set(),talks=new Set();let peak=0,done=false;
 try{frames(gb,240);gb.key_press(PadKey.Start);frames(gb,2);gb.key_lift(PadKey.Start);
 for(let f=0;f<16000;f++){const m=memory(gb).ram,byte=n=>m[syms[n]-0xc000],scene=byte('_ce_scene'),stage=m[syms._ce_state-0xc000+18],left=m.readUInt16LE(syms._ce_intro_left-0xc000);peak=Math.max(peak,byte('_ce_bg_count'));
  if(scene===5)talks.add(stage);if(scene===6)scores.add(stage);
  if(scene===7&&left===35){const key=stage+'-'+m[syms._ce_entities-0xc000+4];cutins.add(key);const p=new PNG({width:160,height:144}),rgb=gb.frame_buffer_eager();for(let i=0;i<160*144;i++){p.data.set(rgb.subarray(i*3,i*3+3),i*4);p.data[i*4+3]=255;}fs.writeFileSync(path.join(out,label+'-'+key+'.png'),PNG.sync.write(p));}
  if(scene===3){gb.key_lift(PadKey.A);frames(gb,20);const p=new PNG({width:160,height:144}),rgb=gb.frame_buffer_eager();for(let i=0;i<23040;i++){p.data.set(rgb.subarray(i*3,i*3+3),i*4);p.data[i*4+3]=255;}fs.writeFileSync(path.join(out,label+'-ending.png'),PNG.sync.write(p));done=true;break;}
  if(scene===1||f%4<2)gb.key_press(PadKey.A);else gb.key_lift(PadKey.A);frames(gb,1);
 }
 assert.equal(cutins.size,21,'all seven bosses show three phase cards');assert.equal(scores.size,7);assert.equal(talks.size,7);assert.ok(done);results.push({mode:label,cutins:[...cutins],scoreStages:[...scores],dialogueStages:[...talks],endingReached:done,peakBgBullets:peak});
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:report.romPath,fixture:'Boss HP/thresholds/entry timing reduced, bosses stationary, player weapon accelerated with 1024-tick invulnerability, victory explosion disabled; original art, dialogue, enemy patterns and BGM retained',results},null,2));console.log(JSON.stringify(results,null,2));
