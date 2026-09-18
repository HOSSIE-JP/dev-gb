// Actual GBDK sound/graze code: arbitration, repeated near misses and PCM.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {boot,memory,symbols,GameBoyMode} from './emulator.mjs';
const root=path.resolve(import.meta.dirname,'../..'),out=path.resolve(process.argv[2]??'.cache/kouma-v39/sound'),work=path.join(out,'fixture');
fs.mkdirSync(work,{recursive:true});for(const n of ['caravan.h','sound.c','graze.c'])fs.copyFileSync(path.join(root,'engine/caravan',n),path.join(work,n));
fs.copyFileSync(path.join(root,'editor/tests/fixtures/graze_sound_harness.c'),path.join(work,'main.c'));
const r=spawnSync(path.join(root,'.tools/gbdk/bin/lcc.exe'),['-Wm-yc','-Wl-yt0x19','-Wm-yoA','-autobank','-Wb-ext=.rel','-Wl-m','-Wl-j','-debug','-I.','-o','sound.gb','main.c','sound.c','graze.c'],{cwd:work,encoding:'utf8'});
assert.equal(r.status,0,r.stdout+r.stderr);assert.doesNotMatch(r.stdout+r.stderr,/warning/i);
const rom=fs.readFileSync(path.join(work,'sound.gb')),s=symbols(path.join(work,'sound.map')),results=[];
for(const [mode,label]of [[GameBoyMode.Dmg,'DMG'],[GameBoyMode.Cgb,'CGB']]){
 const gb=boot(rom,mode),chunks=[],onsets=[];let prior=false;
 gb.set_audio_ch1_enabled(false);gb.set_audio_ch2_enabled(false);gb.set_audio_ch3_enabled(false);
 const sample=(c,i)=>{
  // This small ROM places the marker inside the CGB bootstrap's address
  // range. Ignore bootstrap PC matches until the ROM sets its own cookie.
  let m;for(let guard=0;guard<256;guard++){gb.step_to(s._ce_bench_sample);m=memory(gb);if(m.ram[s._ce_bench_ready-0xc000]===0xa7)break;gb.clock();}
  assert.equal(m.ram[s._ce_bench_ready-0xc000],0xa7);
  const r=m.ram,byte=n=>r[s[n]-0xc000];
  assert.equal(byte('_ce_bench_case'),c);assert.equal(byte('_ce_bench_sample_id'),i);
  assert.equal(m.io[0x17],0x72);assert.equal(m.io[0x1a]&128,128);assert.equal(m.io[0x1c]&0x60,0x60);
  const v={io:m.io,flash:byte('_ce_graze_flash'),score:r.readUInt16LE(s._ce_state-0xc000+6),spell:byte('_ce_spell_sound_left')};gb.clock();return v;
 };
 try{
  for(let i=0;i<36;i++){
   const v=sample(0,i),pcm=gb.audio_buffer_eager(true);if(i)chunks.push(Buffer.from(pcm.buffer,pcm.byteOffset,pcm.byteLength));
   assert.equal(v.flash,12,'visual flash never ends during continuous fresh grazes');assert.equal(v.score,i+1);
   // BESS exposes the emulator's live envelope volume, which decays even
   // when the program has not rewritten NR12/NR42.
   assert.equal(v.io[0x12]&15,2,'shot envelope preserved');assert(v.io[0x12]<=0x42);
   assert.equal(v.io[0x21]&15,1);assert(v.io[0x21]<=0x41);assert.equal(v.io[0x22],0x18);assert(v.io[0x23]&64,'hardware length limiter');
   const active=!!(v.io[0x26]&8);if(active&&!prior)onsets.push(i);prior=active;
  }
  assert.deepEqual(onsets,[0,12,24],'fresh grazes repeat every 12 VBlanks despite continuous flash');
  for(let c=1;c<=3;c++){
   const volume=[0,0x73,0xf4,0xa1][c];for(let i=0;i<3;i++)assert.equal(sample(c,i).io[0x21],volume,'higher sound preserved; no delayed low-priority cue');
   assert.equal(sample(c,3).io[0x21],0x41,'new graze accepted once noise owner releases');
  }
  for(let c=4;c<=6;c++){assert.equal(sample(c,0).io[0x21],0x41);assert.equal(sample(c,1).io[0x21],[0x73,0xf4,0xa1][c-4],'higher priority immediately preempts graze');}
  let v=sample(7,0);assert.equal(v.spell,72);assert.equal(v.io[0x21],0x23);
  v=sample(8,0);assert.equal(v.spell,72);assert.equal(v.io[0x12],0xa0);assert.equal(v.io[0x21],0xc0);
  assert.equal(sample(9,0).io[0x21],0,'no new graze means no cue');
  const pcm=Buffer.concat(chunks);let peak=0;for(let i=0;i<pcm.length;i+=2)peak=Math.max(peak,Math.abs(pcm.readInt16LE(i)));assert(peak>0,'isolated CH4 emits audible PCM');
  const rawPeak=peak;for(let i=0;i<pcm.length;i+=2)pcm.writeInt16LE(pcm.readInt16LE(i)*Math.floor(24000/peak),i);
  const rate=gb.audio_sampling_rate(),channels=gb.audio_channels(),h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(pcm.length+36,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(channels,22);h.writeUInt32LE(rate,24);h.writeUInt32LE(rate*channels*2,28);h.writeUInt16LE(channels*2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);
  fs.writeFileSync(path.join(out,label+'-graze.wav'),Buffer.concat([h,pcm]));
  results.push({mode:label,onsets,rawPeak,shotPreserved:true,bgmPreserved:true,higherPriority:true,noQueuedCue:true,continuousFlash:true});console.log(results.at(-1));
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({diagnostic:true,rom:path.join(work,'sound.gb'),results},null,2));
