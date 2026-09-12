// Unmodified authored ROM: real menu selection, movement, stock/hold and VRAM restoration.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {PNG} from '../node_modules/pngjs/lib/png.js';
const file=path.resolve(process.argv[2]??'projects/touhou-kouma/build/Debug/touhou-kouma.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v10/player-bomb'),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map'));
fs.mkdirSync(out,{recursive:true});const results=[];
const screenshot=gb=>{const p=new PNG({width:160,height:144}),rgb=gb.frame_buffer_eager();for(let i=0;i<23040;i++){p.data.set(rgb.subarray(i*3,i*3+3),i*4);p.data[i*4+3]=255;}return PNG.sync.write(p);};
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu');
 const snapshot=()=>{let m=memory(gb);if(m.ram[syms._ce_scene-0xc000]===1){settledTrace(gb,syms._ce_trace);m=memory(gb);}const r=m.ram,byte=n=>r[syms[n]-0xc000],s=syms._ce_state-0xc000,t=syms._ce_trace-0xc000;return {m,r,byte,scene:byte('_ce_scene'),shown:r[t+22]?255:r[t+17],tick:r.readUInt16LE(s),x:r.readInt16LE(s+14),lives:r[s+19],bombs:byte('_ce_bombs'),left:byte('_ce_bomb_left')};};
 const until=(f,n=1200)=>{for(let i=0;i<n;i++){const s=snapshot();if(f(s))return s;frames(gb,1);}const s=snapshot();fs.writeFileSync(path.join(out,label+'-failure.png'),screenshot(gb));console.log({scene:s.scene,shown:s.shown,tick:s.tick,x:s.x,bombs:s.bombs,pause:s.byte('_ce_pause')});throw Error(label+' timeout '+f);};
 const tap=k=>{gb.key_press(k);frames(gb,2);gb.key_lift(k);frames(gb,2);};
 try{
  frames(gb,240);tap(PadKey.Start);until(s=>s.shown===10);frames(gb,2);
  fs.writeFileSync(path.join(out,label+'-select-default.png'),screenshot(gb));
  // Wrap left to the last choice and cancel; reopening must default to Reimu.
  tap(PadKey.Left);until(s=>s.byte('_ce_character')===1&&s.shown===10);tap(PadKey.B);until(s=>s.shown===0);
  tap(PadKey.Start);until(s=>s.shown===10&&s.byte('_ce_character')===0);
  if(character){tap(PadKey.Right);until(s=>s.shown===10&&s.byte('_ce_character')===1);}
  frames(gb,2);fs.writeFileSync(path.join(out,label+'-selected.png'),screenshot(gb));
  tap(PadKey.A);until(s=>s.shown===1);frames(gb,2);
  let start=snapshot();assert.equal(start.bombs,2);assert.equal(start.byte('_ce_player_speed'),character?52:36);
  const begin=start.tick;console.log(label,'movement start',begin,start.x);gb.key_press(PadKey.Right);const moved=until(s=>s.shown===1&&s.tick>=begin+10);gb.key_lift(PadKey.Right);
  const distance=moved.x-start.x,speed=character?52:36;
  assert.equal(distance%speed,0);assert.ok(distance>=(moved.tick-begin-1)*speed&&distance<=(moved.tick-begin)*speed,'movement per sampled update, allowing one already-latched input');
  // Publish an all-buttons-up update to arm the chord. The bomb must preserve OBJ tile bytes.
  const tick=moved.tick;until(s=>s.shown===1&&s.tick>tick);start=snapshot();
  const vram=s=>{const o=s.m.state.readUInt32LE(s.m.core+0xa4);return s.m.state.subarray(o+0x800,o+0x1000);};
  const spriteBefore=Buffer.from(vram(start));gb.key_press(PadKey.A);gb.key_press(PadKey.B);
  const activation=until(s=>s.scene===11&&s.left>0);let visible=0,blank=0,minLit=99999,maxLit=-1,framesSeen=0;
  for(let i=0;i<300;i++){
   const s=snapshot();if(s.scene!==11)break;
   if(s.left && s.left<=44 && s.left>=4){
    assert.equal(s.bombs,1);assert.equal(s.tick,activation.tick,'gameplay clock freezes during bomb');assert.deepEqual(vram(s),spriteBefore,'BG effect cannot overwrite OBJ art');
    assert.ok(s.m.oam.some((v,i)=>i%4===0&&v>0&&v<160),'player stays in OAM');
    if(s.m.io[0x40]&8)blank++;else visible++;
    const rgb=gb.frame_buffer_eager();let lit=0;for(let p=0;p<rgb.length;p+=3)if(rgb[p]>160)lit++;
    if(lit>maxLit){maxLit=lit;fs.writeFileSync(path.join(out,label+'-bomb.png'),screenshot(gb));}
    if(lit<minLit){minLit=lit;fs.writeFileSync(path.join(out,label+'-bomb-gap.png'),screenshot(gb));}
    framesSeen++;
   }
   frames(gb,1);
  }
  assert.ok(visible>=12&&blank>=12);assert.ok(maxLit>minLit+300,'large bitmap alternates with the transparent interval');
  until(s=>s.shown===1);frames(gb,70);assert.equal(snapshot().bombs,1,'holding A+B cannot spend again');
  gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);let now=snapshot().tick;until(s=>s.shown===1&&s.tick>now);
  gb.key_press(PadKey.A);gb.key_press(PadKey.B);until(s=>s.scene===11&&s.left>0);assert.equal(snapshot().bombs,0);until(s=>s.shown===1,700);
  gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);now=snapshot().tick;until(s=>s.shown===1&&s.tick>now);gb.key_press(PadKey.A);gb.key_press(PadKey.B);frames(gb,80);
  assert.equal(snapshot().bombs,0);assert.notEqual(snapshot().scene,11);assert.equal(snapshot().byte('_ce_character'),character);
  fs.writeFileSync(path.join(out,label+'-restored.png'),screenshot(gb));
  gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);const lives=snapshot().lives;
  // Ordinary input, no RAM writes: approach a live boss if the stage hazards miss.
  for(let n=0;n<8000&&snapshot().lives===lives;n++){
    const s=snapshot();for(const k of [PadKey.Up,PadKey.Left,PadKey.Right,PadKey.A])gb.key_lift(k);
    if(s.scene===5||s.scene===9){if(n%12<6)gb.key_press(PadKey.A);}
    else if(s.scene===1&&s.byte('_ce_battle_mode')){
      const e=syms._ce_entities-0xc000;let boss=-1;for(let i=0;i<39;i++)if(s.r[e+i*25]===2){boss=e+i*25;break;}
      if(boss>=0){const dx=s.r.readInt16LE(boss+12)-s.x;gb.key_press(PadKey.Up);if(dx>48)gb.key_press(PadKey.Right);if(dx < -48)gb.key_press(PadKey.Left);}
    }
    frames(gb,1);
  }
  assert.ok(snapshot().lives<lives,'normal collision loses a life');assert.equal(snapshot().bombs,2,'ROM replenishes stock for the next life');assert.equal(snapshot().byte('_ce_character'),character);
  results.push({label,character,speed:character?3.25:2.25,bombFramesObserved:framesSeen,visible,blank,bitmapLitPixels:maxLit,blankLitPixels:minLit,spriteTilesPreserved:true,stockSequence:[2,1,0,2],heldChordSingleActivation:true,zeroStockRejected:true,menuCancelAndWrap:true,refillAfterRealCollision:true});
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),fixture:false,results},null,2));console.table(results);
