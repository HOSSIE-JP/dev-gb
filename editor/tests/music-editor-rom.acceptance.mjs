// Build the music actually saved through Electron, then run the resulting game ROM.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/music-editor/edited-rom');
const ui=JSON.parse(fs.readFileSync(path.join(root,'.cache/music-editor/ui/results.json'),'utf8'));assert(ui.records.includes('PASS'),'requires successful real editor roundtrip');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'projects'),{recursive:true});
for(const relative of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,relative),path.join(out,relative),{recursive:true});
const game=lib.readGame(ui.temp,'first');
for(const relative of ['assets-src/midi_gb','assets-src/music'])fs.cpSync(path.join(ui.temp,'projects/first',relative),path.join(out,'projects/first',relative),{recursive:true});
lib.createProject(out,'edited-music','EDITED MUSIC',game);
const results={uiProject:ui.temp,builds:[],playback:[]};
const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
for(const config of ['Debug','Release']){const log=path.join(out,config+'.log');fs.writeFileSync(log,'');const build=lib.compile(out,'edited-music',config,s=>fs.appendFileSync(log,s));assert(build.ok,JSON.stringify(build));assert(build.ramBytes<=7168);results.builds.push(build);save();}
const file=results.builds[1].romPath,rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map'));
assert.deepEqual(rom,fs.readFileSync(results.builds[0].romPath));assert.equal(rom[0x143],0x80,'dual DMG/CGB game');
for(const [mode,label]of [[GameBoyMode.Dmg,'DMG'],[GameBoyMode.Cgb,'CGB']]){
    const gb=boot(rom,mode),value=n=>memory(gb).ram[s[n]-0xc000],row=()=>memory(gb).ram.readUInt16LE(s._ce_music_row-0xc000);
    try{frames(gb,240);gb.key_press(PadKey.Start);frames(gb,8);gb.key_lift(PadKey.Start);
        let started=false;for(let f=0;f<1200;f++){const t=settledTrace(gb,s._ce_trace);if(t?.scene===1&&t.tick>=3){started=true;break;}frames(gb,1);}assert(started);
        assert.equal(value('_ce_music_track'),32);assert.equal(value('_ce_music_three'),1);const before=row();gb.audio_buffer_eager(true);gb.key_press(PadKey.A);frames(gb,180);gb.key_lift(PadKey.A);assert(row()>before);assert(gb.audio_buffer_eager(true).some(n=>n!==0));
        gb.key_press(PadKey.Start);frames(gb,4);gb.key_lift(PadKey.Start);frames(gb,16);const paused=row();frames(gb,30);assert.equal(row(),paused);
        results.playback.push({mode:label,track:32,threeVoices:true,continuousFire:true,pause:true});save();
    }finally{gb.free();}
}
results.passed=true;save();console.log(JSON.stringify(results,null,2));
