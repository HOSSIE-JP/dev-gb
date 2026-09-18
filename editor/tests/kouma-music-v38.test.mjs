import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..'), lib=createRequire(import.meta.url)('../build/library.cjs');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const score=read('engine/caravan/assets-src/kouma-score.json'),old=read('projects/touhou-kouma/touhou-kouma-design/music-v13/score.json');
test('all seven stages have faster road/boss music, distinct waves and audible modulating notes',()=>{
 const tracks=score.tracks.filter(t=>t.stage);assert.equal(tracks.length,14);
 for(let stage=1;stage<=7;stage++){
  const pair=tracks.filter(t=>t.stage===stage);assert.equal(pair.length,2);
  assert(pair.find(t=>t.role==='boss').bpm>pair.find(t=>t.role==='road').bpm);
 }
 assert.equal(new Set(tracks.filter(t=>t.role==='road').map(t=>t.bars[0].wave)).size,7);
 for(const t of tracks){
  assert(t.bpm>59.7275*15/old.tracks.find(o=>o.id===t.id).speed);
  assert.equal(t.bars.at(-1).chord,'V7');assert.equal(t.bars.at(-1).tonic,t.tonic);
  for(const section of ['B','Bridge']){
   const b=t.bars.find(b=>b.section===section);assert.notEqual(b.tonic,t.tonic);
   const basePCs=new Set((t.mode==='major'?[0,2,4,5,7,9,11]:t.mode==='dorian'?[0,2,3,5,7,9,10]:[0,2,3,5,7,8,10]).map(n=>(n+t.tonic)%12));
   const pcs=t.bars.filter(b=>b.section===section).flatMap(b=>[...b.lead,...b.bass]).filter(n=>n>0&&n<255).map(n=>(n+35)%12);
   // Verify changed pitches, rather than merely trusting key-name metadata.
   assert(pcs.some(pc=>!basePCs.has(pc)),'new key has chromatic evidence');
  }
 }
 for(const t of score.tracks.filter(t=>!t.stage))assert.deepEqual(t,old.tracks.find(o=>o.id===t.id),'noncombat music unchanged');
});
test('wave bank has eight different bounded balanced shapes and retains the legacy triangle',()=>{
 const {waves}=read('engine/caravan/assets-src/music-waves.json');
 assert.equal(waves.length,8);assert.equal(new Set(waves.map(w=>w.samples.join(','))).size,8);
 assert.deepEqual(waves[0].samples,[...Array.from({length:16},(_,i)=>i),...Array.from({length:16},(_,i)=>15-i)]);
 for(const w of waves){assert.equal(w.samples.length,32);assert.equal(w.samples.reduce((s,n)=>s+n,0),240);assert(w.samples.every(n=>Number.isInteger(n)&&n>=0&&n<=15));}
});
test('score conversion rejects unsafe wave indices and malformed fractional tempo',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'music-authoring-')),src=path.join(dir,'engine/caravan/assets-src');fs.mkdirSync(src,{recursive:true});
 try{
  for(const name of ['kouma-score.json','side-score.json','music-waves.json'])fs.copyFileSync(path.join(root,'engine/caravan/assets-src',name),path.join(src,name));
  for(const bad of [-1,8,.5,'1']){
   const s=structuredClone(score);s.tracks[0].bars[0].wave=bad;
   fs.writeFileSync(path.join(src,'kouma-score.json'),JSON.stringify(s));
   assert.throws(()=>lib.generateMusic(dir,path.join(dir,'out')),/Invalid GB instrument/);
  }
  const s=structuredClone(score);s.tracks[0].speedHalf=1;fs.writeFileSync(path.join(src,'kouma-score.json'),JSON.stringify(s));
  assert.throws(()=>lib.generateMusic(dir,path.join(dir,'out')),/Invalid song timing/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
