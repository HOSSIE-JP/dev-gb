import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
import {supportedModes} from './emulator.mjs';
import {capture,backgroundColors,backgroundPixels} from './presentation-qa.mjs';
const l=createRequire(import.meta.url)('../build/library.cjs'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),movie=l.readGame(process.cwd(),'touhou-kouma').startupMovie,results=[],count=movie.frames.length,expectedBlocks=Buffer.from(movie.pcm,"base64").length/16;
const pcmPages=[];for(let p=s._ce_movie_pcm;;p+=5){const bank=rom[p],address=rom.readUInt16LE(p+1),length=rom.readUInt16LE(p+3);if(!length)break;assert.ok(length<=16384&&length%16===0);pcmPages.push(rom.subarray(bank*16384+(address&16383),bank*16384+(address&16383)+length));}assert.deepEqual(Buffer.concat(pcmPages),Buffer.from(movie.pcm,'base64'),'All linked PCM banks match imported BGM');
function expected(frame,color){const f=movie.frames[frame],w=color?160:112,h=color?96:64,t=Buffer.from(color?f.cgb:f.dmg,'base64'),a=Buffer.from(f.attributes,'base64'),p=Buffer.from(f.palettes,'base64'),r=Array(23040).fill(color?0:3);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const tile=(y>>3)*(w>>3)+(x>>3),off=tile*16+(y%8)*2,n=((t[off]>>(7-x%8))&1)|(((t[off+1]>>(7-x%8))&1)<<1);r[(y+(color?24:40))*160+x+(color?0:24)]=color?p.readUInt16LE((a[tile]-1)*8+n*2):n;}return r;}
for(const [mode,label] of supportedModes(rom)){
 const gb=boot(rom,mode),seen=new Set(),audio=[];let started=false,elapsed=0,last,parity=0,movieFrames=0;
 const state=()=>{const {ram,io}=memory(gb),p=rom[0x143]===0xc0?0x4000:s._ce_entities-0xc000;return {scene:ram[s._ce_scene-0xc000],frame:ram.readUInt16LE(p+11),overruns:ram[p+13],blocks:ram.readUInt16LE(p+4),skipped:ram[p+14],io,music:ram.readUInt16LE(s._ce_music_row-0xc000)};};
 try{
  for(let n=0;n<count*6+1200;n++){frames(gb,1);const t=state();if(t.scene===15&&t.blocks>0){started=true;elapsed++;movieFrames=t.frame;seen.add(t.frame);audio.push(...gb.audio_buffer_eager(true));if(last?.frame===t.frame&&!seen.has('checked'+t.frame)){assert.deepEqual(mode===GameBoyMode.Cgb?backgroundColors(gb):backgroundPixels(gb),expected(t.frame,mode===GameBoyMode.Cgb));if([2,99,199,255,256,299,count-1].includes(t.frame))capture(gb,path.join(out,`${label}-${t.frame}.png`));parity++;seen.add('checked'+t.frame);}last=t;}else{gb.audio_buffer_eager(true);if(started&&t.scene===0)break;}}
  assert.ok(started);assert.equal(movieFrames,count-1);assert.equal(last.overruns,0,'six VBlanks per frame');assert.equal(parity,count);assert.ok(elapsed>=count*6&&elapsed<=count*6+5,`movie duration ${elapsed}`);assert.ok(last.blocks>=expectedBlocks-6&&last.blocks<=expectedBlocks,`PCM blocks ${last.blocks}`);
  assert.ok(new Set(audio).size>=8,'wave channel produces changing 4bit audio: '+new Set(audio).size+' levels / '+audio.length+' samples');
  const raw=Buffer.alloc(audio.length*2);audio.forEach((v,i)=>raw.writeInt16LE(v,i*2));fs.writeFileSync(path.join(out,label+'-audio.s16le'),raw);
  frames(gb,120);const before=state().music;frames(gb,120);assert.notEqual(state().music,before,'title BGM resumes');assert.equal(state().io[7]&4,0,'timer disabled after movie');assert.equal(state().io[0x40]&0x50,0x40,'game tile and Window mode restored');
  gb.key_press(PadKey.Start);frames(gb,60);gb.key_lift(PadKey.Start);assert.equal(state().scene,10,'normal character select');
  results.push({mode:label,displayVBlanks:elapsed,frames:count,overruns:last.overruns,pcmBlocks:last.blocks,pixelParity:parity,titleMusic:true,normalStart:true,audioRate:gb.audio_sampling_rate(),audioChannels:gb.audio_channels()});
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({state:state(),last,elapsed,seen:[...seen]},null,2));throw e;}finally{gb.free();}
 for(const target of [...new Set([-1,0,Math.floor(count/2),...(count>256?[255,256]:[]),count-1])]){
  const skip=boot(rom,mode);try{let found=false;for(let n=0;n<count*6+1200;n++){frames(skip,1);const r=memory(skip).ram,p=rom[0x143]===0xc0?0x4000:s._ce_entities-0xc000;if(target<0?r[s._ce_scene-0xc000]===12:(r[s._ce_scene-0xc000]===15&&r.readUInt16LE(p+4)>0&&r.readUInt16LE(p+11)>=target)){found=true;break;}}assert.ok(found);skip.key_press(PadKey.A);frames(skip,100);assert.equal(memory(skip).ram[s._ce_scene-0xc000],0,'held skip stays on title');assert.equal(memory(skip).io[7]&4,0);assert.equal(memory(skip).io[0x40]&0x50,0x40);skip.key_lift(PadKey.A);frames(skip,2);skip.key_press(PadKey.Start);frames(skip,60);assert.equal(memory(skip).ram[s._ce_scene-0xc000],10);}finally{skip.free();}
 }
 console.log(label,'movie and skip routes passed');
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
