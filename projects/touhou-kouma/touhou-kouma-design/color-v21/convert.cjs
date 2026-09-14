// Reproducible technical reduction of the preserved image_gen color masters.
// DMG assets stay untouched except the three explicitly requested ending layouts.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../../..'),lib=require(path.join(root,'editor/build/library.cjs')),{PNG}=require(path.join(root,'editor/node_modules/pngjs'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),records=[],sources=new Map();
function read(name){const file=path.join(__dirname,name+'-master.png'),bytes=fs.readFileSync(file);sources.set(name,{file:path.basename(file),sha256:hash(bytes)});return PNG.sync.read(bytes);}
function sample(p,x,y){const i=(Math.max(0,Math.min(p.height-1,Math.floor(y)))*p.width+Math.max(0,Math.min(p.width-1,Math.floor(x))))*4;return(p.data[i]<<16)|(p.data[i+1]<<8)|p.data[i+2];}
function resize(p,w,h,box=[0,0,p.width,p.height]){const [x0,y0,x1,y1]=box,out=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++)out.push(sample(p,x0+(x+.5)*(x1-x0)/w,y0+(y+.5)*(y1-y0)/h));return out;}
function paste(out,pixels,w,h,x0,y0){for(let y=0;y<h;y++)for(let x=0;x<w;x++)out[(y+y0)*160+x+x0]=pixels[y*w+x];}
function fit(p,box,w,h,erase){let l=box[2],r=box[0],t=box[3],b=box[1];
 const visible=(x,y)=>!erase?.(x,y)&&sample(p,x,y)>0x181818;
 for(let y=Math.floor(box[1]);y<box[3];y++)for(let x=Math.floor(box[0]);x<box[2];x++)if(visible(x,y)){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
 assert.ok(r>=l&&b>=t);const scale=Math.min(w/(r-l+1),h/(b-t+1)),dw=Math.max(1,Math.round((r-l+1)*scale)),dh=Math.max(1,Math.round((b-t+1)*scale)),out=Array(w*h).fill(0);
 for(let y=0;y<dh;y++)for(let x=0;x<dw;x++){const xx=l+(x+.5)*(r-l+1)/dw,yy=t+(y+.5)*(b-t+1)/dh;out[(h-dh+y)*w+Math.floor((w-dw)/2)+x]=erase?.(xx,yy)?0:sample(p,xx,yy);}return out;
}
function convert(game){const g=structuredClone(game),byId=id=>{const a=g.assets.find(a=>a.id===id);assert.ok(a,id);return a;};
 function put(id,pixels,source,frame=0){const a=byId(id),f=a.frames[frame];assert.equal(pixels.length,a.width*a.height,id);f.cgbImage=`images/${id}-${frame}-cgb.png`;f.cgbPixels=pixels;records.push({id,frame,source,image:f.cgbImage,width:a.width,height:a.height});}
 for(const id of ['ending-rumia','ending-cirno','ending-meiling-patchouli','ending-sakuya-remilia','ending-flandre','ending-marisa','screen-title','select-reimu','select-marisa','gameover-reimu','gameover-marisa','logo-ai-slop','logo-touhou-notice',...['meiling','patchouli','sakuya','remilia','flandre','cirno','rumia'].map(n=>'cutin-'+n)])put(id,resize(read(id),160,144),id);
 put('screen-clear',resize(read('ending-reimu'),160,144),'ending-reimu');
 for(const [id,w,h,x,y]of [['bomb-yinyang',96,96,32,24],['bomb-spark',96,128,32,0]]){const out=Array(23040).fill(0);paste(out,resize(read(id),w,h),w,h,x,y);put(id,out,id);}
 const portraits={};
 for(const name of ['reimu','meiling','patchouli','sakuya','remilia','flandre','cirno','rumia']){
  const p=read(name+'-sheet'),sx=p.width/1456,sy=p.height/1088;
  portraits[name]=[0,1].map(side=>{
   let box=side?[p.width*.51,0,p.width,p.height]:[0,0,p.width*.52,p.height],erase;
   if(name==='reimu')box=side?[p.width/2,0,p.width,p.height]:[0,0,p.width/2,p.height];
   else if(name==='cirno')box=side?[p.width*.37,0,p.width*.67,p.height]:[0,0,p.width*.37,p.height];
   else if(name==='rumia'){box=side?[775*sx,0,p.width,p.height]:[0,0,880*sx,p.height];erase=side?(x,y)=>x<880*sx&&y<420*sy:(x,y)=>x>775*sx&&y>420*sy;}
   else if(!side){const limits=name==='meiling'?[200,500,750]:name==='patchouli'?[175,800,1088]:[260,750,1088];erase=(x,y)=>x<limits[0]*sx&&y>limits[1]*sy&&y<limits[2]*sy;}
   return fit(p,box,64,side?80:88,erase);
  });
 }
 for(const [name,suffix]of [['meiling','1'],['patchouli','2'],['sakuya','3'],['remilia','4'],['flandre','5'],['cirno','cirno'],['rumia','rumia']])for(let side=0;side<2;side++){
  const out=Array(23040).fill(0),h=side?80:88;paste(out,portraits.reimu[side],64,h,8,96-h);paste(out,portraits[name][side],64,h,88,96-h);put((side?'result-':'dialogue-')+suffix,out,['reimu-sheet',name+'-sheet']);
 }
 for(const id of ['dialogue-marisa-before','dialogue-marisa-after']){const p=read(id),out=Array(23040).fill(0);paste(out,resize(p,64,88),64,88,8,4);put(id,out,id);}
 for(const kind of ['characters','objects']){const p=read(kind),atlas=require('./'+kind+'-atlas.json');for(const r of atlas.records){const a=byId(r.asset),f=a.frames[r.frame],out=[];
  for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
   if(!f.pixels[y*a.width+x]){out.push(-1);continue;}
   const xx=(r.x+x+.5)*p.width/atlas.width,yy=(r.y+y+.5)*p.height/atlas.height;let c=sample(p,xx,yy);
   // Retain the original silhouette if a generation shifted a color edge.
   if(c<0x181818){let found=false;for(let d=1;d<=2&&!found;d++)for(let j=-d;j<=d&&!found;j++)for(let i=-d;i<=d;i++){const v=sample(p,xx+i*p.width/atlas.width,yy+j*p.height/atlas.height);if(v>0x303030){c=v;found=true;break;}}}
   out.push(c);
  }put(r.asset,out,kind,r.frame);
 }}
 for(const s of g.stages){const a=byId(s.tileset),p=read(s.id),rgb=resize(p,160,256),sum=Array.from({length:a.width*a.height},()=>[0,0,0,0]);
  for(let y=0;y<256;y++)for(let x=0;x<160;x++){const tile=s.tiles[Math.floor(y/8)*s.width+Math.floor(x/8)],at=(Math.floor(tile/(a.width/8))*8+(y&7))*a.width+(tile%(a.width/8))*8+(x&7),c=rgb[y*160+x],v=sum[at];v[0]+=c>>16;v[1]+=(c>>8)&255;v[2]+=c&255;v[3]++;}
  const fallback=[0x080d20,0x21354a,0x456a78,0x8cb5b0];
  put(a.id,sum.map((v,i)=>v[3]?(Math.round(v[0]/v[3])<<16)|(Math.round(v[1]/v[3])<<8)|Math.round(v[2]/v[3]):fallback[a.frames[0].pixels[i]]),s.id);
 }
 // These legacy UI backplates are procedural four-shade graphics, not illustrations.
 for(const id of ['screen-over','screen-scores']){const a=byId(id);put(id,a.frames[0].pixels.map(v=>[0x080d20,0x322653,0x6c91bc,0xffdfa0][v]),'existing procedural UI backplate');}
 for(const id of ['ending-rumia','screen-clear','ending-marisa']){
  const a=byId(id),master=read(id==='screen-clear'?'ending-reimu':id);let layout,count,pixels;
  for(const [w,h]of [[160,144],[152,136],[144,128],[136,120],[128,112]]){
   pixels=Array(23040).fill(0);const rgb=resize(master,w,h),mono=rgb.map(c=>Math.max(0,Math.min(3,Math.round(((c>>16)*.299+((c>>8)&255)*.587+(c&255)*.114)/85))));paste(pixels,mono,w,h,(160-w)/2,(144-h)/2);
   const keys=new Set();for(let y=0;y<144;y+=8)for(let x=0;x<160;x+=8){let key='';for(let j=0;j<8;j++)key+=pixels.slice((y+j)*160+x,(y+j)*160+x+8).join('');keys.add(key);}count=keys.size;layout=[w,h];if(count<=255)break;
  }assert.ok(count<=255);a.frames[0].pixels=pixels;records.find(r=>r.id===id).dmg={layout,tiles:count};
 }
 g.palettes[0].colors[0]='#000000';
 assert.equal(g.assets.length,68);assert.ok(g.assets.every(a=>a.frames.every(f=>f.cgbPixels&&f.cgbImage)));
 const errors=lib.validate(g).filter(d=>d.severity==='error');assert.deepEqual(errors,[]);return g;
}
module.exports={convert};
if(require.main===module){const original=lib.readGame(root,'touhou-kouma'),before=lib.revision(original),g=convert(original);fs.mkdirSync(path.join(__dirname,'previews'),{recursive:true});
 for(const a of g.assets)for(const f of a.frames){const pixels=lib.colorPreview(g,a,f);fs.writeFileSync(path.join(__dirname,'previews',a.id+'-'+f.id+'.png'),lib.encodeColorPng(a.width,a.height,pixels.map((v,i)=>a.kind==='sprite'&&f.cgbPixels[i]<0?-1:v)));}
 fs.writeFileSync(path.join(root,'.cache/kouma-v21/color-game.json'),JSON.stringify(g));
 fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify({before,after:lib.revision(g),provenance:'AI-assisted recoloring of the existing project artwork. Touhou characters belong to Team Shanghai Alice. No reference ROM material copied.',sources:Object.fromEntries(sources),assets:records},null,2)+'\n');
 if(process.argv.includes('--import')){lib.saveGame(root,'touhou-kouma',g,before);assert.equal(lib.revision(lib.readGame(root,'touhou-kouma')),lib.revision(g));}
 console.log(JSON.stringify({assets:g.assets.length,frames:records.length,revision:lib.revision(g),imported:process.argv.includes('--import')}));
}
