// Observe the production exhibition route; never change RAM, HP or event times.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {boot,frames,memory,symbols,trace,GameBoyMode} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),results=[];fs.mkdirSync(out,{recursive:true});
for(const [label,mode]of (rom[0x143]===0xC0?[['CGB',GameBoyMode.Cgb]]:[['DMG',GameBoyMode.Dmg],['CGB',GameBoyMode.Cgb]])){
 const gb=boot(rom,mode);let found=false;
 try{
  for(let f=0;f<30000;f++){frames(gb,1);const m=memory(gb),b=n=>m.ram[s[n]-0xc000];if(b('_ce_scene')===1&&b('_ce_battle_mode')===2&&!b('_ce_fade_level')&&b('_ce_bg_count')>=16){found=true;break;}}
  assert.ok(found,'production demo reaches active boss barrage');gb.step_to(s._ce_step);
  const gaps=[];let previous,cycles=0,last=0,peakShots=0,transitions=0,stage;
  for(let n=0;n<300;n++){
   cycles+=gb.clock();cycles+=gb.step_to(s._ce_step);const t=trace(gb,s._ce_trace),m=memory(gb),phase=m.ram[s._ce_trace-0xc000+20];
   if(!t||t.scene!==1||m.ram[s._ce_battle_mode-0xc000]!==2)break;
   if(previous){if(t.tick!==previous.tick+1)break;if(phase===previous.phase)gaps.push((cycles-last)/(70224*gb.multiplier()));else transitions++;}
   peakShots=Math.max(peakShots,m.ram[s._ce_bg_count-0xc000]);stage=t.stage;previous={tick:t.tick,phase};last=cycles;
   if(n===120)capture(gb,path.join(out,label+'.png'));
  }
  assert.ok(gaps.length>=100);const sorted=[...gaps].sort((a,b)=>a-b),mean=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  results.push({mode:label,stage,samples:gaps.length,peakShots,cutinGapsExcluded:transitions,meanFrameBudgets:mean,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),updatesPerSecond:59.7275/mean});
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),production:true,results},null,2));console.log(results);
