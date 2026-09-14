import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const l=createRequire(import.meta.url)('../build/library.cjs');
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';

test('independent color sources survive save/reopen and reject conflicting case-insensitive paths',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'caravan-color-')),g=l.readGame(process.cwd(),'star-caravan'),a=g.assets[0],f=a.frames[0],mono=[...f.pixels];
 f.cgbImage='images/color-roundtrip.png';f.cgbPixels=f.pixels.map((p,i)=>a.kind==='sprite'&&!p?-1:(0x235678+i)%0xffffff);
 try{fs.mkdirSync(path.join(root,'projects'));l.createProject(root,'color-roundtrip','Color roundtrip',g);const reopened=l.readGame(root,'color-roundtrip'),frame=reopened.assets[0].frames[0];assert.deepEqual(frame.pixels,mono);assert.deepEqual(frame.cgbPixels,f.cgbPixels);
 const other=reopened.assets.find(x=>x!==reopened.assets[0]);other.frames[0].cgbImage='images/COLOR-ROUNDTRIP.png';other.frames[0].cgbPixels=Array(other.width*other.height).fill(0xffffff);assert.ok(l.validate(reopened).some(d=>d.severity==='error'&&d.message.includes('重複')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('RGB555 tile optimizer uses seven palettes, keeps tile colors legal and improves over a global palette',()=>{
 const rgb=[],colors=[0xf04040,0x40f040,0x4040f0,0xf0f040,0xf040f0,0x40f0f0,0xf08020];
 for(let y=0;y<8;y++)for(let x=0;x<56;x++){const c=colors[Math.floor(x/8)],k=(x%4+1)/4;rgb.push((Math.round((c>>16)*k)<<16)|(Math.round(((c>>8)&255)*k)<<8)|Math.round((c&255)*k));}
 const q=l.quantizeColorTiles(56,8,rgb);assert.equal(q.palettes.length,28);assert.ok(q.attributes.every(a=>a>=1&&a<=7));assert.equal(new Set(q.attributes).size,7);assert.ok(q.error<q.singlePaletteError/4);assert.deepEqual(q,l.quantizeColorTiles(56,8,rgb));
 for(let tile=0;tile<7;tile++){const used=new Set();for(let y=0;y<8;y++)for(let x=0;x<8;x++)used.add(q.preview[y*56+tile*8+x]);assert.ok(used.size<=4);}
});
test('OBJ optimization reserves transparent zero and uses only three opaque colors per tile',()=>{
 const rgb=Array.from({length:128},(_,i)=>i%5?0xff0000+i*17:-1),mask=rgb.map(v=>+(v>=0)),q=l.quantizeColorTiles(16,8,rgb,mask);
 q.pixels.forEach((v,i)=>{if(!mask[i])assert.equal(v,0);else assert.ok(v>=1&&v<=3);});assert.equal(q.palettes.length,28);for(let p=0;p<7;p++)assert.equal(q.palettes[p*4],0);
 assert.deepEqual(l.decodeColorPng(l.encodeColorPng(16,8,rgb),16,8),rgb);
});
test('parallax tiles retain one palette throughout their cyclic texture motion',()=>{
 const rgb=Array.from({length:256},(_,i)=>i%32<16?0xff3322:0x2266ff),q=l.quantizeColorTiles(32,8,rgb,undefined,[[0,1,2,3]]);assert.equal(new Set(q.attributes).size,1);
});
test('different color variants may share an identical DMG source without overwriting each other',()=>{
 const g=l.readGame(process.cwd(),'star-caravan'),a=g.assets.find(a=>a.kind==='sprite'),f=a.frames[0];a.frames=[{...f,cgbImage:'images/red.png',cgbPixels:f.pixels.map(p=>p?0xff0000:-1)},{...f,id:'blue',cgbImage:'images/blue.png',cgbPixels:f.pixels.map(p=>p?0x0000ff:-1)}];
 const q=l.quantizeSpriteAssets(g);assert.notDeepEqual(q.frames.get(a.id+"/"+f.id).preview,q.frames.get(a.id+"/blue").preview);
});
