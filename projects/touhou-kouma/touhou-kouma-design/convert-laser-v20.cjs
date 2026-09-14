// Run from repository root. Hardware conversion only; the original AI master is immutable.
const fs=require('node:fs'),path=require('node:path');
const lib=require('../../../editor/build/library.cjs');
const {PNG}=require('../../../editor/node_modules/pngjs');
const source=PNG.sync.read(fs.readFileSync(path.join(__dirname,'marisa-laser-v20-master.png')));
const pixels=Array.from({length:128},(_,i)=>{
 const x=i%8,y=i>>3,values=[];
 for(let yy=0;yy<8;yy++)for(let xx=0;xx<8;xx++){
  const sx=Math.floor(source.width/2-240+(x+(xx+.5)/8)*60);
  const sy=Math.floor(50+(y+(yy+.5)/8)*(source.height-100)/16);
  values.push(source.data[(sy*source.width+sx)*4]);
 }
 values.sort((a,b)=>a-b);const v=values[57];
 return v<40?0:v>210?1:v>120?2:3;
});
const expected=lib.encodePng(8,16,pixels,true);
const output=path.join(__dirname,'marisa-laser-v20-gb.png');
fs.writeFileSync(output,expected);
console.log(output);
