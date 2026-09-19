'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseMidi,sha256,round}=require('./midi-lib.cjs');
const {BASE,GENERATED}=require('./arrange3.cjs');
const {renderMidi:renderTwo,wav}=require('./render.cjs');
const RATE=22050;
function blep(t,dt){if(t<dt){t/=dt;return t+t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}return 0;}
function renderMidi(bytes,duty,counterDuty,{solo=false}={}){
    const midi=parseMidi(bytes);assert.equal(midi.tracks.length,4);
    const samples=new Float64Array(Math.round(midi.seconds*RATE));
    for(let voice=0;voice<3;voice++){
        if(solo&&voice!==0)continue;
        for(const n of midi.tracks[voice+1].notes){
            const start=Math.round(midi.secondsAt(n.start)*RATE),end=Math.min(samples.length,Math.round(midi.secondsAt(n.end)*RATE));
            const dt=440*2**((n.pitch-69)/12)/RATE,pulseDuty=voice===0?duty:counterDuty;
            const gain=[.24,.15,.28][voice]*(n.velocity/100)**.9;
            let phase=0;
            for(let i=start;i<end;i++){
                const age=(i-start)/RATE,left=(end-i)/RATE;
                const envelope=Math.min(1,age/.0025,left/.005)*([.74,.34,.68][voice]+[.26,.66,.32][voice]*Math.exp(-age*[8,14,11][voice]));
                const value=voice===2?1-4*Math.abs(phase-.5):(phase<pulseDuty?1:-1)+blep(phase,dt)-blep((phase+1-pulseDuty)%1,dt)-(2*pulseDuty-1);
                samples[i]+=value*envelope*gain;phase+=dt;phase-=Math.floor(phase);
            }
        }
    }
    const pcm=Buffer.alloc(samples.length*2);let peak=0,power=0;
    for(let i=0;i<samples.length;i++){const v=samples[i];peak=Math.max(peak,Math.abs(v));power+=v*v;assert(Math.abs(v)<1,'audio clipping');pcm.writeInt16LE(Math.round(v*32767),i*2);}
    return {pcm,peak:round(peak),rms:round(Math.sqrt(power/samples.length))};
}
function clip(pcm,from,seconds){return Buffer.from(pcm.subarray(Math.round(from*RATE)*2,Math.round((from+seconds)*RATE)*2));}
function matchedExcerpt(pcm){
    let peak=0,power=0;
    for(let i=0;i<pcm.length;i+=2){const v=pcm.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(v));power+=v*v;}
    const rms=Math.sqrt(power/(pcm.length/2)),gain=Math.min(.14/Math.max(.0001,rms),.9/Math.max(.0001,peak)),out=Buffer.alloc(pcm.length),fade=Math.round(RATE*.015);
    for(let i=0;i<pcm.length/2;i++)out.writeInt16LE(Math.round(pcm.readInt16LE(i*2)*gain*Math.min(1,i/fade,(pcm.length/2-1-i)/fade)),i*2);
    return {pcm:out,gain:round(gain),rmsBefore:round(rms)};
}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function playlist(audit,manifest){
    const audio=(label,src)=>`<label>${label}<audio controls preload="none" src="${src}"></audio></label>`;
    const prefix='../../generated/midi_gb3/audition/';
    const cards=audit.tracks.map(t=>{
        const stem=t.file.replace('.mid',''),comparison=manifest.comparisons.find(c=>c.file===t.file);
        return `<article><h2>${esc(t.sourceFile)} <a href="${t.file}" download>3声MIDI</a></h2><p>${t.seconds.toFixed(1)}秒 / ${t.bars}小節 / ${t.bpm.toFixed(2)} BPM</p><p>${esc(comparison.section)}の同じ4小節で比較。${comparison.excerptSeconds.toFixed(2)}秒ずつ、2声 → 0.7秒の間 → 3声。比較音声は音量を揃えています。</p>${audio('2声 → 3声 比較',prefix+stem+'_ab.wav')}${audio('3声版 全曲',prefix+stem+'.wav')}${audio('主旋律のみ（比較区間）',prefix+stem+'_lead.wav')}${audio('ループ境界（末尾4小節 → 冒頭4小節）',prefix+stem+'_loop.wav')}<details><summary>採用区間</summary><ul>${t.sections.map(s=>`<li>${esc(s.name)}${s.hook?'（主題）':''}：元 ${s.sourceStartSeconds.toFixed(2)}–${s.sourceEndSeconds.toFixed(2)}秒</li>`).join('')}</ul></details></article>`;
    }).join('');
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>東方MIDI・3声比較試聴</title><style>body{margin:0;background:#131827;color:#edf0f6;font:16px/1.7 system-ui,sans-serif}main{max-width:1080px;padding:32px 24px 70px;margin:auto}h1{font-size:30px}h2{font-size:20px;margin-top:0}a{color:#ffbba6}header{border-bottom:1px solid #47536c;padding-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-top:26px}article{background:#222a3f;border:1px solid #3c4967;border-radius:10px;padding:22px}label{display:block;margin:12px 0;font-size:14px}audio{display:block;width:100%;margin-top:5px}summary{cursor:pointer}li{margin:6px 0}p{color:#c8d2e6}</style></head><body><main><header><h1>主旋律・副旋律・ベースの3声へ。</h1><p>全15曲の3声改訂版。2声初稿の定型伴奏を外し、副旋律とベースも元MIDIから選び直しています。元ノートを基に強弱と音の切り方を付けました。</p><p>パルス2声＋三角波の簡易合成です。GB実機の録音ではありません。現行ゲームは2声のため、取り込み時に音楽エンジンと効果音の共有処理が必要です。原作録音との一致やループの自然さは聴感確認が残ります。</p>${audio('全15曲・3声ダイジェスト（各8秒、01→15）',prefix+'overview3.wav')}<p><a href="REPORT3.md">3声編曲レポート</a> · <a href="VERIFICATION.md">検証結果</a> · <a href="index.html">2声初稿の全曲</a></p></header><div class="grid">${cards}</div></main><script>document.addEventListener('play',e=>{if(e.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()})},true)</script></body></html>`;
}
function run({check=false}={}){
    const audit=JSON.parse(fs.readFileSync(path.join(BASE,'audit3.json'),'utf8')),twoAudit=JSON.parse(fs.readFileSync(path.join(BASE,'audit.json'),'utf8'));
    const out=path.join(GENERATED,'audition'),manifest={format:'gb3-synthetic-audition-v1',rate:RATE,channels:1,bits:16,isHardwareCapture:false,files:[],comparisons:[],overview:[]},digest=[];
    if(!check)fs.mkdirSync(out,{recursive:true});
    const emit=(name,pcm,details={})=>{const bytes=wav(pcm),hash=sha256(bytes);if(check)assert.equal(sha256(fs.readFileSync(path.join(out,name))),hash,name);else fs.writeFileSync(path.join(out,name),bytes);manifest.files.push({name,sha256:hash,seconds:round(pcm.length/2/RATE),...details});};
    for(const t of audit.tracks){
        const bytes=fs.readFileSync(path.join(BASE,t.file));assert.equal(sha256(bytes),t.outputSha256);
        const rendered=renderMidi(bytes,t.duty,t.counterDuty),stem=t.file.replace('.mid','');
        emit(stem+'.wav',rendered.pcm,{midiSha256:t.outputSha256,peak:rendered.peak,rms:rendered.rms});
        const fourBars=t.seconds/t.bars*4,fourBytes=Math.round(fourBars*RATE)*2;
        emit(stem+'_loop.wav',Buffer.concat([rendered.pcm.subarray(-fourBytes),rendered.pcm.subarray(0,fourBytes)]),{boundarySeconds:round(fourBytes/2/RATE)});
        const hook=t.sections.filter(s=>s.hook).sort((a,b)=>b.rows-a.rows)[0],from=hook.outputRow*t.seconds/t.rows;
        const old=twoAudit.tracks.find(s=>s.sourceFile===t.sourceFile),oldBytes=fs.readFileSync(path.join(BASE,old.file));assert.equal(sha256(oldBytes),old.outputSha256);
        const a=matchedExcerpt(clip(renderTwo(oldBytes,t.duty).pcm,from,fourBars)),b=matchedExcerpt(clip(rendered.pcm,from,fourBars));
        const comparison={file:t.file,section:hook.name,arrangedStartSeconds:round(from),excerptSeconds:round(fourBars),threeVoiceStartSeconds:round(a.pcm.length/2/RATE+.7),twoVoiceGain:a.gain,threeVoiceGain:b.gain};
        manifest.comparisons.push(comparison);emit(stem+'_ab.wav',Buffer.concat([a.pcm,Buffer.alloc(Math.round(.7*RATE)*2),b.pcm]),comparison);
        emit(stem+'_lead.wav',clip(renderMidi(bytes,t.duty,t.counterDuty,{solo:true}).pcm,from,fourBars),{section:hook.name,arrangedStartSeconds:round(from)});
        const excerpt=matchedExcerpt(clip(rendered.pcm,from,8)).pcm;
        manifest.overview.push({file:t.file,overviewStartSeconds:round(digest.reduce((n,p)=>n+p.length/2/RATE,0)),arrangedStartSeconds:round(from),section:hook.name});
        digest.push(excerpt,Buffer.alloc(RATE));
        console.log(`${t.file}: full + loop + matched 2/3-voice comparison + lead; peak ${rendered.peak}`);
    }
    emit('overview3.wav',Buffer.concat(digest.slice(0,-1)),{description:'15 three-voice hook excerpts, 8 seconds each, filename order'});
    const outputs=[[path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n'],[path.join(BASE,'index3.html'),playlist(audit,manifest)]];
    for(const [file,bytes] of outputs){if(check)assert.equal(fs.readFileSync(file,'utf8'),bytes,file);else fs.writeFileSync(file,bytes);}
    console.log(check?'All 61 WAV files and playlist reproduce byte-for-byte.':'61 WAV files and index3.html written.');return manifest;
}
if(require.main===module)run({check:process.argv.includes('--check')});
module.exports={run,renderMidi,matchedExcerpt,playlist};
