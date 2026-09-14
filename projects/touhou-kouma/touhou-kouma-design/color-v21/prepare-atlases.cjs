// Contact sheets of unchanged v20 sprite pixels, for RGB-only recoloring.
const fs=require('fs'),path=require('path'),lib=require('../../../../editor/build/library.cjs');
const g=lib.readGame(path.resolve(__dirname,'../../../..'),'touhou-kouma');
const characters=new Set(['reimu','marisa','meiling','patchouli','sakuya','remilia','flandre','cirno','rumia']);
for(const kind of ['characters','objects']){
 const entries=g.assets.filter(a=>a.kind==='sprite'&&characters.has(a.id)===(kind==='characters')).flatMap(a=>a.frames.map((f,i)=>({a,f,frame:i}))),w=192,h=Math.ceil(entries.length/4)*48,pixels=Array(w*h).fill(0),records=[];
 entries.forEach(({a,f,frame},n)=>{const x=n%4*48+Math.floor((48-a.width)/2),y=Math.floor(n/4)*48+Math.floor((48-a.height)/2);records.push({asset:a.id,frame,x,y,width:a.width,height:a.height,cell:n});for(let j=0;j<a.height;j++)for(let i=0;i<a.width;i++){const v=f.pixels[j*a.width+i]*85;pixels[(y+j)*w+x+i]=(v<<16)|(v<<8)|v;}});
 const scale=4,large=[];for(let y=0;y<h*scale;y++)for(let x=0;x<w*scale;x++)large.push(pixels[Math.floor(y/scale)*w+Math.floor(x/scale)]);
 fs.writeFileSync(path.join(__dirname,kind+'-source.png'),lib.encodeColorPng(w*scale,h*scale,large));
 fs.writeFileSync(path.join(__dirname,kind+'-atlas.json'),JSON.stringify({width:w,height:h,scale,records},null,2)+'\n');
 console.log(kind,records.map(r=>r.asset+'#'+r.frame).join(', '));
}
for(const s of g.stages){const a=g.assets.find(a=>a.id===s.tileset),w=160,h=256,pixels=[];for(let y=0;y<h*4;y++)for(let x=0;x<w*4;x++){
 const xx=x>>2,yy=y>>2,t=s.tiles[Math.floor(yy/8)*s.width+Math.floor(xx/8)],at=(Math.floor(t/(a.width/8))*8+(yy&7))*a.width+(t%(a.width/8))*8+(xx&7),v=a.frames[0].pixels[at]*85;pixels.push((v<<16)|(v<<8)|v);
 }fs.writeFileSync(path.join(__dirname,s.id+'-source.png'),lib.encodeColorPng(w*4,h*4,pixels));}
