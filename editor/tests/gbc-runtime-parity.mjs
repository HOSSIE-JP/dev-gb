// Compare canonical gameplay at logical update boundaries, not wall-clock input.
// node editor/tests/gbc-runtime-parity.mjs OLD.gb NEW.gb OUT [road|boss] [character] [stage] [updates]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
const [oldFile,newFile,out,route='road',character='1',stage='6',updates='1200']=process.argv.slice(2);
fs.mkdirSync(out,{recursive:true});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function open(file){
 const rom=fs.readFileSync(file),gb=boot(rom,GameBoyMode.Cgb),s=symbols(file.replace(/\.gb$/,'.map'));
 const byte=n=>memory(gb).ram[s[n]-0xc000];
 const until=(f,max=16000)=>{for(let i=0;i<max;i++){if(f())return;frames(gb,1);}throw Error('menu timeout '+byte('_ce_scene'));};
 const tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 if(route==='fixture'){
  gb.step_to(s._ce_step);
  return {gb,s,file,romHash:hash(rom),rows:[],states:crypto.createHash('sha256'),pixels:crypto.createHash('sha256')};
 }
 until(()=>{const m=memory(gb).ram,p=s._ce_trace-0xc000;return byte('_ce_scene')===0&&!byte('_ce_fade_level')&&!m[p+22]&&m.toString('ascii',p,p+2)==='CE';});
 if(route==='boss')for(let i=0;i<10;i++)tap(PadKey.B);
 if(+stage){tap(PadKey.Down);for(let i=0;i<+stage;i++)tap(PadKey.Right);}
 tap(PadKey.A);until(()=>byte('_ce_scene')===10&&!byte('_ce_fade_level')&&!memory(gb).ram[s._ce_trace-0xc000+22]);
 if(+character)tap(PadKey.Right);
 gb.key_press(PadKey.A);
 let last;const ring=[];
 try{for(let n=0;n<5000000;n++){const q=gb.registers();last={pc:q.pc,sp:q.sp,a:q.a,h:q.h,l:q.l,n};q.free();ring.push(last);if(ring.length>32)ring.shift();if(last.pc===s._ce_step)break;gb.clock();}}
 catch(e){console.error(file,ring);throw e;}
 return {gb,s,file,romHash:hash(rom),rows:[],states:crypto.createHash('sha256'),pixels:crypto.createHash('sha256')};
}
function snapshot(r){
 const {gb,s}=r,m=memory(gb),ram=m.ram,entities=[];
 const byte=n=>ram[s[n]-0xc000];
 for(let i=0;i<byte('_ce_used');i++){
  const p=(s._ce_entity_refs?ram.readUInt16LE(s._ce_entity_refs-0xc000+i*2):s._ce_entities+i*25)-0xc000,k=ram[p];
  if(!k)continue;
  const shot=k===3||k===4;
  entities.push([i,...ram.subarray(p,p+6),...(shot?['x','y','vx','vy','age','lifetime'].map(n=>ram.readUInt16LE(s['_ce_shot_'+n]-0xc000+i*2)):Array.from(ram.subarray(p+6,p+25))),shot?(s._ce_shot_damage?ram[s._ce_shot_damage-0xc000+i]:ram[p+24]):0]);
 }
 const bg=[];
 if(byte('_ce_battle_mode')>=2){
  const offset=s._ce_entity_refs?0x2000:0;
  for(let i=0;i<64;i++){
   const read=n=>ram.readUInt16LE(offset+s['_ce_bg_'+n]-(offset?0xd000:0xc000)+i*2);
   if(read('life'))bg.push([i,...['x','y','vx','vy','life'].map(read)]);
  }
 }
 const state={state:Array.from(ram.subarray(s._ce_state-0xc000,s._ce_state-0xc000+25)),entities,bg,
  flags:['_ce_bombs','_ce_bomb_left','_ce_bomb_image','_ce_battle_mode','_ce_transition_state','_ce_boss_invulnerable','_ce_used','_ce_pool_oam'].map(byte)};
 const offset=m.state.readUInt32LE(m.core+0xa4),vram=m.state.subarray(offset,offset+16384),pixels=Buffer.alloc(160*144),io=m.io;
 for(let y=0;y<144;y++)for(let x=0;x<160;x++){
  const win=(io[0x40]&32)&&x>=io[0x4b]-7&&y>=io[0x4a],sx=win?x-(io[0x4b]-7):(x+io[0x43])&255,sy=win?y-io[0x4a]:(y+io[0x42])&255;
  const map=(io[0x40]&(win?64:8))?0x1c00:0x1800,cell=map+(sy>>3)*32+(sx>>3),tile=vram[cell],attr=vram[8192+cell];
  const yy=(attr&64)?7-(sy&7):sy&7,xx=(attr&32)?sx&7:7-(sx&7);
  const addr=(io[0x40]&16?tile*16:0x1000+(tile<128?tile:tile-256)*16)+yy*2+(attr&8?8192:0);
  pixels[y*160+x]=((vram[addr]>>xx)&1)|(((vram[addr+1]>>xx)&1)<<1)|((attr&7)<<2)|(attr&128);
 }
 const spriteData=[];for(let i=0;i<40;i++){const a=m.oam.subarray(i*4,i*4+4);if(!a[0]||a[0]>=160||!a[1]||a[1]>=168)continue;const begin=(a[2]&((io[0x40]&4)?254:255))*16+(a[3]&8?8192:0);spriteData.push(...vram.subarray(begin,begin+((io[0x40]&4)?32:16)));}
 const palettes=[0xc4,0xcc].map(p=>m.state.subarray(m.state.readUInt32LE(m.core+p),m.state.readUInt32LE(m.core+p)+64));
 return {state,oam:Buffer.from(m.oam),pixels:Buffer.concat([pixels,Buffer.from(spriteData),...palettes])};
}
function advance(r){
 const {gb,s}=r,frame=gb.ppu_frame(),m=memory(gb),reg=gb.registers(),sp=reg.sp,ret=m.ram.readUInt16LE(sp-0xc000);reg.free();let cpu=0;
 for(let i=0;i<200;i++){cpu+=gb.clock()+gb.step_to(ret);const reg=gb.registers(),done=reg.sp===sp+2;reg.free();if(done)break;if(i===199)throw Error('return');}
 const elapsed=cpu+gb.clock()+gb.step_to(s._ce_step);
 const now=memory(gb).ram;
 r.rows.push({tick:now.readUInt16LE(s._ce_state-0xc000),cpu,elapsed,frameGap:gb.ppu_frame()-frame,bullets:now[s._ce_bg_count-0xc000]});
}
const runs=[open(oldFile),open(newFile)];let mismatches=[],pixelMismatches=0,oamMismatches=0,firstPixelMismatch;
try{
 for(let n=0;n<+updates;n++){
  const a=snapshot(runs[0]),b=snapshot(runs[1]);
  if(JSON.stringify(a.state)!==JSON.stringify(b.state)){mismatches.push({n,old:a.state,new:b.state});break;}
  if(n&& !a.oam.equals(b.oam))oamMismatches++;
  if(n&& !a.pixels.equals(b.pixels)){pixelMismatches++;if(firstPixelMismatch===undefined){firstPixelMismatch=n;fs.writeFileSync(path.join(out,"old-pixels.bin"),a.pixels);fs.writeFileSync(path.join(out,"new-pixels.bin"),b.pixels);}}
  for(const [i,v] of [a,b].entries()){runs[i].states.update(JSON.stringify(v.state));runs[i].pixels.update(v.pixels);advance(runs[i]);}
 }
 const summary=runs.map(r=>{
  fs.writeFileSync(path.join(out,r===runs[0]?'old-ticks.json':'new-ticks.json'),JSON.stringify(r.rows));
  const normal=r.rows.filter(x=>x.elapsed<140448*12),costs=normal.map(x=>x.cpu).sort((a,b)=>a-b);
  return {file:r.file,romHash:r.romHash,stateHash:r.states.digest('hex'),pixelHash:r.pixels.digest('hex'),updates:r.rows.length,normal:normal.length,transitions:r.rows.length-normal.length,peak:Math.max(...normal.map(x=>x.bullets)),cpuMean:costs.reduce((a,b)=>a+b,0)/costs.length,cpuP95:costs[Math.floor(costs.length*.95)],cpuMax:costs.at(-1),updatesPerSecond:normal.length*8388608/normal.reduce((n,x)=>n+x.elapsed,0),logicalBoundaryFrameGaps:normal.filter(x=>x.frameGap!==1).length,displayFrames:normal.reduce((n,x)=>n+x.frameGap,0)};
 });
 const input=Buffer.alloc(+updates,1);
 if(route==='fixture'&&fs.readFileSync(path.join(path.dirname(newFile),'mainloop.c'),'utf8').includes('ce_qa_updates==200u')){if(input.length>199)input[199]=0;if(input.length>200)input[200]=3;}
 const report={route,character:+character,stage:+stage,inputHash:hash(input),summary,mismatches,oamMismatches,pixelMismatches,firstPixelMismatch};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 assert.equal(mismatches.length,0,'canonical logical state parity');
 assert.equal(oamMismatches,0,'published OAM parity');
 assert.equal(pixelMismatches,0,'VRAM-decoded BG, OBJ tile and palette parity');
}finally{for(const r of runs)r.gb.free();}
