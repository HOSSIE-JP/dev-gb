// Real production-ROM boss-select inputs. Follow each boss with Marisa's focus
// beam, observe all three modes and their moving positions, then the clear flow.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),results=[];fs.mkdirSync(out,{recursive:true});
for(const [mode,label]of [[GameBoyMode.Cgb,'CGB'],[GameBoyMode.Dmg,'DMG']])for(let stage=0;stage<7;stage++){
 const gb=boot(rom,mode),byte=n=>memory(gb).ram[s[n]-0xc000],until=(f,max=5000)=>{for(let i=0;i<max;i++){const t=settledTrace(gb,s._ce_trace);if(t&&f(t))return t;frames(gb,1);}throw Error('menu timeout');},tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 const phases=new Map();let cleared=false;
 try{
  until(t=>t.scene===0);for(let i=0;i<10;i++)tap(PadKey.B);if(stage){tap(PadKey.Down);for(let i=0;i<stage;i++)tap(PadKey.Right);}tap(PadKey.A);until(t=>t.scene===10);tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===7);until(t=>t.scene===1&&t.bossPhase===1);
  let prior=-1,lastTick=-1;gb.key_press(PadKey.B);
  for(let n=0;n<16000;n++){
   const t=settledTrace(gb,s._ce_trace),m=memory(gb),r=m.ram;
   if(t?.scene===1&&t.stage===stage&&t.tick!==lastTick){
    lastTick=t.tick;let boss;for(let i=0;i<39;i++){const at=s._ce_entities-0xc000+i*25;if(r[at]===2){boss={x:r.readInt16LE(at+12),y:r.readInt16LE(at+14),phase:r[at+4]};break;}}
    if(boss&&!byte('_ce_boss_invulnerable')&&boss.phase>0){
     let p=phases.get(boss.phase);if(!p){p={x:new Set(),y:new Set(),hp:new Set(),peak:0};phases.set(boss.phase,p);}
     p.x.add(boss.x);p.y.add(boss.y);p.hp.add(t.bossHp);p.peak=Math.max(p.peak,byte('_ce_bg_count'));
     if(boss.phase!==prior){
      capture(gb,path.join(out,`${label}-${stage+1}-mode${boss.phase}.png`));prior=boss.phase;
      if(boss.phase>=2&&byte('_ce_bombs')){gb.key_lift(PadKey.B);frames(gb,4);gb.key_press(PadKey.A);gb.key_press(PadKey.B);frames(gb,4);gb.key_lift(PadKey.A);}
     }
     const dx=boss.x+(boss.phase&1?80:-80)-t.x;for(const k of [PadKey.Left,PadKey.Right])gb.key_lift(k);if(Math.abs(dx)>24)gb.key_press(dx>0?PadKey.Right:PadKey.Left);
     if(t.lives<=2&&byte('_ce_bombs')&&!byte('_ce_respawn')&&!byte('_ce_bomb_left')){gb.key_lift(PadKey.B);frames(gb,4);gb.key_press(PadKey.A);gb.key_press(PadKey.B);frames(gb,4);gb.key_lift(PadKey.A);}
    }
   }
   if(t&&t.stage!==stage){cleared=true;break;}
   if(phases.size===3&&t?.scene===15){cleared=true;break;}
   if(t?.lives===0)break;
   frames(gb,1);
  }
  const detail=[...phases].map(([mode,p])=>({mode,x:p.x.size,y:p.y.size,hpChanges:p.hp.size,peak:p.peak}));
  const result={system:label,stage:stage+1,cleared,phases:detail};results.push(result);console.log(result);
  assert.equal(phases.size,3,'all modes reached');assert(detail.every(p=>p.x>12&&p.y>8&&p.hpChanges>2&&p.peak<=40),'moving modes, beam damage and bounded bullets');assert(cleared,'boss clear');
 }catch(e){capture(gb,path.join(out,`${label}-${stage+1}-failure.png`));throw e;}finally{gb.free();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
}
