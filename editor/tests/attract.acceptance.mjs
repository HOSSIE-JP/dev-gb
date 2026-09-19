// Production ROM, no input or memory patching during exhibition cycles.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';
import {supportedModes} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map'));
fs.mkdirSync(out,{recursive:true});
const results=[];
const allStages=process.argv.includes('--all-stages');
for(const [mode,label] of supportedModes(rom)) {
 const gb=boot(rom,mode),events=[],stages=[];let last=-1,cycle=0,cutin=false,road=false,ranking=false,scores;let titleRows=new Set();
 const read=()=>{const r=memory(gb).ram,b=n=>r[s[n]-0xc000];return {scene:b('_ce_scene'),demo:b('_ce_demo'),musicRow:r.readUInt16LE(s._ce_music_row-0xc000),stage:r[s._ce_state-0xc000+18],intro:r.readUInt16LE(s._ce_intro_left-0xc000),scores:Buffer.from(r.subarray(s._ce_scores-0xc000,s._ce_scores-0xc000+10)),trace:r.subarray(s._ce_trace-0xc000,s._ce_trace-0xc000+24)};};
 try {
  for(let frame=0;frame<(allStages?400000:100000);frame+=4) {
   frames(gb,4);const t=read();if(t.trace[0]!==67)continue;
   scores??=t.scores;assert.deepEqual(t.scores,scores,'demo must not update rankings');
   if(t.scene===0)titleRows.add(t.musicRow);
   if(t.scene!==last){events.push({frame,scene:t.scene,demo:t.demo,stage:t.stage});console.log(label,events.at(-1));last=t.scene;}
   if(t.demo&&t.scene===1&&!road&&t.trace[4]===t.stage&&t.trace[2]>5){assert.ok(titleRows.size>1,'title BGM advances after every logo');titleRows.clear();road=true;stages.push(t.stage);capture(gb,path.join(out,`${label}-${cycle}-road.png`));}
   if(t.demo&&t.scene===7&&t.intro>0&&t.intro<60){if(!cutin)capture(gb,path.join(out,`${label}-${cycle}-cutin.png`));cutin=true;}
   if(t.scene===4&&road){assert.ok(cutin,'boss cutin before ranking');ranking=true;}
   if(t.scene===12&&ranking){cycle++;road=false;cutin=false;ranking=false;if(cycle>=2&&(!allStages||new Set(stages).size===7))break;}
  }
  assert.ok(cycle>=2,'two complete exhibition cycles');if(allStages)assert.equal(new Set(stages).size,7,'all seven stages');for(let i=1;i<stages.length;i++)assert.notEqual(stages[i-1],stages[i],'avoid consecutive same stage');
  const waitFor=predicate=>{for(let n=0;n<24000;n++){frames(gb,1);if(predicate(read()))return;}throw Error('input route timed out');};
  waitFor(t=>t.demo&&t.scene===1);
  gb.key_press(PadKey.Start);frames(gb,120);assert.equal(read().scene,0,'held Start cancels demo without starting game');gb.key_lift(PadKey.Start);
  waitFor(t=>t.demo&&t.scene===7&&t.intro>10&&t.intro<50);
  gb.key_press(PadKey.A);frames(gb,8);gb.key_lift(PadKey.A);waitFor(t=>t.scene===0&&!t.demo);
  // Preserve stage selection through character cancel, then start a real game.
  const tap=k=>{gb.key_press(k);frames(gb,8);gb.key_lift(k);frames(gb,60);};
  frames(gb,120);assert.equal(read().scene,0);
  tap(PadKey.Down);tap(PadKey.Right);tap(PadKey.A);assert.equal(read().scene,10);
  tap(PadKey.B);assert.equal(read().scene,0);tap(PadKey.A);assert.equal(read().scene,10);
  tap(PadKey.Right);tap(PadKey.A);assert.equal(read().scene,1);assert.equal(read().demo,0);assert.equal(read().stage,1,'stage selection survives character cancel');
  results.push({label,cycles:cycle,stages,events,rankingsUnchanged:true,normalStart:true,demoAndCutinCancel:true,heldInputConsumed:true,titleMusicRestarts:true});
 } catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({events,state:read()},null,2));throw e;} finally{gb.free();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({sha256:crypto.createHash('sha256').update(rom).digest('hex'),results},null,2));
}
