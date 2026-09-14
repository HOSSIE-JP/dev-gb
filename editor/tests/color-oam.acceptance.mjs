// Ordinary inputs; independently check every visible resident OBJ attribute.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode,PadKey} from './emulator.mjs';import {capture} from './presentation-qa.mjs';
const l=createRequire(import.meta.url)('../build/library.cjs'),g=l.readGame(process.cwd(),'touhou-kouma'),file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),rom=fs.readFileSync(file),s=symbols(file.replace(/\.gb$/,'.map')),layout=l.spriteLayout(g),q=l.quantizeSpriteAssets(g),expected=new Map(),results=[];fs.mkdirSync(out,{recursive:true});
for(const a of g.assets.filter(a=>a.kind==='sprite'&&!layout.overlay.has(a.id)))for(const [f,frame]of a.frames.entries())q.frames.get(a.id+"/"+frame.id).attributes.forEach((p,i)=>expected.set(128+layout.offsets.get(a.id)+f*a.width*a.height/64+i,p));
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb])for(const character of [0,1]){
 const gb=boot(rom,mode),label=`${mode===GameBoyMode.Dmg?'DMG':'CGB'}-${character}`,read=()=>settledTrace(gb,s._ce_trace),until=f=>{for(let n=0;n<2400;n++){const t=read();if(t&&f(t))return t;frames(gb,1);}throw Error('timeout '+label);},tap=k=>{gb.key_press(k);frames(gb,4);gb.key_lift(k);frames(gb,12);};
 try{until(t=>t.scene===0);tap(PadKey.A);until(t=>t.scene===10);if(character)tap(PadKey.Right);tap(PadKey.A);until(t=>t.scene===1);gb.key_press(PadKey.A);let checked=0;const palettes=new Set();
 for(let n=0;n<450;n++){frames(gb,1);const t=read();if(!t||t.scene!==1)continue;const oam=memory(gb).oam;for(let i=0;i<160;i+=4){if(!oam[i]||oam[i]>=160||!oam[i+1]||oam[i+1]>=168)continue;assert.ok(expected.has(oam[i+2]),label+' resident tile');assert.equal(oam[i+3],mode===GameBoyMode.Cgb?expected.get(oam[i+2]):0,label+' palette at tile '+oam[i+2]);palettes.add(oam[i+3]);checked++;}if(n===200)capture(gb,path.join(out,label+'.png'));}
 assert.ok(checked>500);if(mode===GameBoyMode.Cgb)assert.ok(palettes.size>=2);results.push({label,checked,palettes:[...palettes]});console.log(label+' OBJ attributes passed');
 }finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({rom:file,results},null,2));
