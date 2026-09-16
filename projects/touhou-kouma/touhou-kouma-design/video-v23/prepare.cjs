// Offline feasibility preview only: does not claim ROM playback.
const crypto=require('crypto');
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const {PNG}=require('../../../../editor/node_modules/pngjs'),{quantizeColorTiles}=require('../../../../editor/build/library.cjs');
const ff=process.argv[2];if(!ff)throw Error('Pass absolute ffmpeg executable path');
const root=path.resolve(__dirname,'../../../..'),cache=path.join(root,'.cache/video-v23'),source=path.join(__dirname,'../pv-v22/touhou-kouma-v22-pv.mp4');
function run(args){const r=spawnSync(ff,['-y','-hide_banner','-loglevel','error',...args],{encoding:'utf8',windowsHide:true,maxBuffer:8e6});if(r.error||r.status)throw Error(r.error?.message||r.stderr);}
for(const d of ['source','cgb','dmg'])fs.mkdirSync(path.join(cache,d),{recursive:true});
run(['-ss','61','-t','14','-i',source,'-c:v','libx264','-crf','18','-c:a','aac',path.join(__dirname,'pv-excerpt-14s.mp4')]);
run(['-ss','61','-t','14','-i',source,'-vf','crop=960:864:480:40,scale=160:144:flags=area,fps=15','-an',path.join(cache,'source/%04d.png')]);
run(['-ss','61','-t','14','-i',source,'-vn','-ar','8000','-ac','1','-c:a','pcm_u8',path.join(cache,'audio.wav')]);
const stats=[];
for(const name of fs.readdirSync(path.join(cache,'source')).filter(x=>x.endsWith('.png')).sort()){
 const png=PNG.sync.read(fs.readFileSync(path.join(cache,'source',name))),rgb=Array.from({length:160*144},(_,i)=>(png.data[i*4]<<16)|(png.data[i*4+1]<<8)|png.data[i*4+2]),q=quantizeColorTiles(160,144,rgb);
 const gray=rgb.map(c=>Math.round((.2126*(c>>16)+.7152*((c>>8)&255)+.0722*(c&255))/85)),cgbTiles=new Set(),dmgTiles=new Set();
 for(let ty=0;ty<18;ty++)for(let tx=0;tx<20;tx++){const c=[],d=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){const i=(ty*8+y)*160+tx*8+x;c.push(q.pixels[i]);d.push(gray[i]);}cgbTiles.add(c.join(''));dmgTiles.add(d.join(''));}
 for(const mode of ['cgb','dmg']){const out=new PNG({width:160,height:144});for(let i=0;i<rgb.length;i++){const c=mode==='cgb'?q.preview[i]:gray[i]*85*0x010101;out.data.set([c>>16,(c>>8)&255,c&255,255],i*4);}fs.writeFileSync(path.join(cache,mode,name),PNG.sync.write(out));}
 stats.push({frame:Number(name.slice(0,4))-1,cgbTiles:cgbTiles.size,dmgTiles:dmgTiles.size,error:q.error});
}
for(const mode of ['cgb','dmg'])run(['-framerate','15','-i',path.join(cache,mode,'%04d.png'),'-i',path.join(cache,'audio.wav'),'-vf','scale=640:576:flags=neighbor','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-c:a','aac','-shortest',path.join(__dirname,mode+'-preview.mp4')]);
for(const mode of ['cgb','dmg'])fs.copyFileSync(path.join(cache,mode,'0170.png'),path.join(__dirname,mode+'-sample.png'));
fs.writeFileSync(path.join(__dirname,'analysis.json'),JSON.stringify({status:'offline feasibility preview, not ROM playback',source,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),start:61,seconds:14,frames:stats.length,fps:15,crop:[480,40,960,864],audio:'8kHz mono preview, original provisional Windows narration',maxCgbTiles:Math.max(...stats.map(x=>x.cgbTiles)),maxDmgTiles:Math.max(...stats.map(x=>x.dmgTiles)),stats},null,2));
console.log('Offline previews complete: '+__dirname);
