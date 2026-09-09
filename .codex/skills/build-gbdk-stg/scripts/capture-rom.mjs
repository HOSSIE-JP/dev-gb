#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import crypto from 'node:crypto';
const [repoArg,romArg,workflowArg,inputArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node capture-rom.mjs REPO ROM.gb WORKFLOW.json INPUT.json NEW_OUTPUT_DIR');
const root=path.resolve(repoArg),out=path.resolve(outArg),rom=fs.readFileSync(romArg),sha=crypto.createHash('sha256').update(rom).digest('hex');
const gate=spawnSync(process.execPath,[path.resolve(path.dirname(fileURLToPath(import.meta.url)),'check-approval.cjs'),workflowArg,romArg],{encoding:'utf8'});if(gate.status!==0)throw Error('Approval check failed: '+gate.stderr);
const input=JSON.parse(fs.readFileSync(inputArg,'utf8'));const count=input.frameCount,warmup=input.warmupFrames??240;
if(!Number.isInteger(count)||count<1||count>36000||!Number.isInteger(warmup)||warmup<0||warmup>36000)throw Error('Invalid frame count');
if(JSON.parse(fs.readFileSync(path.join(root,'editor/node_modules/boytacean/package.json'))).version!=='0.13.2')throw Error('Revalidate PCM scaling for the installed emulator version');
if(input.mode!==undefined&&!['dmg','cgb'].includes(input.mode))throw Error('Invalid mode');
const {initSync,GameBoy,GameBoyMode,BootRom,PadKey}=await import(pathToFileURL(path.join(root,'editor/node_modules/boytacean/boytacean.js')));
const events=input.events??[],allowed=new Set(['Up','Down','Left','Right','A','B','Start','Select']);let previous=-1;
for(const e of events){if(!Number.isInteger(e.frame)||e.frame<0||e.frame>=count||e.frame<=previous||!Array.isArray(e.keys)||e.keys.some(k=>!allowed.has(k)))throw Error('Events must have ascending in-range frame and valid keys');previous=e.frame;}
if(fs.existsSync(out))throw Error('Output directory exists; use a new capture directory');
const ff=spawnSync('ffmpeg',['-version'],{encoding:'utf8'});if(ff.status!==0)throw Error('ffmpeg is required');
initSync({module:fs.readFileSync(path.join(root,'editor/node_modules/boytacean/boytacean_bg.wasm'))});const dmg=input.mode==='dmg',gb=new GameBoy(dmg?GameBoyMode.Dmg:GameBoyMode.Cgb);gb.set_boot_rom(dmg?BootRom.DmgBootix:BootRom.CgbBoytacean);gb.load_unsafe(true);gb.load_rom_wa(rom).free();
fs.mkdirSync(out,{recursive:true});const video=path.join(out,'frames.rgb'),audio=path.join(out,'audio.s16le'),v=fs.openSync(video,'wx'),a=fs.openSync(audio,'wx');let rate,channels,index=0,held=[];
try{for(let n=0;n<warmup;n++){gb.clocks_cycles(70224*gb.multiplier());gb.audio_buffer_eager(true);}rate=gb.audio_sampling_rate();channels=gb.audio_channels();
for(let n=0;n<count;n++){if(events[index]?.frame===n){for(const k of held)gb.key_lift(PadKey[k]);held=events[index++].keys;for(const k of held)gb.key_press(PadKey[k]);}gb.clocks_cycles(70224*gb.multiplier());fs.writeSync(v,gb.frame_buffer_eager());const pcm=gb.audio_buffer_eager(true),b=Buffer.alloc(pcm.length*2);for(let i=0;i<pcm.length;i++)b.writeInt16LE(Math.max(-32768,Math.min(32767,pcm[i]*512)),i*2);fs.writeSync(a,b);}}
finally{fs.closeSync(v);fs.closeSync(a);gb.free();}
const mp4=path.join(out,'gameplay.mp4');const encode=spawnSync('ffmpeg',['-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size','160x144','-framerate','59.7275','-i',video,'-f','s16le','-ar',String(rate),'-ac',String(channels),'-i',audio,'-vf','scale=640:576:flags=neighbor','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',mp4],{encoding:'utf8'});
if(encode.status!==0)throw Error('Encode failed; raw capture preserved: '+encode.stderr);
fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({romSha256:sha,mode:dmg?'dmg':'cgb',displayFrameCount:count,displayHz:59.7275,input,mp4Sha256:crypto.createHash('sha256').update(fs.readFileSync(mp4)).digest('hex'),note:'Normal controls only; no RAM patches. Gameplay clip, not a finished promotional edit.'},null,2)+'\n');fs.unlinkSync(video);fs.unlinkSync(audio);console.log(mp4);
