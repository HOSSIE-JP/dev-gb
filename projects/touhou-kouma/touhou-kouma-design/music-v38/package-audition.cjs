// Encode listening copies from actual APU capture, never from MIDI synthesis.
// node .../package-audition.cjs .cache/kouma-v38/music
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const source=path.resolve(process.argv[2]),out=path.join(__dirname,'audition'),audit=require('./audit.json'),score=require('./score.json');
fs.mkdirSync(out,{recursive:true});
const ffmpeg=(args)=>{const r=cp.spawnSync('ffmpeg',['-y','-hide_banner','-loglevel','error',...args],{encoding:'utf8',windowsHide:true});if(r.error)throw r.error;if(r.status)throw Error(r.stderr);};
const files=[];
for(const a of [...audit].sort((a,b)=>a.stage-b.stage||+(a.role==='boss')-+(b.role==='boss'))){
 const t=score.tracks.find(t=>t.id===a.id),input=path.join(source,`${t.id}-${t.key}.wav`),name=`stage-${a.stage}-${a.role}.mp3`,file=path.join(out,name);
 ffmpeg(['-i',input,'-c:a','libmp3lame','-b:a','128k','-metadata',`title=Stage ${a.stage} ${a.role}: ${t.title}`,'-metadata','album=東方 紅魔巡礼 GB v38',file]);
 files.push({stage:a.stage,role:a.role,id:a.id,file:name,seconds:t.seconds,bpm:t.bpm,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
}
// Six seconds each in stage order: road, boss, road, boss... 84 seconds total.
const args=files.flatMap(f=>['-i',path.join(out,f.file)]),filters=files.map((_,i)=>`[${i}:a]atrim=start=8:duration=6,asetpts=PTS-STARTPTS,afade=t=in:d=0.03,afade=t=out:st=5.8:d=0.2[a${i}]`);
filters.push(files.map((_,i)=>`[a${i}]`).join('')+`concat=n=${files.length}:v=0:a=1[out]`);
ffmpeg([...args,'-filter_complex',filters.join(';'),'-map','[out]','-c:a','libmp3lame','-b:a','160k',path.join(out,'v38-stage-boss-preview.mp3')]);
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({source:'CGB music-only GBDK ROM actual APU capture, amplitude normalized; no SFX. MIDI is not used.',preview:'v38-stage-boss-preview.mp3',previewSegments:files.map((f,i)=>({at:i*6,stage:f.stage,role:f.role})),files},null,2)+'\n');
console.log('Encoded 14 full tracks and an 84-second stage/boss sampler.');
