// Current authored Touhou ROM's first BG bullet arena, both characters and hardware modes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const file=path.resolve(process.argv[2]??'projects/touhou-kouma/build/Debug/touhou-kouma.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v17/boss-bomb'),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),results=[];fs.mkdirSync(out,{recursive:true});
for(const mode of[GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of[0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu');
 const snap=()=>{let m=memory(gb);if(m.ram[syms._ce_scene-0xc000]===1){settledTrace(gb,syms._ce_trace);m=memory(gb);}const r=m.ram,b=n=>r[syms[n]-0xc000],s=syms._ce_state-0xc000,t=syms._ce_trace-0xc000;let boss;for(let i=0;i<39;i++){const p=syms._ce_entities-0xc000+i*25;if(r[p]===2){boss={hp:r[p+3],phase:r[p+4]};break;}}return{m,r,scene:b('_ce_scene'),ready:r[t]===67&&r[t+1]===69&&!r[t+22],character:b('_ce_character'),battle:b('_ce_battle_mode'),locked:b('_ce_boss_invulnerable'),bombs:b('_ce_bombs'),left:b('_ce_bomb_left'),bullets:b('_ce_bg_count'),tick:r.readUInt16LE(s),lives:r[s+19],boss};};
 const until=(f,n=1800)=>{for(let i=0;i<n;i++){const s=snap();if(f(s))return s;frames(gb,1);}throw Error(label+' timeout '+f+' '+JSON.stringify({...snap(),m:undefined,r:undefined}));};
 const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};
 const spriteBytes=s=>{const start=s.m.state.readUInt32LE(s.m.core+0xa4);return s.m.state.subarray(start,start+0x800);};
 try{
  until(s=>s.scene===0&&s.ready);tap(PadKey.Start);until(s=>s.scene===10&&s.ready);if(character){tap(PadKey.Right);until(s=>s.character===character&&s.ready);}tap(PadKey.A);until(s=>s.scene===1&&s.ready);
  let arena;
  for(let i=0;i<18000;i++){const s=snap();gb.key_lift(PadKey.A);if(s.scene===5){if(i%30<15)gb.key_press(PadKey.A);}if(s.scene===1&&s.ready&&s.battle===2&&!s.locked&&s.boss?.hp>30&&s.bullets>0){arena=s;break;}frames(gb,1);}
  assert.ok(arena,'normal route reaches the first boss with stock');gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);const before=until(s=>s.scene===1&&s.ready&&s.tick>arena.tick);assert.ok(before.bombs>0);assert.ok(before.bullets>0);const atlas=Buffer.from(spriteBytes(before));capture(gb,path.join(out,label+'-before.png'));
  gb.key_press(PadKey.A);gb.key_press(PadKey.B);const effect=until(s=>s.scene===11&&s.ready&&s.left<46&&s.left>0);assert.equal(effect.bombs,before.bombs-1);assert.equal(effect.bullets,0);assert.equal(effect.boss.hp,before.boss.hp-30);assert.equal(effect.boss.phase,before.boss.phase);const tick=effect.tick;let visible=0,blank=0;
  for(let n=0;n<100;n++){const s=snap();if(s.scene!==11)break;if(s.ready&&s.left>0){assert.equal(s.tick,tick);assert.deepEqual(spriteBytes(s),atlas,'BG effect preserves the low OBJ atlas used in the arena');assert.ok(s.m.oam.some((v,i)=>i%4===0&&v>0&&v<160),'actors remain visible');if(s.m.io[0x40]&8){if(!blank)capture(gb,path.join(out,label+'-gap.png'));blank++;}else{if(!visible)capture(gb,path.join(out,label+'-effect.png'));visible++;}}frames(gb,1);}
  assert.ok(visible>10&&blank>10,'both image and blank phases observed');gb.key_lift(PadKey.A);gb.key_lift(PadKey.B);const restored=until(s=>s.scene===1&&s.ready&&s.tick>tick+3);assert.equal(restored.battle,2);assert.equal(restored.character,character);assert.equal(restored.bombs,before.bombs-1);until(s=>s.scene===1&&s.ready&&s.bullets>0);capture(gb,path.join(out,label+'-restored.png'));
  results.push({label,fixture:false,memoryWrites:false,phase:before.boss.phase,hpBefore:before.boss.hp,hpAfter:effect.boss.hp,bulletsCleared:before.bullets,stockBefore:before.bombs,stockAfter:effect.bombs,spriteAtlasPreserved:true,visible,blank,bgArenaResumed:true});console.log(label+' boss bomb passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({...snap(),m:undefined,r:undefined}));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
