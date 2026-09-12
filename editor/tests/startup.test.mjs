import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs'),game=()=>lib.readGame(process.cwd(),'touhou-kouma'),errors=g=>lib.validate(g).filter(d=>d.severity==='error');
const settings=()=>({enabled:true,fadeSeconds:.4,slides:[{id:'logo-a',background:'screen-title',seconds:2},{id:'logo-b',background:'ending-marisa',seconds:3}]});
test('startup logos are optional, ordered and allow repeated art with independent durations',()=>{
 const g=game();assert.deepEqual(errors(g),[]);g.startup=settings();g.startup.slides.push({...g.startup.slides[0],id:'logo-c',seconds:.1});assert.deepEqual(errors(g),[]);g.startup.enabled=false;assert.deepEqual(errors(g),[]);g.startup.slides=[];assert.deepEqual(errors(g),[]);
});
test('startup rejects malformed pages, wrong art, invalid durations and capacity overflow',()=>{
 for(const edit of [s=>s.fadeSeconds=0,s=>s.fadeSeconds=3.1,s=>s.fadeSeconds=NaN,s=>s.enabled=1,s=>s.slides=null,s=>s.slides[0].seconds=0,s=>s.slides[0].seconds=60.1,s=>s.slides[0].background='reimu',s=>s.slides[0].background='missing',s=>s.slides[0].id='',s=>s.slides[1].id=s.slides[0].id,s=>s.slides=Array.from({length:17},(_,i)=>({...s.slides[0],id:'logo-'+i}))]){const g=game();g.startup=settings();edit(g.startup);assert.ok(errors(g).length);}
});
