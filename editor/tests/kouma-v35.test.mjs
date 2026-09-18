import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const l=createRequire(import.meta.url)('../build/library.cjs'),game=()=>l.readGame(process.cwd(),'touhou-kouma');
function region(a,source,first,count){return Array.from({length:count*64},(_,i)=>{const t=first+(i>>6),x=i&7,y=(i>>3)&7;return source[(Math.floor(t/(a.width/8))*8+y)*a.width+(t%(a.width/8))*8+x];});}
test('all seven stage centers are distinct and retain contrast when scrolling vertically',()=>{
 const g=game(),mono=new Set(),color=new Set();assert.deepEqual(l.validate(g).filter(d=>d.severity==='error'),[]);
 for(const s of g.stages){const a=g.assets.find(a=>a.id===s.tileset),p=s.parallax;assert(p.enabled);assert.equal(p.width*p.height,8);assert.equal(p.divisor,2);
  for(const [pixels,seen] of [[a.frames[0].pixels,mono],[a.frames[0].cgbPixels,color]]){const r=region(a,pixels,p.firstTile,8);seen.add(crypto.createHash('sha256').update(JSON.stringify(r)).digest('hex'));let moving=0;for(let y=0;y<16;y++)for(let x=0;x<32;x++){const at=(yy)=>Math.floor(yy/8)*256+Math.floor(x/8)*64+(yy%8)*8+x%8;if(r[at(y)]!==r[at((y+2)%16)])moving++;}assert(moving>=40,s.id+' must have visible vertical parallax texture');}
 }assert.equal(mono.size,7);assert.equal(color.size,7);
});
test('scarlet mansion roof and center use red tones; lake shore is connected blue ice with a moving water center',()=>{
 const g=game(),roof=g.assets.find(a=>a.id===g.stages[5].tileset),red=roof.frames[0].cgbPixels.filter(c=>(c>>16)>((c>>8)&255)*1.5&&(c>>16)>(c&255)*1.5);assert(red.length>roof.width*roof.height*.9);
 const lake=g.assets.find(a=>a.id===g.stages[1].tileset),shore=region(lake,lake.frames[0].cgbPixels,0,32),water=region(lake,lake.frames[0].pixels,32,8);assert(shore.filter(c=>(c&255)>40).length>shore.length*.98,'no black voids separating repeated ice cubes');assert(new Set(water).size>=2,'water needs readable wave contrast');
});
test('original center motifs are copied unchanged for lake, gate and cellar',()=>{
 const g=game();for(const [stage,id,first] of [[1,'map-lake',96],[2,'map-1',96],[6,'map-5',96]]){const a=g.assets.find(a=>a.id===g.stages[stage].tileset),old=g.assets.find(a=>a.id===id);for(const field of ['pixels','cgbPixels'])assert.deepEqual(region(a,a.frames[0][field],32,8),region(old,old.frames[0][field],first,8));}
});
