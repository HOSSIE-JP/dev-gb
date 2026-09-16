// Production ROM: verify the resident OBJ pixels and fixed HUD after movie exit.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,settledTrace,GameBoyMode} from './emulator.mjs';
import {capture} from './presentation-qa.mjs';
const lib=createRequire(import.meta.url)('../build/library.cjs');
const file=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
fs.mkdirSync(out,{recursive:true});
const rom=fs.readFileSync(file),syms=symbols(file.replace(/\.gb$/,'.map'));
const game=lib.readGame(process.cwd(),'touhou-kouma'),layout=lib.spriteLayout(game);
const color=lib.quantizeSpriteAssets(game),results=[];
for(const [label,mode] of [['DMG',GameBoyMode.Dmg],['CGB',GameBoyMode.Cgb]]) {
 const gb=boot(rom,mode),cameras=new Set();let road=0,boss=0,cutin=false,labels,movie=false;
 const expected=game.assets.filter(a=>a.kind==='sprite'&&!layout.overlay.has(a.id)).map(a=>({
  id:a.id,offset:layout.offsets.get(a.id)*16,
  bytes:Buffer.from(a.frames.flatMap(f=>lib.packTiles(a.width,a.height,mode===GameBoyMode.Cgb?color.frames.get(a.id+'/'+f.id).pixels:f.pixels)))
 }));
 try {
  for(let frame=0;frame<24000;frame++) {
   frames(gb,1);let m=memory(gb);const b=n=>m.ram[syms[n]-0xc000];
   if(b('_ce_scene')===15)movie=true;
   if(b('_ce_scene')===7)cutin=true;
   if(b('_ce_scene')!==1||b('_ce_fade_level'))continue;
   const t=settledTrace(gb,syms._ce_trace);m=memory(gb);
   if(!t||t.scene!==1||b('_ce_scene')!==1||b('_ce_fade_level')||t.tick<30)continue;
   assert.equal(m.io[0x40]&0x50,0x40,'signed BG tiles and independent Window map restored');
   const battle=b('_ce_battle_mode'),base=battle>=2?0:0x800;
   const start=m.state.readUInt32LE(m.core+0xa4),vram=m.state.subarray(start,start+8192);
   for(const a of expected)assert.deepEqual(vram.subarray(base+a.offset,base+a.offset+a.bytes.length),a.bytes,`${label} ${battle?'boss':'road'} sprite ${a.id}`);
   if(!battle) {
    assert.equal(m.io[0x4a],0);assert.equal(m.io[0x4b],7);
    // Compare Window map + glyph bytes; sprites may legitimately overlap the HUD.
    const pixels=[];
    for(const cell of [0,7,10,13,14]) {
     const tile=vram[0x1c00+cell];pixels.push(tile);
     const address=tile<128?0x1000+tile*16:tile*16;
     pixels.push(...vram.subarray(address,address+16));
    }
    if(road>5){labels??=pixels;assert.deepEqual(pixels,labels,'HUD map and glyphs remain fixed while BG scrolls');}    cameras.add(m.ram.readUInt16LE(syms._ce_state-0xc000+4));
    if(road++===120)capture(gb,path.join(out,label+'-road.png'));
   } else if(battle>=2&&cutin) {
    if(boss++===60)capture(gb,path.join(out,label+'-boss.png'));
    if(boss>=120)break;
   }
  }
  assert.ok(movie&&cutin&&road>120&&boss>=120);assert.ok(cameras.size>30);
  results.push({mode:label,roadSamples:road,bossSamples:boss,cameraPositions:cameras.size,residentAssets:expected.map(a=>a.id),movie:true,cutin:true});
  console.log(label,'sprite VRAM and fixed HUD passed');
 }catch(e){capture(gb,path.join(out,label+'-failure.png'));throw e;}finally{gb.free();}
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));


