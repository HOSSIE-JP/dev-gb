// Original MIT artwork: a portable cartridge with a mint shooting-game craft.
// Code-native pixel artwork keeps the 16px title-bar icon crisp and reproducible.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PNG} from 'pngjs';
const out=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets');
const pixels=Array.from({length:32},()=>Array(32).fill(null));
const rect=(x,y,w,h,c)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)pixels[j][i]=c;};
const polygon=(points,c)=>{for(let y=0;y<32;y++)for(let x=0;x<32;x++){
 let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){
  const [a,b]=points[i],[d,e]=points[j];
  if((b>y+.5)!==(e>y+.5)&&x+.5<(d-a)*(y+.5-b)/(e-b)+a)inside=!inside;
 }if(inside)pixels[y][x]=c;
}};
polygon([[5,1],[27,1],[30,4],[30,26],[25,31],[5,31],[2,28],[2,4]],'#b5a3ff');
polygon([[6,3],[26,3],[28,5],[28,25],[24,29],[6,29],[4,27],[4,5]],'#29364f');
rect(6,6,20,17,'#0d1625');
rect(8,8,2,2,'#ffd082');rect(23,16,1,2,'#b5a3ff');
polygon([[16,7],[20,16],[24,20],[19,20],[17,18],[16,21],[15,18],[13,20],[8,20],[12,16]],'#75ddc4');
polygon([[16,10],[18,16],[16,17],[14,16]],'#f2f5ff');
rect(15,21,2,3,'#ffd082');
rect(7,25,5,1,'#b5a3ff');
for(let x=15;x<25;x+=3)rect(x,26,2,3,'#ffd082');
const png=(size)=>{
 const p=new PNG({width:size,height:size});
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const color=pixels[Math.floor(y*32/size)][Math.floor(x*32/size)];
  const off=(y*size+x)*4;
  if(color){p.data[off]=parseInt(color.slice(1,3),16);p.data[off+1]=parseInt(color.slice(3,5),16);p.data[off+2]=parseInt(color.slice(5,7),16);p.data[off+3]=255;}
 }
 return PNG.sync.write(p);
};
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'caravan-editor.png'),png(256));
const sizes=[16,24,32,48,64,128,256], images=sizes.map(png);
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
sizes.forEach((size,i)=>{const p=6+16*i;header[p]=header[p+1]=size===256?0:size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(images[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=images[i].length;});
fs.writeFileSync(path.join(out,'caravan-editor.ico'),Buffer.concat([header,...images]));
fs.writeFileSync(path.join(out,'caravan-editor.svg'),'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges">'+pixels.flatMap((row,y)=>row.map((c,x)=>c?`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`:'')).join('')+'</svg>\n');
