// Deterministic Game Boy conversion of the six preserved image_gen masters.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),lib=require(path.join(root,'editor/build/library.cjs')),{PNG}=require(path.join(root,'editor/node_modules/pngjs'));
const ids=['select-reimu','select-marisa','gameover-reimu','gameover-marisa','dialogue-marisa-before','dialogue-marisa-after'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function tiles(pixels){const keys=new Set();for(let y=0;y<144;y+=8)for(let x=0;x<160;x+=8){let key='';for(let j=0;j<8;j++)key+=pixels.slice((y+j)*160+x,(y+j)*160+x+8).join('');keys.add(key);}return keys.size;}
function scale(p,w,h,ox,oy){const pixels=Array(23040).fill(0);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
 const i=(Math.floor((y+.5)*p.height/h)*p.width+Math.floor((x+.5)*p.width/w))*4;
 pixels[(y+oy)*160+x+ox]=p.data[i+3]<200?0:Math.max(0,Math.min(3,Math.round(p.data[i]/85)));
}return pixels;}
function convert(){return ids.map(id=>{
 const original=fs.readFileSync(path.join(__dirname,id+'-original.png')),p=PNG.sync.read(original),portrait=id.startsWith('dialogue'),candidates=portrait?[[64,88,8,4]]:[[160,144,0,0],[152,136,4,4],[144,128,8,8],[136,120,12,12]];
 const limit=id.startsWith('gameover')?228:255;let pixels,layout;
 for(const c of candidates){pixels=scale(p,...c);layout=c;if(tiles(pixels)<=limit)break;}
 assert.ok(tiles(pixels)<=limit,id+' tile budget');
 return {asset:{id,name:({'select-reimu':'霊夢・機体選択バストアップ','select-marisa':'魔理沙・機体選択バストアップ','gameover-reimu':'霊夢・トホホ','gameover-marisa':'魔理沙・トホホ','dialogue-marisa-before':'魔理沙・会話立ち絵','dialogue-marisa-after':'魔理沙・勝利立ち絵'})[id],kind:'screen',width:160,height:144,palette:id.includes('reimu')?0:7,origin:{x:0,y:0},hitbox:{x:0,y:0,w:1,h:1},emitters:[],frames:[{id:id+'-0',image:'images/'+id+'.png',duration:8,pixels}]},record:{id,original:id+'-original.png',originalSha256:hash(original),sourceSize:[p.width,p.height],layout,uniqueTiles:tiles(pixels),sourcePngSha256:hash(lib.encodePng(160,144,pixels,false))}};
});}
module.exports=convert;
if(require.main===module){const converted=convert();for(const {asset:a,record}of converted){
 if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'projects/touhou-kouma/assets-src',a.frames[0].image),lib.encodePng(160,144,a.frames[0].pixels,false));
 if(process.argv.includes('--verify'))assert.deepEqual(lib.decodeIndexedPng(fs.readFileSync(path.join(root,'projects/touhou-kouma/assets-src',a.frames[0].image)),160,144),a.frames[0].pixels);
 console.log(JSON.stringify(record));
}if(process.argv.includes('--previews'))for(const {asset:a}of converted){const p=new PNG({width:160,height:144});for(let i=0;i<23040;i++){p.data[i*4]=p.data[i*4+1]=p.data[i*4+2]=a.frames[0].pixels[i]*85;p.data[i*4+3]=255;}fs.writeFileSync(path.join(__dirname,a.id+'-gb.png'),PNG.sync.write(p));}}
