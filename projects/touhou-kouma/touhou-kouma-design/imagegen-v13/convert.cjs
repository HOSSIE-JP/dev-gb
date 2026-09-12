const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../..'),lib=require(path.join(root,'editor/build/library.cjs')),{PNG}=require(path.join(root,'editor/node_modules/pngjs'));
function convert(){const raw=fs.readFileSync(path.join(__dirname,'ending-marisa-original.png')),p=PNG.sync.read(raw);let pixels,layout,count;
 for(const [w,h,x0,y0]of [[160,144,0,0],[152,136,4,4],[144,128,8,8]]){
  pixels=Array(23040).fill(0);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.floor((y+.5)*p.height/h)*p.width+Math.floor((x+.5)*p.width/w))*4;pixels[(y+y0)*160+x+x0]=Math.max(0,Math.min(3,Math.round((p.data[i]*.299+p.data[i+1]*.587+p.data[i+2]*.114)/85)));}
  const tiles=new Set();for(let y=0;y<144;y+=8)for(let x=0;x<160;x+=8){let t='';for(let j=0;j<8;j++)t+=pixels.slice((y+j)*160+x,(y+j)*160+x+8).join('');tiles.add(t);}count=tiles.size;layout=[w,h,x0,y0];if(count<=255)break;
 }assert.ok(count<=255);
 const asset={id:'ending-marisa',name:'魔理沙・夜明けの一服',kind:'screen',width:160,height:144,palette:7,origin:{x:0,y:0},hitbox:{x:0,y:0,w:1,h:1},emitters:[],frames:[{id:'ending-marisa-0',image:'images/ending-marisa.png',duration:8,pixels}]};
 return {asset,record:{tool:'built-in image_gen',master:'ending-marisa-original.png',masterSha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceSize:[p.width,p.height],layout,uniqueTiles:count,assetSha256:crypto.createHash('sha256').update(lib.encodePng(160,144,pixels,false)).digest('hex')}};
}
module.exports=convert;
if(require.main===module){const {asset,record}=convert();if(process.argv.includes('--verify'))assert.deepEqual(lib.decodeIndexedPng(fs.readFileSync(path.join(root,'projects/touhou-kouma/assets-src/images/ending-marisa.png')),160,144),asset.frames[0].pixels);
 const p=new PNG({width:160,height:144});for(let i=0;i<23040;i++){p.data[i*4]=p.data[i*4+1]=p.data[i*4+2]=asset.frames[0].pixels[i]*85;p.data[i*4+3]=255;}fs.writeFileSync(path.join(__dirname,'ending-marisa-gb.png'),PNG.sync.write(p));fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(record,null,2)+'\n');console.log(record);}
