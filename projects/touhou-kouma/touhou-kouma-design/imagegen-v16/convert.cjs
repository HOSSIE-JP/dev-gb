const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../..'),lib=require(path.join(root,'editor/build/library.cjs')),{PNG}=require(path.join(root,'editor/node_modules/pngjs'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function convert(){
 const raw=fs.readFileSync(path.join(__dirname,'logo-ai-slop-type-original.png')),p=PNG.sync.read(raw),pixels=Array.from({length:23040},(_,n)=>{const k=(Math.floor((Math.floor(n/160)+.5)*p.height/144)*p.width+Math.floor((n%160+.5)*p.width/160))*4;return Math.max(0,Math.min(3,Math.round((.299*p.data[k]+.587*p.data[k+1]+.114*p.data[k+2])*p.data[k+3]/255/85)));});
 const tiles=new Set();for(let y=0;y<144;y+=8)for(let x=0;x<160;x+=8){let t='';for(let j=0;j<8;j++)t+=pixels.slice((y+j)*160+x,(y+j)*160+x+8).join('');tiles.add(t);}assert.ok(tiles.size<=255);
 const preview=new PNG({width:160,height:144});for(let i=0;i<23040;i++){preview.data[i*4]=preview.data[i*4+1]=preview.data[i*4+2]=pixels[i]*85;preview.data[i*4+3]=255;}
 fs.writeFileSync(path.join(__dirname,'logo-ai-slop-gb.png'),PNG.sync.write(preview));
 const record={tool:'built-in image_gen',prompt:'prompt.txt',master:'logo-ai-slop-type-original.png',masterSha256:hash(raw),sourceSize:[p.width,p.height],outputSize:[160,144],sampling:'nearest-neighbor pixel-center, alpha composited over black, luma rounded to four shades',uniqueTiles:tiles.size,palette:7,asset:'../../assets-src/images/logo-ai-slop.png',assetSha256:hash(lib.encodePng(160,144,pixels,false))};
 fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(record,null,2)+'\n');return {pixels,record};
}
module.exports=convert;if(require.main===module){const result=convert();if(process.argv.includes('--verify'))assert.deepEqual(lib.decodeIndexedPng(fs.readFileSync(path.join(root,'projects/touhou-kouma/assets-src/images/logo-ai-slop.png')),160,144),result.pixels);console.log(result.record);}
