import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),root=path.resolve(import.meta.dirname,'../..');

test('Image Gen originals are retained verbatim and the adopted GB frames fit hardware limits',()=>{
 const g=lib.readGame(root,'side-caravan'),base=path.join(root,'projects/side-caravan/assets-src/imagegen-v03');
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'))),prompts=JSON.parse(fs.readFileSync(path.join(base,'prompts.json')));
 assert.equal(manifest.masters.length,6);
 for(const m of manifest.masters){assert.ok(prompts[m.id].length>100);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(base,m.master))).digest('hex'),m.sha256);}
 for(const [id,w,h,n] of [['ship',24,16,4],['ship-barrier',24,16,4],['drone',16,16,2],['sweeper',16,16,2],['carrier',16,16,2],['facility',128,32,1],['giant-core',160,144,2]]){
  const a=g.assets.find(a=>a.id===id);assert.equal(a.width,w);assert.equal(a.height,h);assert.equal(a.frames.length,n);
  for(const f of a.frames){assert.equal(f.pixels.length,w*h);assert.ok(f.pixels.every(p=>Number.isInteger(p)&&p>=0&&p<=3));}
  if(n>1)assert.ok(new Set(a.frames.map(f=>f.pixels.join(''))).size>1,'actual animation '+id);
 }
 assert.ok(lib.spriteLayout(g).tiles<=128);
 const a=g.assets.find(a=>a.id==='giant-core'),changed=new Set();
 for(let i=0;i<a.frames[0].pixels.length;i++){
  if(a.frames[0].pixels[i]!==a.frames[1].pixels[i])changed.add(Math.floor(i/160/8)*20+Math.floor(i%160/8));
  if(a.frames.some(f=>f.pixels[i]!==0)){assert.ok(i%160>=48&&i%160<128);assert.ok(Math.floor(i/160)>=32&&Math.floor(i/160)<112);}
 }
 assert.ok(changed.size>0&&changed.size<=32);assert.equal(g.bosses[0].contactBoxes.length,4);
});

test('BG animation and body authoring reject invalid timing, shapes and oversized rectangle counts',()=>{
 for(const mutate of [g=>g.bosses[0].contactBoxes=[null],g=>g.bosses[0].contactBoxes={},g=>g.assets.find(a=>a.id==='giant-core').frames[0].duration=3,g=>g.assets.find(a=>a.id==='giant-core').frames[1].duration=8]){
  const g=lib.readGame(root,'side-caravan');mutate(g);assert.ok(lib.validate(g).some(d=>d.severity==='error'));
 }
});

test('SIDE soundtrack has full-length varied sections and stable new IDs',()=>{
 const score=JSON.parse(fs.readFileSync(path.join(root,'engine/caravan/assets-src/side-score.json'))),g=lib.readGame(root,'side-caravan');
 assert.deepEqual(score.tracks.map(t=>t.id),[35,36,37]);assert.deepEqual(score.tracks.map(t=>t.bars.length),[32,64,32]);
 for(const t of score.tracks){assert.ok(t.loop);assert.ok(new Set(t.bars.map(b=>b.section)).size>=4);assert.ok(new Set(t.bars.map(b=>b.lead.join(','))).size>=10);assert.ok(new Set(t.bars.map(b=>b.chord)).size>=5);for(const b of t.bars)for(const voice of [b.lead,b.bass]){assert.equal(voice.length,16);assert.ok(voice.every(n=>Number.isInteger(n)&&(n===255||(n>=0&&n<=60))));}}
 assert.equal(g.music.title,35);assert.equal(g.stages[0].music,36);assert.equal(g.stages[0].bossMusic,37);
});
