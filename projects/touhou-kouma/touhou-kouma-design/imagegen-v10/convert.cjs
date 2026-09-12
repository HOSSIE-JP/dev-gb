// Reproduce the three imported indexed PNGs from the preserved image_gen originals.
// Default: verify. --write regenerates only these source PNGs, without changing game.json.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../..'),lib=require(path.join(root,'editor/build/library.cjs')),{PNG}=require(path.join(root,'editor/node_modules/pngjs'));
const manifest=require('./manifest.json'),read=id=>{const file=path.join(__dirname,manifest.originals[id].file),bytes=fs.readFileSync(file);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.originals[id].sha256);return PNG.sync.read(bytes);};
const m=read('marisa'),{x0,y0,x1,y1}=manifest.marisaCrop,mp=Array(16*24).fill(0),outputs=[];
for(let y=0;y<22;y++)for(let x=0;x<14;x++){
 const sx=x0+Math.floor((x+.5)*(x1-x0+1)/14),sy=y0+Math.floor((y+.5)*(y1-y0+1)/22),i=(sy*m.width+sx)*4,v=m.data[i];
 mp[(y+1)*16+x+1]=m.data[i+3]<200||v<48?0:v<115?1:v<215?2:3;
}
outputs.push({id:'marisa',width:16,height:24,pixels:mp,transparent:true});
for(const [id,source,w,h,ox,oy]of [['bomb-yinyang','yinYang',96,96,32,24],['bomb-spark','spark',96,128,32,0]]){
 const p=read(source),pixels=Array(160*144).fill(0);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.floor((y+.5)*p.height/h)*p.width+Math.floor((x+.5)*p.width/w))*4;pixels[(y+oy)*160+x+ox]=Math.max(0,Math.min(3,Math.round(p.data[i]/85)));}
 outputs.push({id,width:160,height:144,pixels,transparent:false});
}
for(const p of outputs){const file=path.join(root,'projects/touhou-kouma/assets-src/images',p.id+'.png'),bytes=lib.encodePng(p.width,p.height,p.pixels,p.transparent);if(process.argv.includes('--write'))fs.writeFileSync(file,bytes);else assert.deepEqual(lib.decodeIndexedPng(fs.readFileSync(file),p.width,p.height),p.pixels);console.log(p.id,crypto.createHash('sha256').update(bytes).digest('hex'));}
