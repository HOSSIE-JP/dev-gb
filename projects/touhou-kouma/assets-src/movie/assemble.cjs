// Usage: node assemble.cjs PATH_TO_FFMPEG [PATH_TO_FFPROBE]
// Originals are read only. Each complete clip is retimed to exactly 10 seconds.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const ffmpeg=process.argv[2],ffprobe=process.argv[3]||path.join(path.dirname(ffmpeg),'ffprobe.exe');
const dir=__dirname, clips=['01.mp4','02.mp4','03.mp4','04.mp4'];
const probe=file=>JSON.parse(cp.execFileSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',path.join(dir,file)],{encoding:'utf8',windowsHide:true}));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex');
const sources=[...clips,'bgm.mp3'].map(file=>({file,sha256:hash(file),probe:probe(file)}));
const filters=clips.map((file,i)=>`[${i}:v:0]setpts=(PTS-STARTPTS)*10/${sources[i].probe.streams.find(s=>s.codec_type==='video').duration},fps=24,trim=duration=10,setsar=1[v${i}]`);
filters.push('[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]','[4:a:0]apad,atrim=duration=40,asetpts=PTS-STARTPTS[a]');
const args=['-hide_banner','-loglevel','error','-y',...clips.flatMap(f=>['-i',path.join(dir,f)]),'-i',path.join(dir,'bgm.mp3'),'-filter_complex',filters.join(';'),'-map','[v]','-map','[a]','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t','40','-map_metadata','-1','-movflags','+faststart',path.join(dir,'opening-40s.mp4')];
cp.execFileSync(ffmpeg,args,{stdio:'inherit',windowsHide:true});
const output=probe('opening-40s.mp4');
if(output.streams.length!==2||Number(output.format.duration)!==40)throw Error('Expected one video and one BGM stream, 40 seconds');
for(const source of sources)if(hash(source.file)!==source.sha256)throw Error('Original changed: '+source.file);
fs.writeFileSync(path.join(dir,'assembly.json'),JSON.stringify({sources,output:{file:'opening-40s.mp4',sha256:hash('opening-40s.mp4'),probe:output},audioSource:'bgm.mp3 only',ffmpegArguments:args},null,2)+'\n');
console.log('Created opening-40s.mp4: 40 seconds, source video audio excluded.');
