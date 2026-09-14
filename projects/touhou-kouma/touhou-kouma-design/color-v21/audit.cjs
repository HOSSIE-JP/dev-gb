const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../../..'),l=require(path.join(root,'editor/build/library.cjs')),g=l.readGame(root,'touhou-kouma'),objects=l.quantizeSpriteAssets(g),rows=[];
for(const a of g.assets)for(const f of a.frames){
 assert.ok(f.cgbPixels&&f.cgbImage,a.id);assert.notEqual(f.image,f.cgbImage);
 const groups=g.stages.filter(s=>s.tileset===a.id&&s.parallax?.enabled).map(s=>Array.from({length:s.parallax.width*s.parallax.height},(_,i)=>s.parallax.firstTile+i));
 const q=a.kind==='sprite'?objects.frames.get(a.id+"/"+f.id):l.quantizeColorTiles(a.width,a.height,f.cgbPixels,undefined,groups);
 assert.ok(q.attributes.every(p=>p>=1&&p<=7));
 for(let y=0;y<a.height;y+=8)for(let x=0;x<a.width;x+=8){const colors=new Set();for(let j=0;j<8;j++)for(let i=0;i<8;i++){const at=(y+j)*a.width+x+i;if(a.kind==='sprite'&&f.cgbPixels[at]<0){assert.equal(q.pixels[at],0);continue;}colors.add(q.pixels[at]);}assert.ok(colors.size<=(a.kind==='sprite'?3:4));}
 rows.push({id:a.id,frame:f.id,width:a.width,height:a.height,source:f.cgbImage,palettes:[...new Set(q.attributes)],colors:new Set(q.preview).size,error:q.error,singlePaletteError:q.singlePaletteError});
}
assert.equal(rows.length,79);
fs.writeFileSync(path.join(__dirname,'audit.json'),JSON.stringify({revision:l.revision(g),assets:g.assets.length,frames:rows.length,reservedPalette:0,objPalettes:objects.palettes,objMeanError:objects.error,rows},null,2)+'\n');
console.log('68 assets / 79 frames: separate color sources and hardware palette limits passed');
