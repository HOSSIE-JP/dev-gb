// Real SM83 startup path: ordered images, timed fades and all joypad skip keys.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,GameBoyMode,PadKey} from './emulator.mjs';import {capture,assertImage} from './presentation-qa.mjs';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs'),out=path.resolve(process.argv[2]??'.cache/kouma-v14/startup'),fixture=path.join(out,'fixture');
fs.mkdirSync(path.join(fixture,'projects'),{recursive:true});for(const dir of ['engine','.tools/gbdk','.tools/misaki'])fs.cpSync(path.join(root,dir),path.join(fixture,dir),{recursive:true});
const game=lib.readGame(root,'star-caravan');game.name='startup-test';game.stageFade=false;
const prototype=game.assets[0];
for(const [i,id]of ['test-logo-a','test-logo-b'].entries())game.assets.push({...prototype,id,name:id,kind:'screen',width:160,height:144,palette:0,frames:[{...prototype.frames[0],image:'images/'+id+'.png',pixels:Array.from({length:23040},(_,n)=>((Math.floor(n/160/(8+i*8))+Math.floor((n%160)/16)+i)%4))}]});
game.startup={enabled:true,fadeSeconds:.4,slides:[{id:'first',background:'test-logo-a',seconds:.5},{id:'second',background:'test-logo-b',seconds:.75},{id:'third',background:'test-logo-a',seconds:1}]};
if(!fs.existsSync(path.join(fixture,'projects/startup-test')))lib.createProject(fixture,'startup-test',game.title,game);else lib.saveGame(fixture,'startup-test',game);
const romPath=process.argv.includes('--reuse')?path.join(fixture,'projects/startup-test/build/Debug/startup-test.gb'):lib.compile(fixture,'startup-test','Debug',()=>{}).romPath,rom=fs.readFileSync(romPath),syms=symbols(romPath.replace(/\.gb$/,'.map')),results=[];
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const scenario of [{key:null,phase:2},...['A','B','Start','Select','Up','Down','Left','Right'].map(key=>({key,phase:2})),...[0,1,3].map(phase=>({key:'A',phase})),{key:'Start',phase:-1},{key:'A',phase:0,pulse:true}]){
 const gb=boot(rom,mode),label=(mode===GameBoyMode.Dmg?'DMG':'CGB')+'-'+(scenario.key??'auto')+'-'+scenario.phase+(scenario.pulse?'-tap':''),seen=new Map();let title=false,sent=-1;
 const snap=()=>{const m=memory(gb),r=m.ram,b=n=>r[syms[n]-0xc000];return {b,scene:b('_ce_scene'),page:b('_ce_logo_page'),phase:b('_ce_logo_phase'),left:r.readUInt16LE(syms._ce_logo_left-0xc000),fade:b('_ce_fade_level'),bgp:m.io[0x47],ready:!r[syms._ce_trace-0xc000+22]};};
 if(scenario.phase===-1)gb.key_press(PadKey[scenario.key]);
 try{for(let f=0;f<1500;f++){
  const s=snap();if(scenario.pulse&&sent>=0&&f-sent===1)gb.key_lift(PadKey[scenario.key]);
  if(s.scene===12){
   if(scenario.key&&sent<0&&s.phase===scenario.phase){gb.key_press(PadKey[scenario.key]);sent=f;}
   if(!scenario.key&&s.ready&&s.page<game.startup.slides.length&&s.left>0&&s.phase>0&&s.phase<4){
    if(!seen.has(s.page))seen.set(s.page,{fadesIn:new Set(),fadesOut:new Set(),brightness:new Map(),hold:0,firstHold:-1,lastHold:-1});const v=seen.get(s.page);
    if(s.phase===1)v.fadesIn.add(s.fade);if(s.phase===3)v.fadesOut.add(s.fade);
    const bgp=Array.from({length:4},(_,i)=>Math.min(3,(((game.dmgPalette??228)>>(i*2))&3)+s.fade)<<(i*2)).reduce((a,b)=>a|b,0);assert.equal(s.bgp,bgp,'hardware DMG palette follows fade');
    if((s.phase===1||s.phase===3)&&s.left===3){const rgb=gb.frame_buffer_eager();v.brightness.set(s.fade,rgb.reduce((a,b)=>a+b,0)/rgb.length);}
    if(s.phase===2&&s.left>0){v.hold++;v.lastHold=f;if(v.firstHold<0)v.firstHold=f;if(s.left===Math.round(game.startup.slides[s.page].seconds*60)-3){assert.equal(s.fade,0);assertImage(gb,game.assets.find(a=>a.id===game.startup.slides[s.page].background).frames[0].pixels,label+' page '+s.page);capture(gb,path.join(out,label+'-'+s.page+'.png'));v.pixels=true;}}
   }
  }
  if(s.scene===0&&s.phase===4&&s.ready&&s.b('_ce_music_track')===(game.music?.title??0)){title=true;if(scenario.key&&scenario.phase>=0)assert.ok(f-sent<60,'skip reaches title promptly');break;}
  frames(gb,1);
 }
 assert.ok(title,label+' reaches title');
 if(scenario.key){frames(gb,60);assert.equal(snap().scene,0,'held skip key must not leave title');gb.key_lift(PadKey[scenario.key]);frames(gb,2);}
 else {assert.equal(seen.size,3);for(const [i,v]of seen){assert.deepEqual([...v.fadesIn].sort(),[0,1,2,3]);assert.deepEqual([...v.fadesOut].sort(),[1,2,3,4]);assert.ok(v.pixels);for(let level=0;level<3;level++)assert.ok(v.brightness.get(level)>v.brightness.get(level+1),'visible framebuffer darkens at each shade');assert.ok(v.brightness.get(3)>=v.brightness.get(4));assert.ok(Math.abs(v.hold-Math.round(game.startup.slides[i].seconds*60))<=2,'authored hold time');}}
 // Score screen round-trip returns directly to title, without startup replay.
 gb.key_press(PadKey.Select);frames(gb,30);gb.key_lift(PadKey.Select);frames(gb,2);assert.equal(snap().scene,4);gb.key_press(PadKey.A);frames(gb,30);gb.key_lift(PadKey.A);assert.equal(snap().scene,0);
 gb.key_press(PadKey.Start);frames(gb,50);gb.key_lift(PadKey.Start);assert.equal(snap().scene,1,'fresh input starts the game');
 results.push({label,skip:scenario.key,phase:scenario.phase,title:true,heldInputGuard:true,noReplay:true,gameplay:true,pages:[...seen].map(([i,v])=>({index:i,...v,fadesIn:[...v.fadesIn],fadesOut:[...v.fadesOut],brightness:[...v.brightness]}))});
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));fs.writeFileSync(path.join(out,label+'-failure.json'),JSON.stringify({state:snap(),seen:[...seen].map(([k,v])=>[k,{...v,fadesIn:[...v.fadesIn],fadesOut:[...v.fadesOut],brightness:[...v.brightness]}])}));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:romPath,sha256:crypto.createHash('sha256').update(rom).digest('hex'),fixture:'Star Caravan with two deterministic test images in three slots; stageFade=false demonstrates independent logo fades. Real joypad input; no RAM writes.',results},null,2));console.log(results.length+' DMG/CGB startup cases passed');
