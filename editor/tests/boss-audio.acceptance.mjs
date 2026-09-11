// Record actual APU output during the cut-in. Only emulator mixer channels 2/3 are muted;
// game ROM and RAM are untouched. PCM energy, not NR52, proves the audible decay.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const syms=symbols(file.replace(/\.gb$/,'.map')),rom=fs.readFileSync(file),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]){
 const gb=boot(rom,mode),label=mode===GameBoyMode.Dmg?'DMG':'CGB';
 try{
  frames(gb,240);gb.key_press(PadKey.Start);frames(gb,2);gb.key_lift(PadKey.Start);
  let found=false;
  for(let n=0;n<2000;n++){const m=memory(gb).ram;if(m[syms._ce_scene-0xc000]===7&&m.readUInt16LE(syms._ce_intro_left-0xc000)>60){found=true;break;}gb.key_press(PadKey.A);frames(gb,1);}
  assert.ok(found,'cut-in starts');gb.set_audio_ch2_enabled(false);gb.set_audio_ch3_enabled(false);gb.audio_buffer_eager(true);
  const pcm=[],rms=[];
  for(let n=0;n<70;n++){
   frames(gb,1);const a=gb.audio_buffer_eager(true);pcm.push(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
   const mean=a.reduce((s,v)=>s+v,0)/a.length;rms.push(Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length));
  }
  fs.writeFileSync(path.join(out,label+'-rms.json'),JSON.stringify(rms));
  const peakRms=Math.max(...rms.slice(0,12));assert.ok(peakRms>0);
  assert.ok(rms.slice(25,35).every(v=>v>peakRms*.1),'announcement remains audible beyond half a second');
  assert.ok(Math.max(...rms.slice(62))<peakRms*.05,'hardware envelopes decay before battle resumes');
  const data=Buffer.concat(pcm),rate=gb.audio_sampling_rate(),channels=gb.audio_channels(),head=Buffer.alloc(44);
  head.write('RIFF');head.writeUInt32LE(data.length+36,4);head.write('WAVEfmt ',8);head.writeUInt32LE(16,16);head.writeUInt16LE(1,20);head.writeUInt16LE(channels,22);head.writeUInt32LE(rate,24);head.writeUInt32LE(rate*channels*2,28);head.writeUInt16LE(channels*2,32);head.writeUInt16LE(16,34);head.write('data',36);head.writeUInt32LE(data.length,40);
  // Boytacean returns low-amplitude mixer integers. Normalize only the listening copy.
  let peakSample=0;for(let i=0;i<data.length;i+=2)peakSample=Math.max(peakSample,Math.abs(data.readInt16LE(i)));
  const gain=28000/peakSample;for(let i=0;i<data.length;i+=2)data.writeInt16LE(Math.round(data.readInt16LE(i)*gain),i);
  fs.writeFileSync(path.join(out,label+'-phase-announcement.wav'),Buffer.concat([head,data]));
  results.push({mode:label,rom:file,rate,channels,seconds:data.length/(rate*channels*2),listeningGain:gain,lastAudibleFrame:rms.findLastIndex(v=>v>peakRms*.05),rms});
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(results.map(({rms,...r})=>r));
