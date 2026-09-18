/* Reproducible bounded movie import. Input must already be an approved excerpt.
 * No metadata or frames outside the requested interval enter the project. */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const {PNG}=require('pngjs');
const lib=require('../build/library.cjs');
const [rootArg,name,source,ffmpeg,secondsArg='3.6',outputArg]=process.argv.slice(2);
if(!ffmpeg)throw Error('Usage: node import-startup-movie.cjs ROOT PROJECT INPUT FFMPEG [SECONDS<=40] [OUTPUT_DIRECTORY]');
const root=path.resolve(rootArg),seconds=Number(secondsArg),count=Math.round(seconds*10);
if(!(seconds>=0.1&&seconds<=40&&count>=1&&count<=400))throw Error('Movie duration must be 0.1..40 seconds');
const dir=outputArg?path.resolve(outputArg):path.join(root,'projects',name,'generated','startup-movie');fs.mkdirSync(dir,{recursive:true});
function run(args){cp.execFileSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',windowsHide:true});}
for(const [mode,w,h]of[['cgb',160,96],['dmg',112,64]])run(['-i',source,'-t',String(seconds),'-an','-vf',`fps=10,scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`,'-frames:v',String(count),'-map_metadata','-1',path.join(dir,mode+'-%03d.png')]);
run(['-i',source,'-t',String(seconds),'-vn','-ac','1','-ar','8192','-af','highpass=f=100,lowpass=f=3200','-map_metadata','-1','-f','u8',path.join(dir,'audio.u8')]);
function tiles(p,w,h){const out=[];for(let y=0;y<h;y+=8)for(let x=0;x<w;x+=8)for(let j=0;j<8;j++){let lo=0,hi=0;for(let i=0;i<8;i++){const v=p[(y+j)*w+x+i];lo=(lo<<1)|(v&1);hi=(hi<<1)|(v>>1);}out.push(lo,hi);}return Buffer.from(out).toString('base64');}
const frames=[];
for(let i=1;i<=count;i++){
 const c=PNG.sync.read(fs.readFileSync(path.join(dir,`cgb-${String(i).padStart(3,'0')}.png`)));
 const d=PNG.sync.read(fs.readFileSync(path.join(dir,`dmg-${String(i).padStart(3,'0')}.png`)));
 const rgb=Array.from({length:c.width*c.height},(_,n)=>(c.data[n*4]<<16)|(c.data[n*4+1]<<8)|c.data[n*4+2]);
 const q=lib.quantizeColorTiles(c.width,c.height,rgb),pal=Buffer.alloc(56);
 q.palettes.forEach((v,n)=>pal.writeUInt16LE(v,n*2));
 const gray=Array.from({length:d.width*d.height},(_,n)=>3-Math.round((d.data[n*4]*0.2126+d.data[n*4+1]*0.7152+d.data[n*4+2]*0.0722)/85));
 frames.push({dmg:tiles(gray,d.width,d.height),cgb:tiles(q.pixels,c.width,c.height),attributes:Buffer.from(q.attributes).toString('base64'),palettes:pal.toString('base64')});
 console.log(`Encoded frame ${i}/${count}`);
}
const input=fs.readFileSync(path.join(dir,'audio.u8')),length=Math.ceil(count*6*70224/4194304*8192/32)*16,pcm=Buffer.alloc(length,0x88);
const peak=input.reduce((p,v)=>Math.max(p,Math.abs(v-128)),0),gain=peak?Math.min(8,112/peak):1;
// Stretch the source interval to the exact hardware display interval.
for(let n=0;n<length*2;n++){const sample=input[Math.min(input.length-1,Math.floor(n*input.length/(length*2)))];const value=Math.max(0,Math.min(15,Math.floor((128+(sample-128)*gain)/16)));if(n&1)pcm[n>>1]=(pcm[n>>1]&240)|value;else pcm[n>>1]=(value<<4)|8;}
const game=lib.readGame(root,name),revision=lib.revision(game);game.startupMovie={enabled:true,frames,pcm:pcm.toString('base64')};
lib.saveGame(root,name,game,revision);
fs.writeFileSync(path.join(dir,'encoding.json'),JSON.stringify({source:path.basename(source),sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),seconds,frames:count,displaySeconds:count*6*70224/4194304,cgb:{width:160,height:96,palettes:7},dmg:{width:112,height:64,shades:4},pcm:{sampleRate:8192,bits:4,channels:1,bytes:length,gain}},null,2)+'\n');
