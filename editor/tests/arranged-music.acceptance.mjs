// Real banked SM83 playback, all bars and loop boundaries, with APU capture.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v13/music'),work=path.join(out,'fixture');
fs.mkdirSync(work,{recursive:true});for(const f of ['music.c','music.h'])fs.copyFileSync(path.join(root,'engine/caravan',f),path.join(work,f));
fs.copyFileSync(path.join(root,'editor/tests/fixtures/arranged_music_harness.c'),path.join(work,'main.c'));
const sources=lib.generateMusic(root,work),r=spawnSync(path.join(root,'.tools/gbdk/bin/lcc.exe'),['-Wm-yc','-Wl-yt0x19','-Wm-yoA','-autobank','-Wb-ext=.rel','-Wl-m','-Wl-j','-debug','-I.','-o','music.gb','main.c','music.c',...sources],{cwd:work,encoding:'utf8'});
assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/warning/i);
const tracks=JSON.parse(fs.readFileSync(path.join(root,'engine/caravan/assets-src/kouma-score.json'))).tracks,syms=symbols(path.join(work,'music.map')),rom=fs.readFileSync(path.join(work,'music.gb')),results=[];
function wav(file,pcm,rate,channels){const b=Buffer.alloc(44);b.write('RIFF');b.writeUInt32LE(pcm.length+36,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*channels*2,28);b.writeUInt16LE(channels*2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);fs.writeFileSync(file,Buffer.concat([b,pcm]));}
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
 const gb=boot(rom,mode),label=mode===GameBoyMode.Dmg?'DMG':'CGB';
 const read=()=>{const m=memory(gb);return {track:m.ram[syms._ce_music_track-0xc000],row:m.ram.readUInt16LE(syms._ce_music_row-0xc000),io:m.io};};
 for(let i=0;i<600&&read().track!==16;i++)frames(gb,1);
 assert.equal(read().track,16,'fixture boots');
 try{for(const t of tracks){
  assert.equal(read().track,t.id);const seen=new Set(),sections=new Set(),chunks=[];let loop=false,ended=false,last=read().row,peak=0,sum=0,samples=0;
  gb.audio_buffer_eager(true);
  for(let f=0;f<t.bars.length*16*t.speed+32;f++){
   const s=read();assert.equal(s.io[0x12],0x62);assert.equal(s.io[0x21],0x53);assert.equal(s.io[0x22],0x35);
   if(!s.track){assert.equal(t.loop,false);ended=true;break;}
   assert.equal(s.track,t.id);assert.ok(s.row<t.bars.length*16);seen.add(s.row>>4);sections.add(t.bars[s.row>>4].section);
   if(s.row<last){loop=true;break;}last=s.row;frames(gb,1);
   if(f%16===15){const pcm=gb.audio_buffer_eager(true);for(const n of pcm){peak=Math.max(peak,Math.abs(n));sum+=n*n;samples++;}if(mode===GameBoyMode.Cgb&&[16,18,34].includes(t.id))chunks.push(Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength));}
  }
  assert.equal(seen.size,t.bars.length,'every bar including rows above 255 plays');assert.equal(loop,t.loop);assert.equal(ended,!t.loop);assert.ok(peak>0,'audible PCM');
  if(chunks.length){const pcm=Buffer.concat(chunks),gain=28000/peak;for(let p=0;p<pcm.length;p+=2)pcm.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(pcm.readInt16LE(p)*gain))),p);wav(path.join(out,t.id+'-'+t.key+'.wav'),pcm,gb.audio_sampling_rate(),gb.audio_channels());}
  results.push({mode:label,id:t.id,title:t.title,bars:seen.size,sections:[...sections],loop,oneShot:ended,seconds:t.bars.length*16*t.speed/59.7275,rawPeak:peak,rawRms:Math.sqrt(sum/samples)});
  gb.key_press(PadKey.Right);frames(gb,1);gb.key_lift(PadKey.Right);frames(gb,1);
 }}finally{gb.free();}
 console.log(label+': all 19 tracks, banks, long rows, loops, SFX channels and PCM verified');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({fixture:'Music-only GBDK ROM; real joypad selection and VBlank playback. WAV listening copies normalized; raw amplitude is reported separately.',results},null,2));
