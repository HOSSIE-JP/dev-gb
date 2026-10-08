// Diagnostic ROM: distinct evidence from the unmodified production-game test.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/uge-integration-20261008/diagnostic');fs.mkdirSync(out,{recursive:true});
const g=lib.readGame(root,'touhou-kouma'),engine=path.join(root,'engine/caravan');
const songs=lib.generateMusic(path.join(root,'projects',g.name),out,undefined,g.musicTracks,g.musicUgeTracks);
const exec=(tool,args)=>{const r=spawnSync(path.join(root,'.tools/gbdk/bin',tool+'.exe'),args,{cwd:out,encoding:'utf8'});fs.appendFileSync(path.join(out,'build.log'),r.stdout+r.stderr);assert.equal(r.status,0,r.stdout+r.stderr);};
exec('sdar',['x',path.join(engine,'hUGEDriver.lib')]);
exec('lcc',['-Wm-yc','-DCE_MUSIC_UGE=1','-DCE_MUSIC_3VOICE=1','-Wl-yt0x19','-Wm-yoA','-autobank','-Wb-ext=.rel','-I'+engine,'-Wl-m','-Wl-j','-debug','-o','diagnostic.gb',path.join(root,'editor/tests/fixtures/uge_music_harness.c'),...['music.c','sound.c','uge-player.c'].map(f=>path.join(engine,f)),...songs,path.join(out,'hUGEDriver.o')]);
const rom=fs.readFileSync(path.join(out,'diagnostic.gb')),s=symbols(path.join(out,'diagnostic.map')),results=[];
for(const [mode,label] of [[GameBoyMode.Dmg,'DMG'],[GameBoyMode.Cgb,'CGB']]){
    const gb=boot(rom,mode);
    try{
        let checks;
        for(let i=0;i<20000;i++){frames(gb,1);checks=memory(gb).ram.subarray(s._ce_uge_test-0xc000,s._ce_uge_test-0xc000+32);if(checks[0]===0x55)break;}
        assert.equal(checks[0],0x55,'diagnostic program completed');
        for(let i=1;i<24;i++)assert.equal(checks[i],1,`native diagnostic check ${i} (${label}): ${[...checks]}`);
        const audio=[];
        for(let id=16;id<=31;id++){
            gb.key_press(PadKey.A);frames(gb,4);gb.key_lift(PadKey.A);frames(gb,4);
            assert.equal(memory(gb).ram[s._ce_music_track-0xc000],id);
            gb.audio_buffer_eager(true);frames(gb,180);const samples=gb.audio_buffer_eager(true),energy=samples.reduce((n,v)=>n+v*v,0);
            assert(energy>0,`track ${id} PCM output`);audio.push({id,energy});
        }
        results.push({mode:label,checks:[...checks],audio});console.log(label,'23 native checks and all 16 PCM outputs passed');
    }finally{gb.free();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({kind:'diagnostic ROM',results},null,2));}
}
