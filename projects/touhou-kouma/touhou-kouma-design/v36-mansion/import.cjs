// Stage 6 only. Read/save the editable project with optimistic revision checking.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const root=path.resolve(__dirname,'../../../..');
const l=require(path.join(root,'editor/build/library.cjs'));
const {PNG}=require(path.join(root,'editor/node_modules/pngjs'));
const g=l.readGame(root,'touhou-kouma'),revision=l.revision(g);
assert.equal(revision,'df2aca01ece1f36fd6a2ed87c7d5b11068b7ccb35fcc5f23f9ef5a1f65a782f5','requires unchanged v35');
const s=g.stages[5],old=g.assets.find(a=>a.id===s.tileset),a=structuredClone(old);
function sample(name,w,h){
 const file=path.join(__dirname,'masters',name+'.png'),p=PNG.sync.read(fs.readFileSync(file)),rgb=[],mono=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const sum=[0,0,0];let n=0;
  for(let yy=Math.floor(y*p.height/h);yy<Math.floor((y+1)*p.height/h);yy++)for(let xx=Math.floor(x*p.width/w);xx<Math.floor((x+1)*p.width/w);xx++){
   const i=(yy*p.width+xx)*4;assert.equal(p.data[i+3],255);
   for(let c=0;c<3;c++)sum[c]+=p.data[i+c];n++;
  }
  const c=sum.map(v=>Math.round(v/n)),light=c[0]*.2126+c[1]*.7152+c[2]*.0722;
  rgb.push((c[0]<<16)|(c[1]<<8)|c[2]);
  // Shared thresholds preserve the dark roof's 0/1 pattern and brighter facade.
  mono.push(light<28?0:light<42?1:light<80?2:3);
 }
 return {file:'masters/'+name+'.png',width:w,height:h,rgb,mono,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};
}
const facade=sample('facade',32,32),roof=sample('roof',32,16);
a.id='map-roof-v36';a.name='紅魔館・赤い尖頭窓と暗い屋根';
a.frames[0].image='images/map-roof-v36.png';a.frames[0].cgbImage='images/map-roof-v36-cgb.png';
for(let t=0;t<40;t++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
 const i=(Math.floor(t/8)*8+y)*64+(t%8)*8+x,n=t<32?t%16:t-32;
 const xx=n%4*8+x,yy=Math.floor(n/4)*8+y,source=t<32?facade:roof;
 const at=yy*32+(t>=16&&t<32?31-xx:xx);
 a.frames[0].pixels[i]=source.mono[at];a.frames[0].cgbPixels[i]=source.rgb[at];
}
g.assets.push(a);s.tileset=a.id;
assert.deepEqual(l.validate(g).filter(d=>d.severity==='error'),[]);
// Source art comparison: old color, new color, old DMG, new DMG, all at 2x.
const preview=new PNG({width:4*240,height:288});
for(let panel=0;panel<4;panel++){
 const art=panel%2?a:old;
 const pixels=panel<2?l.colorPreview(g,art,art.frames[0]):art.frames[0].pixels.map(v=>[0x101820,0x586870,0xa8b8b0,0xf0f0d8][v]);
 for(let y=0;y<144;y++)for(let x=0;x<120;x++){
  const tile=s.tiles[(y>>3)*s.width+(x>>3)],at=(Math.floor(tile/8)*8+(y&7))*64+(tile%8)*8+(x&7),c=pixels[at];
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
   const p=((y*2+dy)*preview.width+panel*240+x*2+dx)*4;
   preview.data[p]=c>>16;preview.data[p+1]=c>>8;preview.data[p+2]=c;preview.data[p+3]=255;
  }
 }
}
fs.writeFileSync(path.join(__dirname,'comparison.png'),PNG.sync.write(preview));
const mean=(arr,fn)=>arr.reduce((n,v)=>n+fn(v),0)/arr.length;
const light=c=>(c>>16)*.2126+((c>>8)&255)*.7152+(c&255)*.0722;
console.log({colorLuma:{facade:mean(facade.rgb,light),roof:mean(roof.rgb,light)},dmgShade:{facade:mean(facade.mono,x=>x),roof:mean(roof.mono,x=>x)}});
if(process.argv.includes('--preview-only'))process.exit(0);
l.saveGame(root,'touhou-kouma',g,revision);
fs.writeFileSync(path.join(__dirname,'assets.json'),JSON.stringify({sourceRevision:revision,revision:l.revision(g),stage:6,asset:a.id,tiles:40,parallaxTiles:8,sideWidth:32,centerWidth:56,parallaxDivisor:2,sourceMasters:[facade,roof].map(({file,width,height,sha256})=>({file,width,height,sha256})),method:'Area reduction of two distinct masters; mirrored facade at each side; darker full 32x16 roof in center; common DMG luminance thresholds 28/42/80'},null,2)+'\n');

