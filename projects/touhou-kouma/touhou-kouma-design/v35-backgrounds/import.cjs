// Reuse authored stage-specific centers and import two preserved ImageGen masters.
// Source PNGs remain immutable. Run against v34 only; game.json is saved via the editor.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'../../../..'),l=require(path.join(root,'editor/build/library.cjs')),{PNG}=require(path.join(root,'editor/node_modules/pngjs'));
const g=l.readGame(root,'touhou-kouma'),rev=l.revision(g),records=[];
assert.equal(rev,'7714f2458c3ead243d950ef67f5d5016d019df6fbcf74cf8b25c860801f617bf','v34 input required');
const old=JSON.parse(execFileSync('git',['show','6cc064af237b2fe3e7529b3604f3e21583ce2069:projects/touhou-kouma/assets-src/game.json'],{cwd:root,maxBuffer:64*1024*1024}));
function tile(src,a,n,x,y){return src[(Math.floor(n/(a.width/8))*8+y)*a.width+(n%(a.width/8))*8+x];}
function downsample(name){const f=path.join(__dirname,'masters',name+'.png'),p=PNG.sync.read(fs.readFileSync(f)),rgb=[],mono=[];for(let y=0;y<32;y++)for(let x=0;x<32;x++){
 const sum=[0,0,0];let n=0;for(let yy=Math.floor(y*p.height/32);yy<Math.floor((y+1)*p.height/32);yy++)for(let xx=Math.floor(x*p.width/32);xx<Math.floor((x+1)*p.width/32);xx++){const i=(yy*p.width+xx)*4;assert.equal(p.data[i+3],255,'opaque terrain');for(let k=0;k<3;k++)sum[k]+=p.data[i+k];n++;}
 const c=sum.map(v=>Math.round(v/n));rgb.push(c[0]*65536+c[1]*256+c[2]);const lum=c[0]*.2126+c[1]*.7152+c[2]*.0722;mono.push(lum<35?0:lum<82?1:lum<150?2:3);
 }return {rgb,mono,file:'masters/'+name+'.png',sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')};}
for(const number of [0,1,2,5,6]){
 const s=g.stages[number],a=g.assets.find(a=>a.id===s.tileset),prior=old.stages.find(p=>p.id===s.id),center=g.assets.find(a=>a.id===prior.tileset),master=number===1?downsample('ice'):number===5?downsample('roof-red'):null;
 const out=structuredClone(a);out.id=a.id.replace('-v34','-v35');out.name=s.name+'・固有地形';out.frames[0].image='images/'+out.id+'.png';out.frames[0].cgbImage='images/'+out.id+'-cgb.png';
 for(let t=0;t<40;t++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
  const i=(Math.floor(t/8)*8+y)*64+(t%8)*8+x;
  if(t<32&&master){const n=t%16,xx=n%4*8+x,yy=Math.floor(n/4)*8+y,j=yy*32+(t<16?xx:31-xx);out.frames[0].pixels[i]=master.mono[j];out.frames[0].cgbPixels[i]=master.rgb[j];}
  if(t>=32){
   if(number===5){const xx=16+((t-32)%2)*8+x,yy=Math.floor((t-32)/4)*8+y,j=yy*32+xx;out.frames[0].pixels[i]=master.mono[j];out.frames[0].cgbPixels[i]=master.rgb[j];}
   else {const n=number===0?prior.tiles[Math.floor((t-32)/4)*prior.width+5+(t-32)%4]:prior.parallax.firstTile+t-32;out.frames[0].pixels[i]=tile(center.frames[0].pixels,center,n,x,y);out.frames[0].cgbPixels[i]=tile(center.frames[0].cgbPixels,center,n,x,y);}
  }
 }
 g.assets.push(out);s.tileset=out.id;
 records.push({stage:number+1,asset:out.id,tiles:40,centerTiles:8,centerSource:number===5?'right roof texture from master':center.id,centerSourceCommit:number===5?null:'6cc064af237b2fe3e7529b3604f3e21583ce2069',master});
}
assert.deepEqual(l.validate(g).filter(d=>d.severity==='error'),[]);l.saveGame(root,'touhou-kouma',g,rev);
fs.writeFileSync(path.join(__dirname,'assets.json'),JSON.stringify({sourceRevision:rev,revision:l.revision(g),records,preservedStages:[4,5],method:'ImageGen opaque masters, 32x32 area reduction; original center tiles copied verbatim for stages 1,2,3,7'},null,2)+'\n');console.log(records.map(r=>[r.stage,r.asset,r.centerSource]));
