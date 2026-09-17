// Deterministic GB derivatives of the preserved built-in image_gen masters.
// Run once against the v33 source; never regenerate over later authored edits.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../../..'),lib=require(path.join(root,'editor/build/library.cjs')),{PNG}=require(path.join(root,'editor/node_modules/pngjs'));
const g=lib.readGame(root,'touhou-kouma'),revision=lib.revision(g),records=[];
assert.equal(revision,'bca6a6db20ae582f54b5b20bced0e256e2a776ab69b9bf87886d632ce66cc9bc','v33 input required');
const specs=[['stage-forest','forest',0x0b1819,0x193529],['stage-lake','lake',0x081c2c,0x12344a],['stage-1','gate',0x181c21,0x303936],['stage-4','roof',0x161529,0x302943],['stage-5','cellar',0x17121e,0x352338]];
function unpack(n){return[n>>16,(n>>8)&255,n&255];}function pack(c){return(c[0]<<16)|(c[1]<<8)|c[2];}
for(const [id,name,dark,floor] of specs){
 const s=g.stages.find(s=>s.id===id),original=g.assets.find(a=>a.id===s.tileset),file=path.join(__dirname,'masters',name+'.png'),png=PNG.sync.read(fs.readFileSync(file)),back=unpack(dark),rgb=[],mono=[];
 // Alpha-aware box reduction removes high-resolution edge artifacts. The
 // quantized hardware preview is validated after 8x8 palette conversion.
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const sums=[0,0,0];let count=0;
  for(let yy=Math.floor(y*png.height/32);yy<Math.floor((y+1)*png.height/32);yy++)for(let xx=Math.floor(x*png.width/32);xx<Math.floor((x+1)*png.width/32);xx++){
   const i=(yy*png.width+xx)*4,alpha=png.data[i+3]/255;
   for(let k=0;k<3;k++)sums[k]+=png.data[i+k]*alpha+back[k]*(1-alpha);count++;
  }
  const c=sums.map(v=>Math.round(v/count));rgb.push(pack(c));
  const lum=c[0]*.2126+c[1]*.7152+c[2]*.0722;mono.push(lum<35?0:lum<82?1:lum<150?2:3);
 }
 const pixels=Array(64*40).fill(0),cgbPixels=Array(64*40).fill(dark);
 for(let tile=0;tile<40;tile++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const at=(Math.floor(tile/8)*8+y)*64+(tile%8)*8+x;
  if(tile<32){const t=tile%16,xx=t%4*8+x,yy=Math.floor(t/4)*8+y,src=yy*32+(tile<16?xx:31-xx);pixels[at]=mono[src];cgbPixels[at]=rgb[src];}
  else {const xx=(tile-32)%4*8+x,yy=Math.floor((tile-32)/4)*8+y;
   const mark=name==='lake'?(yy===4&&xx>=5&&xx<14)||(yy===12&&xx>=23&&xx<29):((yy===0&&xx%16<15)||(xx%16===0&&yy%8>0&&yy%8<7));
   pixels[at]=mark?1:0;cgbPixels[at]=mark?floor:dark;
  }
 }
 const a={...structuredClone(original),id:'map-'+name+'-v34',name:s.name+'・32px対称帯',width:64,height:40,origin:{x:0,y:0},hitbox:{x:0,y:0,w:64,h:40},frames:[{...original.frames[0],image:'images/map-'+name+'-v34.png',cgbImage:'images/map-'+name+'-v34-cgb.png',pixels,cgbPixels}]};
 g.assets.push(a);s.tileset=a.id;s.parallax={enabled:true,firstTile:32,width:4,height:2,divisor:2};
 s.tiles=s.tiles.map((_,i)=>{const x=i%s.width,y=Math.floor(i/s.width);return x<4?(y%4)*4+x:x>=11&&x<15?16+(y%4)*4+x-11:x<11?32+(y%2)*4+(x-4)%4:0;});
 records.push({stage:id,source:original.id,asset:a.id,master:'masters/'+name+'.png',sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),tiles:40,sidePixels:32,centerPixels:56,animatedTiles:8});
}
// The library and clock keep their original motifs. Extend the right band to
// four columns, with the existing outside-wall tile, at x=88 rather than 96.
for(const id of ['stage-2','stage-3']){const s=g.stages.find(s=>s.id===id),before=[...s.tiles];for(let y=0;y<s.height;y++)for(let x=11;x<15;x++)s.tiles[y*s.width+x]=before[y*s.width+(x===14?0:x+1)];records.push({stage:id,asset:s.tileset,sidePixels:32,centerPixels:56,preservedArtwork:true});}
g.player.focusHitbox=true;
lib.saveGame(root,'touhou-kouma',g,revision);
fs.writeFileSync(path.join(__dirname,'assets.json'),JSON.stringify({sourceRevision:revision,revision:lib.revision(g),tool:'built-in image_gen, alpha-aware downsample, compiler 8x8 color quantization',records},null,2)+'\n');
console.log(records);
