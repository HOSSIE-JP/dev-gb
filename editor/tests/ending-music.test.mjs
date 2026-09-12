import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=path.resolve(import.meta.dirname,'../..'),game=()=>lib.readGame(root,'touhou-kouma'),errors=g=>lib.validate(g).filter(d=>d.severity==='error');
test('ending routes preserve shared epilogues and select the correct final heroine',()=>{
 const g=game();assert.deepEqual(errors(g),[]);assert.equal(g.ending.seconds,10);assert.equal(g.ending.music,34);assert.equal(g.ending.scoreAfter,true);
 const a=lib.resolveEnding(g),b=lib.resolveEnding(g,1);assert.equal(a.length,6);assert.equal(b.length,6);assert.deepEqual(a.slice(0,5).map(s=>s.background),b.slice(0,5).map(s=>s.background));assert.equal(a.at(-1).background,'screen-clear');assert.equal(b.at(-1).background,'ending-marisa');
 const original=g.player.characters[0];g.player.characters.unshift({...original,id:'other'});assert.equal(lib.resolveEnding(g,1),g.ending.slides);assert.equal(lib.resolveEnding(g,2),b);
 g.ending.characterSlides[0].slides=[];assert.deepEqual(lib.resolveEnding(g,2),[],'explicit empty route overrides fallback');delete g.ending.characterSlides;assert.equal(lib.resolveEnding(g,2),a);
});
test('ending settings reject bad timing, character IDs, duplicate routes and non-screen art',()=>{
 for(const edit of [g=>g.ending.seconds=0,g=>g.ending.seconds=61,g=>g.ending.music=35,g=>g.ending.characterSlides[0].character='gone',g=>g.ending.characterSlides.push({...g.ending.characterSlides[0],id:'duplicate'}),g=>g.ending.characterSlides[0].slides[0].background='reimu',g=>g.ending.characterSlides[0].slides[0].id='',g=>g.ending.scoreAfter=1]){const g=game();edit(g);assert.ok(errors(g).length);}
 const g=game();delete g.ending.music;delete g.ending.scoreAfter;delete g.ending.characterSlides;assert.deepEqual(errors(g),[],'legacy optional settings');
});
test('expanded screen asset capacity retains the 64 sprite-definition hardware bound',()=>{
 const g=game();assert.ok(g.assets.length>64);assert.deepEqual(errors(g),[]);const sprite=g.assets.find(a=>a.kind==='sprite');while(g.assets.filter(a=>a.kind==='sprite').length<=64)g.assets.push({...sprite,id:'sprite-'+g.assets.length,name:'Sprite '+g.assets.length});assert.ok(errors(g).length);
});
test('all background roles use complete arranged scores and victory remains a short one-shot',()=>{
 const score=JSON.parse(fs.readFileSync(path.join(root,'engine/caravan/assets-src/kouma-score.json'))),mirror=JSON.parse(fs.readFileSync(path.join(root,'projects/touhou-kouma/touhou-kouma-design/music-v13/score.json')));assert.deepEqual(score,mirror);
 assert.deepEqual(score.tracks.map(t=>t.id),Array.from({length:19},(_,i)=>i+16));
 for(const t of score.tracks){const seconds=t.bars.length*16*t.speed/59.72750057;if(t.id===29){assert.equal(t.loop,false);assert.ok(seconds<4);continue;}
  assert.ok(t.loop);assert.ok(seconds>=57&&seconds<=61);const sections=new Set(t.bars.map(b=>b.section));assert.ok(sections.has('Intro')&&sections.has('A')&&sections.has('B'));assert.ok(new Set(t.bars.map(b=>b.chord)).size>=5);assert.ok(new Set(t.bars.map(b=>b.lead.join(','))).size>=20);
  for(const b of t.bars){assert.equal(b.lead.length,16);assert.equal(b.bass.length,16);assert.ok(b.lead.some(n=>n>0&&n<255));assert.ok(b.bass.some(n=>n>0&&n<255));}
 }
});
