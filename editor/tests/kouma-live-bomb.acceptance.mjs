// Production ROM, ordinary menu/game inputs, no memory writes or shortened stage.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const file=path.resolve(process.argv[2]??'projects/touhou-kouma/build/Debug/touhou-kouma.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v18/live-bomb'),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];fs.mkdirSync(out,{recursive:true});
for(const arena of[false,true])for(const mode of[GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of[0,1]){
 const gb=boot(rom,mode),label=(arena?'boss':'road')+'-'+(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu');
 const snap=()=>{let m=memory(gb);if(m.ram[syms._ce_scene-0xc000]===1){settledTrace(gb,syms._ce_trace);m=memory(gb);}const r=m.ram,b=n=>r[syms[n]-0xc000],s=syms._ce_state-0xc000,t=syms._ce_trace-0xc000;let boss,shots=0;for(let i=0;i<39;i++){const p=syms._ce_entities-0xc000+i*25;if(r[p]===2)boss={hp:r[p+3],phase:r[p+4],x:r.readInt16LE(p+12),y:r.readInt16LE(p+14)};if(r[p]===3)++shots;}return{m,scene:b('_ce_scene'),ready:r[t]===67&&r[t+1]===69&&!r[t+22],character:b('_ce_character'),battle:b('_ce_battle_mode'),locked:b('_ce_boss_invulnerable'),bombs:b('_ce_bombs'),left:b('_ce_bomb_left'),image:b('_ce_bomb_image'),bullets:b('_ce_bg_count'),tick:r.readUInt16LE(s),x:r.readInt16LE(s+14),y:r.readInt16LE(s+16),camera:r.readUInt16LE(s+4),lives:r[s+19],boss,shots};};
 const clean=s=>({...s,m:undefined});const until=(f,n=1800)=>{for(let i=0;i<n;i++){const s=snap();if(f(s))return s;frames(gb,1);}throw Error(label+' timeout '+f+' '+JSON.stringify(clean(snap())));};
 const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};
 const atlas=s=>{const start=s.m.state.readUInt32LE(s.m.core+0xa4)+(arena?0:0x800);return s.m.state.subarray(start,start+0x800);};
 try{
  until(s=>s.scene===0&&s.ready);tap(PadKey.Start);until(s=>s.scene===10&&s.ready);if(character){tap(PadKey.Right);until(s=>s.character===character&&s.ready);}tap(PadKey.A);until(s=>s.scene===1&&s.ready);
  if(arena){let reached=false;for(let i=0;i<18000;i++){const s=snap();gb.key_lift(PadKey.A);if(s.scene===5&&i%30<15)gb.key_press(PadKey.A);if(s.scene===1&&s.ready&&s.battle===2&&!s.locked&&s.boss?.hp===100&&s.bullets>0){reached=true;break;}frames(gb,1);}assert.ok(reached);}
  gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);let s=snap();const before=until(n=>n.scene===1&&n.ready&&n.tick>s.tick);assert.ok(before.bombs);const art=Buffer.from(atlas(before));capture(gb,path.join(out,label+'-before.png'));
  gb.key_press(PadKey.A);gb.key_press(PadKey.B);const effect=until(n=>n.ready&&n.image&&n.left>0);assert.equal(effect.scene,1);assert.equal(effect.bombs,before.bombs-1);assert.equal(effect.bullets,0);if(arena)assert.equal(effect.boss.hp,70);
  gb.key_press(PadKey.Right);gb.key_press(PadKey.Up);const ticks=new Set(),positions=new Set(),bossPositions=new Set();let visible=0,blank=0,shots=0,beamFollows=0,maxLit=0,minLit=23040;
  for(let n=0;n<350;n++){
   const q=snap();if(!q.image)break;
   if(q.ready&&q.left>0){assert.equal(q.scene,1);assert.equal(q.bombs,before.bombs-1);assert.equal(q.lives,effect.lives);assert.equal(q.bullets,0);assert.deepEqual(atlas(q),art,'bomb preserves OBJ atlas');assert.ok(q.m.oam.some((v,i)=>i%4===0&&v>0&&v<160));ticks.add(q.tick);positions.add(q.x+','+q.y);if(q.boss)bossPositions.add(q.boss.x+','+q.boss.y);shots=Math.max(shots,q.shots);
    if(q.m.io[0x40]&8){if(!blank)capture(gb,path.join(out,label+'-gap.png'));blank++;}else{if(!visible)capture(gb,path.join(out,label+'-effect.png'));visible++;}
    if(character){assert.equal(q.m.io[0x43],(80-Math.trunc(q.x/16))&255);assert.equal(q.m.io[0x42],(120-Math.trunc(q.y/16))&255);beamFollows++;}
    const rgb=gb.frame_buffer_eager();let lit=0;for(let p=0;p<rgb.length;p+=3)if(rgb[p]>160)++lit;
    if(lit>maxLit){maxLit=lit;capture(gb,path.join(out,label+'-art.png'));}minLit=Math.min(minLit,lit);
   }
   if(n===15){gb.key_lift(PadKey.Right);gb.key_lift(PadKey.Up);gb.key_press(PadKey.Left);}
   frames(gb,1);
  }
  gb.key_lift(PadKey.Right);gb.key_lift(PadKey.Up);gb.key_lift(PadKey.Left);
  assert.ok(ticks.size>15);assert.ok(positions.size>10);assert.ok(shots>0);assert.ok(visible>5&&blank>5);assert.ok(maxLit-minLit>300,'actual framebuffer contains the large flashing bitmap');if(arena)assert.ok(bossPositions.size>5);
  const restored=until(n=>n.ready&&!n.image&&n.scene===1&&n.tick>effect.tick+48);assert.equal(restored.battle,arena?2:0);assert.equal(restored.bombs,before.bombs-1);assert.equal(restored.character,character);capture(gb,path.join(out,label+'-restored.png'));
  if(arena)until(n=>n.ready&&n.bullets>0);
  frames(gb,60);assert.equal(snap().bombs,before.bombs-1,'held chord spends only one stock');
  results.push({label,fixture:false,memoryWrites:false,before:clean(before),effect:clean(effect),restored:clean(restored),observedUpdates:ticks.size,positions:positions.size,bossPositions:bossPositions.size,peakFriendlyShots:shots,visible,blank,beamFollows,maxLit,minLit});console.log(label+' passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify(clean(snap()),null,2));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
