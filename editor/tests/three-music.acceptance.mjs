// Music-only ROM using the production player/SFX and imported MIDI bytes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs');
const out=path.resolve(process.argv[2]??'.cache/midi-import-v44/music'),work=path.join(out,'fixture'),manifest=path.join(root,'projects/touhou-kouma/assets-src/midi_gb/import.json');
fs.mkdirSync(work,{recursive:true});
for(const f of ['music.c','music.h','sound.c','caravan.h'])fs.copyFileSync(path.join(root,'engine/caravan',f),path.join(work,f));
fs.copyFileSync(path.join(root,'editor/tests/fixtures/three_music_harness.c'),path.join(work,'main.c'));
const sources=lib.generateMusic(root,work,manifest),r=spawnSync(path.join(root,'.tools/gbdk/bin/lcc.exe'),['-DCE_MUSIC_3VOICE=1','-Wm-yc','-Wl-yt0x19','-Wm-yoA','-autobank','-Wb-ext=.rel','-Wl-m','-Wl-j','-debug','-I.','-o','music.gb','main.c','music.c','sound.c',...sources],{cwd:work,encoding:'utf8'});
fs.writeFileSync(path.join(out,'build.log'),r.stdout+r.stderr);assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/warning/i);
const rom=fs.readFileSync(path.join(work,'music.gb')),syms=symbols(path.join(work,'music.map')),tracks=lib.importMidiMusic(manifest),results=[];
const labels=['three voices start','shot preserves pulse voices','pickup owns CH1 for 20 VBlanks','pickup restores current counter note','sustained lease survives stalled update','bomb keeps CH1 and CH4','bomb restores counter note','pause silences and freezes all music','mixer preserved','legacy transition releases CH1','legacy shot retains CH1'];
function wav(file,pcm,rate,channels){const b=Buffer.alloc(44);b.write('RIFF');b.writeUInt32LE(pcm.length+36,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);fs.writeFileSync(file,Buffer.concat([b,pcm]));}
for(const [mode,label]of [[GameBoyMode.Dmg,'DMG'],[GameBoyMode.Cgb,'CGB']]){
    const gb=boot(rom,mode),read=()=>{const m=memory(gb);return {track:m.ram[syms._ce_music_track-0xc000],row:m.ram.readUInt16LE(syms._ce_music_row-0xc000),tests:m.ram.subarray(syms._ce_three_test-0xc000,syms._ce_three_test-0xc000+16),io:m.io};};
    try{
        for(let i=0;i<1200&&read().tests[0]!==0x73;i++)frames(gb,1);
        assert.equal(read().tests[0],0x73);for(let i=0;i<labels.length;i++)assert.equal(read().tests[i+1],1,labels[i]);
        // Observe only after play_row/load_bar completes, not at an arbitrary CPU cycle.
        const sample=()=>{gb.step_to(syms._ce_three_sample);const s=read();gb.clock();return s;};
        let state=sample();
        for(const t of tracks){
            assert.equal(state.track,t.id);const expected=t.bars.length*16*(t.speed+(t.speedHalf?.5:0)),seen=new Set(),chunks=[];let previous=state.row,elapsed=0,peak=0,power=0,samples=0;
            gb.audio_buffer_eager(true);
            for(;elapsed<expected+8;elapsed++){
                const s=state;if(s.row<previous)break;previous=s.row;seen.add(s.row);
                assert.equal(s.track,t.id);const bar=t.bars[s.row>>4],row=s.row&15;
                assert.equal(s.io[0x12]&240,bar.counterEnvelope[row],`${label} ${t.id} row ${s.row} CH1 envelope`);
                assert.equal(s.io[0x17]&240,bar.leadEnvelope[row],`${label} ${t.id} row ${s.row} CH2 envelope`);
                if(bar.bassLevel[row]){assert(s.io[0x1a]&128);assert.equal(s.io[0x1c]&96,bar.bassLevel[row]);}else assert.equal(s.io[0x1a]&128,0);
                assert.equal(s.io[0x25],255);state=sample();
                if(elapsed%16===15){const pcm=gb.audio_buffer_eager(true);for(const n of pcm){peak=Math.max(peak,Math.abs(n));power+=n*n;samples++;}if(mode===GameBoyMode.Cgb&&elapsed<480)chunks.push(Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength));}
            }
            assert.equal(seen.size,t.bars.length*16,'every row of the complete loop');assert(Math.abs(elapsed-expected)<=2);assert(peak>0);
            if(chunks.length){const pcm=Buffer.concat(chunks);for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(pcm.readInt16LE(i)*512,i);wav(path.join(out,t.key+'-apu.wav'),pcm,gb.audio_sampling_rate(),gb.audio_channels());}
            const result={mode:label,id:t.id,key:t.key,rows:seen.size,expectedFrames:expected,elapsedFrames:elapsed,rawPeak:peak,rawRms:Math.sqrt(power/samples),expression:true,loop:true,sfxContracts:labels.length};results.push(result);console.log(result);
            gb.key_press(PadKey.Right);state=sample();gb.key_lift(PadKey.Right);
        }
    }finally{gb.free();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({diagnostic:true,romSha256:crypto.createHash('sha256').update(rom).digest('hex'),labels,results},null,2));}
}
