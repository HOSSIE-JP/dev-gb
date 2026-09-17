import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
test('GBC dictionary covers all 697 sparse masks with 181 exact flipped tiles',()=>{
 const d=lib.gbcBarrageDictionary();assert.equal(d.masks.length,181);assert.equal(d.tiles.length,2896);
 const unique=new Set();let sparse=0;
 for(let mask=0;mask<65536;mask++){
  const [tile,attr]=d.lookup.slice(mask*2,mask*2+2),count=mask.toString(2).replaceAll('0','').length;
  if(count>3){assert.equal(tile,255);continue;}sparse++;unique.add(tile);
  assert.ok(tile<181);assert.equal(attr&~0x60,8);
  // Decode the actual 2bpp bytes, using the hardware pixel flips rather than
  // calling the generator's mask transformation as the test oracle.
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const sx=attr&32?7-x:x,sy=attr&64?7-y:y;
   const color=((d.tiles[tile*16+sy*2]>>(7-sx))&1)|(((d.tiles[tile*16+sy*2+1]>>(7-sx))&1)<<1);
   assert.equal(color,mask&(1<<((y>>1)*4+(x>>1)))?3:0);
  }
 }
 assert.equal(sparse,697);assert.equal(unique.size,181);
});
test('GBC capacity is validated independently of DMG and giant-mode limits',()=>{
 const g=lib.readGame(process.cwd(),'star-caravan');g.hardware='gbc';
 g.performance={enemies:12,playerShots:6,enemyShots:32,effects:4,dense:true};
 g.stages[0].bgBullets=true;g.stages[0].bgBulletLimit=96;g.stages[0].walls.fill(0);
 if(g.stages[0].destructibles)g.stages[0].destructibles.objects=[];
 assert.ok(!lib.validate(g).some(x=>x.severity==='error'));
 g.stages[0].bgBulletLimit=97;assert.ok(lib.validate(g).some(x=>x.severity==='error'));
 g.stages[0].bgBulletLimit=96;g.hardware='dual';assert.ok(lib.validate(g).some(x=>x.severity==='error'));
 g.hardware='gbc';g.performance.dense=false;assert.ok(lib.validate(g).some(x=>x.target==='hardware'&&x.severity==='error'));
});
