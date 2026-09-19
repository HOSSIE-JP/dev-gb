'use strict';
// Deterministic, band-limited pulse + triangle audition of the EXPORTED MIDI.
// This is a score audition, not GB APU emulation or a recording of the original.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseMidi,sha256,round}=require('./midi-lib.cjs');
const {BASE,GENERATED}=require('./arrange.cjs');
const RATE=22050;
function blep(t,dt){if(t<dt){t/=dt;return t+t-t*t-1;}if(t>1-dt){t=(t-1)/dt;return t*t+t+t+1;}return 0;}
function renderMidi(bytes,duty){
    const midi=parseMidi(bytes),samples=new Float64Array(Math.round(midi.seconds*RATE));
    for(const [track,voice] of [[midi.tracks[1],0],[midi.tracks[2],1]])for(const n of track.notes){
        const start=Math.round(midi.secondsAt(n.start)*RATE),end=Math.min(samples.length,Math.round(midi.secondsAt(n.end)*RATE));
        const frequency=440*2**((n.pitch-69)/12),dt=frequency/RATE;
        let phase=0;
        for(let i=start;i<end;i++){
            const elapsed=(i-start)/RATE,remaining=(end-i)/RATE;
            const envelope=Math.min(1,elapsed/.003,remaining/.005)*(voice===0?.78+.22*Math.exp(-elapsed*9):.87+.13*Math.exp(-elapsed*16));
            let value;
            if(voice===0){const edge=(phase+1-duty)%1;value=(phase<duty?1:-1)+blep(phase,dt)-blep(edge,dt)-(2*duty-1);}
            else value=1-4*Math.abs(phase-.5);
            samples[i]+=value*envelope*(voice===0?.27:.24);
            phase+=dt;phase-=Math.floor(phase);
        }
    }
    let peak=0,power=0;const pcm=Buffer.alloc(samples.length*2);
    for(let i=0;i<samples.length;i++){const v=samples[i];peak=Math.max(peak,Math.abs(v));power+=v*v;assert(Math.abs(v)<1,'synthesis clipping');pcm.writeInt16LE(Math.round(v*32767),i*2);}
    return {pcm,seconds:samples.length/RATE,peak:round(peak),rms:round(Math.sqrt(power/samples.length))};
}
function wav(pcm){const b=Buffer.alloc(44);b.write('RIFF');b.writeUInt32LE(pcm.length+36,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(RATE,24);b.writeUInt32LE(RATE*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(pcm.length,40);return Buffer.concat([b,pcm]);}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function playlist(audit,manifest){
    const sourceNotes='パルス＋三角波で作った簡易試聴です。元MIDIの音色、実機APU、ゲーム内の効果音との混ざり方は再現していません。サビの選定は譜面上の主題・反復を基にしています。原作録音との比較・人による聴感評価は未実施です。';
    const cards=audit.tracks.map(t=>{
        const stem=t.file.replace('.mid',''),src=`../../generated/midi_gb/audition/${stem}`;
        return `<article><div class="top"><h2>${escapeHtml(t.sourceFile)}</h2><a class="download" href="${stem}.mid" download>MIDI</a></div><p class="facts">${t.seconds.toFixed(1)}秒 · ${t.bars}小節 · ${t.bpm.toFixed(2)} BPM · 2声</p><p>${escapeHtml(t.editorial)}</p><label>全曲<audio controls preload="none" src="${src}.wav"></audio></label><label>ループ境界（末尾4小節 → 先頭4小節）<audio controls preload="none" src="${src}_loop.wav"></audio></label><details><summary>元MIDIから採用した区間</summary><table><thead><tr><th>区間</th><th>元の秒範囲</th><th>編曲後</th></tr></thead><tbody>${t.sections.map(s=>`<tr><td>${s.hook?'<b>主題</b> ':''}${escapeHtml(s.name)}</td><td>${s.sourceStartSeconds.toFixed(1)}–${s.sourceEndSeconds.toFixed(1)}秒</td><td>${s.outputRow/16+1}–${(s.outputRow+s.rows)/16}小節</td></tr>`).join('')}</tbody></table></details></article>`;
    }).join('');
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>東方 MIDI · GB 2声アレンジ</title><style>body{margin:0;background:#121725;color:#e9eaf0;font:16px/1.7 system-ui,sans-serif}main{max-width:1020px;margin:auto;padding:36px 24px 80px}h1{font-size:30px;line-height:1.35;margin:0 0 16px}h2{font-size:21px;margin:0}a{color:#ffc5b8}header{padding:20px 0 30px;border-bottom:1px solid #495065}.eyebrow{color:#ffb39f;letter-spacing:.12em;font-size:13px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-top:24px}article{padding:22px;background:#202638;border:1px solid #394157;border-radius:12px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center}.download{padding:6px 14px;border:1px solid #a5827c;border-radius:6px;text-decoration:none}.facts{color:#b8c7dd;font-size:14px}label{display:block;font-size:13px;color:#c2c9d9;margin:14px 0}audio{display:block;width:100%;margin:6px 0}summary{cursor:pointer;color:#ffc5b8}table{border-collapse:collapse;font-size:12px;width:100%;margin-top:12px}td,th{padding:6px 3px;border-bottom:1px solid #41485c;text-align:left}b{color:#ffb39f}footer{margin-top:24px;color:#b8c7dd;font-size:13px}</style></head><body><main><header><p class="eyebrow">TOUHOU · GAME BOY · MIDI ARRANGEMENTS</p><h1>主旋律と伴奏で残す、15曲。</h1><p>2声／最大64小節。短い曲は原形を保ち、長い曲は主題と展開を残して約90秒へ。</p><p>${sourceNotes}</p><label>全15曲の主題ダイジェスト（各8秒、曲順01→15）<audio controls preload="none" src="../../generated/midi_gb/audition/overview.wav"></audio></label><a href="REPORT.md">編曲・検証レポート</a></header><div class="grid">${cards}</div><footer>試聴音声は書き出したMIDIの音符から生成。22,050 Hz / 16-bit / mono。元MIDIとゲーム本体の音楽データは保持しています。</footer></main><script>document.addEventListener('play',e=>{if(e.target.tagName==='AUDIO')document.querySelectorAll('audio').forEach(a=>{if(a!==e.target)a.pause()})},true)</script></body></html>`;
}

function run({check=false}={}){
    const audit=JSON.parse(fs.readFileSync(path.join(BASE,'audit.json'),'utf8')),config=JSON.parse(fs.readFileSync(path.join(BASE,'arrangements.json'),'utf8'));
    const out=path.join(GENERATED,'audition'),manifest={format:'gb2-synthetic-audition-v1',rate:RATE,channels:1,bits:16,isHardwareCapture:false,files:[],overview:[]},parts=[];
    if(!check)fs.mkdirSync(out,{recursive:true});
    const emit=(name,pcm,details)=>{const bytes=wav(pcm),digest=sha256(bytes);if(check)assert.equal(sha256(fs.readFileSync(path.join(out,name))),digest,`audio mismatch: ${name}`);else fs.writeFileSync(path.join(out,name),bytes);manifest.files.push({name,sha256:digest,seconds:round(pcm.length/2/RATE),...details});};
    for(const t of audit.tracks){
        const bytes=fs.readFileSync(path.join(BASE,t.file));assert.equal(sha256(bytes),t.outputSha256);
        const duty=config.tracks.find(c=>c.file===t.sourceFile).duty,rendered=renderMidi(bytes,duty),stem=t.file.replace('.mid','');
        emit(stem+'.wav',rendered.pcm,{midiSha256:t.outputSha256,peak:rendered.peak,rms:rendered.rms});
        const fourBars=Math.round(t.seconds/t.bars*4*RATE)*2;
        emit(stem+'_loop.wav',Buffer.concat([rendered.pcm.subarray(-fourBars),rendered.pcm.subarray(0,fourBars)]),{boundarySeconds:round(fourBars/2/RATE)});
        const hook=t.sections.filter(s=>s.hook).sort((a,b)=>b.rows-a.rows)[0],from=hook.outputRow*t.seconds/t.rows;
        const begin=Math.round(from*RATE)*2,clip=Buffer.from(rendered.pcm.subarray(begin,begin+8*RATE*2));
        // Fade the digest only; the full song and boundary sample keep exact MIDI timing.
        const fade=Math.round(RATE*.015);for(let i=0;i<fade;i++){const gain=i/fade,j=clip.length/2-1-i;clip.writeInt16LE(Math.round(clip.readInt16LE(i*2)*gain),i*2);clip.writeInt16LE(Math.round(clip.readInt16LE(j*2)*gain),j*2);}
        manifest.overview.push({sourceFile:t.sourceFile,overviewStartSeconds:parts.reduce((s,p)=>s+p.length/2/RATE,0),arrangedStartSeconds:round(from),section:hook.name});
        parts.push(clip,Buffer.alloc(RATE)); // half-second pause between numbered tracks
        console.log(`${stem}: full ${rendered.seconds.toFixed(2)} s + loop boundary, peak=${rendered.peak}`);
    }
    emit('overview.wav',Buffer.concat(parts.slice(0,-1)),{description:'15 excerpts, 8 seconds each, in source filename order'});
    const manifestText=JSON.stringify(manifest,null,2)+'\n',html=playlist(audit,manifest);
    if(check){assert.equal(fs.readFileSync(path.join(out,'manifest.json'),'utf8'),manifestText);assert.equal(fs.readFileSync(path.join(BASE,'index.html'),'utf8'),html);}
    else{fs.writeFileSync(path.join(out,'manifest.json'),manifestText);fs.writeFileSync(path.join(BASE,'index.html'),html);}
    console.log(check?'All 31 WAV files reproduce byte-for-byte.':'31 audition WAV files and index.html written.');return manifest;
}
if(require.main===module)run({check:process.argv.includes('--check')});
module.exports={run,renderMidi,wav,playlist};
