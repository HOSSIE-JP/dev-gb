import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const l=createRequire(import.meta.url)('../build/library.cjs');
test('startup movie persists portable payload and rejects malformed hardware data',()=>{
 const g=l.readGame(process.cwd(),'star-caravan'),b=(n,v=0)=>Buffer.alloc(n,v).toString('base64');
 const frame={dmg:b(1792),cgb:b(3840),attributes:b(240,1),palettes:b(56)};
 g.startupMovie={enabled:true,frames:[frame],pcm:b(Math.ceil(6*70224/4194304*8192/32)*16,0x88)};
 const errors=()=>l.validate(g).filter(d=>d.severity==='error'&&d.target==='startupMovie');assert.deepEqual(errors(),[]);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'movie-roundtrip-'));
 try {fs.mkdirSync(path.join(root,'projects'));l.createProject(root,'movie-roundtrip','Movie',g);assert.deepEqual(l.readGame(root,'movie-roundtrip').startupMovie,g.startupMovie);}finally{fs.rmSync(root,{recursive:true,force:true});}
 g.startupMovie.frames=Array(400).fill(frame);g.startupMovie.pcm=b(Math.ceil(400*6*70224/4194304*8192/32)*16,0x88);assert.deepEqual(errors(),[]);
 const valid=structuredClone(g.startupMovie);
 for(const alter of [m=>m.frames[0].attributes=b(240,8),m=>m.frames[0].palettes=b(56,255),m=>m.frames[0].dmg=m.frames[0].dmg.slice(0,-2)+'A=',m=>m.pcm='',m=>{m.frames=Array(401).fill(frame);m.pcm=b(Math.ceil(401*6*70224/4194304*8192/32)*16,0x88);}]){g.startupMovie=structuredClone(valid);alter(g.startupMovie);assert.ok(errors().length);}
});

