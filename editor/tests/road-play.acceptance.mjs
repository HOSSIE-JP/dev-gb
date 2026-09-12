// First complete road on the unmodified game: actual firing/movement, no RAM writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),g=lib.readGame(root,'touhou-kouma'),design=JSON.parse(fs.readFileSync(path.join(root,'projects/touhou-kouma/touhou-kouma-design/stages-v12.json'))).stages[0];
const file=path.resolve(process.argv[2]??'projects/touhou-kouma/build/Debug/touhou-kouma.gb'),out=path.resolve(process.argv[3]??'.cache/kouma-v12/play'),rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map')),t=syms._ce_trace,signature=Buffer.from([0x21,(t+22)&255,(t+22)>>8,0x36,0]),published=rom.indexOf(signature,syms._ce_trace_write)+signature.length,results=[];
assert.ok(published>syms._ce_trace_write&&published<syms._ce_sound);fs.mkdirSync(out,{recursive:true});
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(character?'marisa':'reimu'),raids=new Set();let previous,peak=0,score=0,rapidKills=0,lastKill=-9999,kills=0,lives=g.player.lives,done=false;
 const tap=k=>{gb.key_press(k);frames(gb,3);gb.key_lift(k);frames(gb,3);};
 try{
  frames(gb,240);tap(PadKey.Start);frames(gb,24);if(character){tap(PadKey.Right);frames(gb,12);}tap(PadKey.A);
  for(let n=0;n<5000;n++){
   gb.step_to(published);const r=memory(gb).ram,tr=r.subarray(t-0xc000),tick=tr.readUInt16LE(18),enemies=[];lives=tr[7];
   if(tr[17]===5){for(const k of [PadKey.Left,PadKey.Right,PadKey.A,PadKey.B])gb.key_lift(k);frames(gb,3);capture(gb,path.join(out,label+'-boss-dialogue.png'));done=true;break;}
   assert.equal(tr[17],1,'normal run remains in gameplay until boss conversation');
   for(let i=0;i<39;i++){const p=syms._ce_entities-0xc000+i*25;if(r[p]===1)enemies.push({x:r.readInt16LE(p+12),y:r.readInt16LE(p+14),age:r.readUInt16LE(p+6),ref:r[p+1]});}
   if(enemies.length>peak){peak=enemies.length;capture(gb,path.join(out,label+'-peak.png'));}
   for(const section of design.sections)if(tick>=section.raidStart+65&&tick<section.raidLastSpawn&&enemies.length>=1&&!raids.has(section.section)){raids.add(section.section);capture(gb,path.join(out,label+'-raid-'+section.section+'.png'));}
   const nextScore=tr.readUInt16LE(5);if(nextScore>score){kills++;if(tick-lastKill<=30)rapidKills++;lastKill=tick;}score=nextScore;
   for(const key of [PadKey.Left,PadKey.Right,PadKey.A,PadKey.B])gb.key_lift(key);gb.key_press(character?PadKey.A:PadKey.B);
   const x=tr.readInt16LE(8),y=tr.readInt16LE(10),target=enemies.filter(e=>e.y>0&&e.y<y-16*16).sort((a,b)=>b.y-a.y)[0];
   if(target){const motion=g.enemies[target.ref].motion,flight=Math.max(0,Math.round((y-target.y)/16/(character?8:5))),a=lib.motionOffset(motion,target.age),b=lib.motionOffset(motion,target.age+flight),aim=target.x+b.x-a.x;if(aim-x>24)gb.key_press(PadKey.Right);if(aim-x < -24)gb.key_press(PadKey.Left);}
   previous=tick;gb.clock();
  }
  console.log({label,done,raids:[...raids],peak,kills,rapidKills,score,lives});assert.ok(done);assert.equal(raids.size,3);assert.ok(rapidKills>=12);assert.ok(lives>0);
  results.push({label,fixture:false,bossReached:true,bossFrame:design.bossFrame,raidSections:[...raids],enemyPeak:peak,killEvents:kills,rapidKillEvents:rapidKills,score,lives});console.log(label,results.at(-1));
 }catch(error){capture(gb,path.join(out,label+'-failure.png'));throw error;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,sha256:crypto.createHash('sha256').update(rom).digest('hex'),authoredRevision:lib.revision(g),results},null,2));
