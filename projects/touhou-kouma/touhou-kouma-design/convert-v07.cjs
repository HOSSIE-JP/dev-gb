// Technical reduction of Image Gen originals using the v0.3/v0.5 portrait layout.
// Produces importable pixels and previews; never edits game.json.
const fs=require('fs'),path=require('path'),{PNG}=require('../../../editor/node_modules/pngjs');
const dir=__dirname,out=path.join(dir,'imagegen-v07');
const read=p=>PNG.sync.read(fs.readFileSync(p));
function reduce(image,box,w,h,nearest=false){
 const [x0,y0,x1,y1]=box;let l=x1,r=x0,t=y1,b=y0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const j=(y*image.width+x)*4;if(image.data[j]>32){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}}
 const scale=Math.min(w/(r-l+1),h/(b-t+1)),dw=Math.round((r-l+1)*scale),dh=Math.round((b-t+1)*scale),pixels=Array(w*h).fill(0);
 for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){
  const xa=l+x*(r-l+1)/dw,xb=l+(x+1)*(r-l+1)/dw,ya=t+y*(b-t+1)/dh,yb=t+(y+1)*(b-t+1)/dh;let value=0,weight=0;
  if(nearest){value=image.data[(Math.floor((ya+yb)/2)*image.width+Math.floor((xa+xb)/2))*4];weight=1;}
  else for(let yy=Math.floor(ya);yy<Math.ceil(yb);yy++)for(let xx=Math.floor(xa);xx<Math.ceil(xb);xx++){const a=(Math.min(xb,xx+1)-Math.max(xa,xx))*(Math.min(yb,yy+1)-Math.max(ya,yy));value+=image.data[(yy*image.width+xx)*4]*a;weight+=a;}
  value/=weight;pixels[(h-dh+y)*w+Math.floor((w-dw)/2)+x]=value<38?0:value<108?1:value<190?2:3;
 }
 return {width:w,height:h,pixels};
}
function save(id,a){const png=new PNG({width:a.width*4,height:a.height*4});for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){const j=(y*png.width+x)*4,c=a.pixels[(y>>2)*a.width+(x>>2)]*85;png.data[j]=png.data[j+1]=png.data[j+2]=c;png.data[j+3]=255;}fs.writeFileSync(path.join(out,id+'-gb.png'),PNG.sync.write(png));}
const sheet=read(path.join(out,'rumia-sheet-corrected.png')),assets={};
for(let i=0;i<2;i++){
 // Explicit panel masks isolate the standing arm and kneeling skirt where the
 // two bounding rectangles overlap. They only discard the other figure.
 const panel={...sheet,data:Buffer.from(sheet.data)},sx=sheet.width/1456,sy=sheet.height/1088;
 for(let y=0;y<sheet.height;y++)for(let x=0;x<sheet.width;x++)if(i?(x<880*sx&&y<420*sy):(x>775*sx&&y>420*sy)){const j=(y*sheet.width+x)*4;panel.data[j]=panel.data[j+1]=panel.data[j+2]=0;}
 const rumia=reduce(panel,i?[Math.floor(775*sx),0,sheet.width,sheet.height]:[0,0,Math.floor(880*sx),sheet.height],64,i?80:88),reimu=read(path.join(dir,'converted-v03','reimu-portrait-'+i+'.png')),a={width:160,height:144,pixels:Array(160*144).fill(0)};
 for(let y=0;y<reimu.height;y++)for(let x=0;x<reimu.width;x++)a.pixels[(96-reimu.height+y)*160+8+x]=Math.round(reimu.data[(y*reimu.width+x)*4]/85);
 for(let y=0;y<rumia.height;y++)for(let x=0;x<64;x++)a.pixels[(96-rumia.height+y)*160+88+x]=rumia.pixels[y*64+x];
 const id=i?'result-rumia':'dialogue-rumia';assets[id]=a;save(id,a);save('rumia-portrait-'+i,rumia);
}
const sprite=read(path.join(out,'cirno-sprite.png'));assets.cirno=reduce(sprite,[0,0,sprite.width,sprite.height],24,24);save('cirno',assets.cirno);save('cirno-nearest',reduce(sprite,[0,0,sprite.width,sprite.height],24,24,true));
fs.writeFileSync(path.join(out,'pixels.json'),JSON.stringify(assets));console.log(Object.keys(assets));
