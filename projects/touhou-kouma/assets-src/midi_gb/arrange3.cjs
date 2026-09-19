'use strict';
// Three pitched voices. Retain source rhythms instead of synthesizing a generic bass pattern.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseMidi,writeMidi,sha256,round,HZ}=require('./midi-lib.cjs');
const {quantize}=require('./analyze.cjs');
const {arrange:arrangeTwo,BASE,ROOT}=require('./arrange.cjs');
const GENERATED=path.resolve(BASE,'../../generated/midi_gb3');
const VOICES=['lead','counter','bass'];
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const json=x=>JSON.stringify(x,null,2)+'\n';
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

function cellsOf(events,rows){const a=Array(rows).fill(null);for(const n of events)for(let r=n.start;r<n.end;r++)a[r]=n;return a;}

function supportPath(notes,start,end,options,role,lead,bass=[]){
    const candidates=notes.filter(n=>n.qEnd>start&&n.qStart<end&&n.pitch>=options.low&&n.pitch<=options.high&&n.velocity>=options.velocity&&n.rawDuration>=.13&&(options.tracks[n.track]??0)>0);
    let prev=[{n:null,cost:0,prev:null}];
    for(let row=start;row<end;row++){
        const l=lead[row-start],b=bass[row-start],byPitch=new Map();
        for(const n of candidates){
            if(n.qStart>row||n.qEnd<=row)continue;
            if(l?.sourceNoteIds.includes(n.id))continue;
            if(role==='counter'&&((l&&n.pitch>=l.pitch)||(b&&n.pitch<=b.pitch)))continue;
            const merit=(options.tracks[n.track]??0)+n.velocity/127;
            if(!byPitch.has(n.pitch)||merit>byPitch.get(n.pitch).merit)byPitch.set(n.pitch,{n,merit});
        }
        const states=[];
        for(const n of [null,...[...byPitch.values()].map(x=>x.n)]){
            let winner;
            for(const p of prev){
                const same=n&&p.n&&n.pitch===p.n.pitch;
                if(n&&!same&&n.qStart<row-1&&row!==start)continue;
                let cost=p.cost+(n?1.25*n.velocity/127+1.1*options.tracks[n.track]-.025*Math.abs(n.pitch-options.center):options.restMerit);
                if(n){
                    if(n.qStart===row)cost+=.32;
                    if(n.rawDuration<.23)cost-=.35;
                    if(same)cost+=.16;
                    else if(p.n)cost-=Math.abs(n.pitch-p.n.pitch)*.07;
                    if(role==='counter'){
                        if(l&&n.pitch%12===l.pitch%12)cost-=1.8;
                        if(l&&n.pitch>=l.pitch)cost-=.9;
                        if(b&&n.pitch<=b.pitch)cost-=1.2;
                        if(b&&n.pitch%12===b.pitch%12)cost-=.5;
                        if(!l)cost+=.25;
                    }
                }else if(p.n&&p.n.qEnd>row)cost-=.28;
                if(!winner||cost>winner.cost)winner={n,cost,prev:p};
            }
            if(winner)states.push(winner);
        }
        prev=states;
    }
    let winner=prev.reduce((a,b)=>a.cost>b.cost?a:b);const cells=[];
    while(winner.prev){cells.push(winner.n);winner=winner.prev;}
    return cells.reverse();
}

function sourceEvents(cells,sourceStart){
    const events=[];let current;
    for(let row=0;row<=cells.length;row++){
        const n=cells[row],p=cells[row-1];
        const repeat=n&&p&&n.pitch===p.pitch&&n.id!==p.id&&n.qStart===sourceStart+row&&n.start>=p.end-8;
        if(current&&(!n||n.pitch!==current.pitch||repeat)){current.end=row;events.push(current);current=null;}
        if(n&&!current)current={start:row,end:null,pitch:n.pitch,sourcePitch:n.pitch,sourceNoteIds:[]};
        if(n&&!current.sourceNoteIds.includes(n.id))current.sourceNoteIds.push(n.id);
    }
    return events;
}

function placeBass(events,rows,edits,section,offset,phraseRows){
    // One octave choice for each four-bar phrase, never a modulo/clamp per note.
    for(let start=0;start<rows;start+=phraseRows){
        const group=events.filter(n=>n.start>=start&&n.start<start+phraseRows);if(!group.length)continue;
        let best;
        for(const shift of [-24,-12,0,12,24]){
            if(group.some(n=>n.pitch+shift<36||n.pitch+shift>95))continue;
            const cost=group.reduce((s,n)=>s+Math.abs(n.pitch+shift-45)+Math.max(0,n.pitch+shift-60)*3,0);
            if(!best||cost<best.cost)best={shift,cost};
        }
        assert(best,'No phrase octave fits GB range');
        for(const n of group){n.pitch+=best.shift;n.octave=best.shift;}
        if(best.shift)edits.push({type:'bass-phrase-octave',section,row:offset+start,rows:Math.min(phraseRows,rows-start),semitones:best.shift});
    }
    return events;
}

function expression(note,voice,config,sourceById,section,leadCells){
    const sources=note.sourceNoteIds.map(id=>sourceById.get(id));
    const raw=sources.reduce((s,n)=>s+n.velocity,0)/sources.length;
    const [low,high]=config.expression[voice];
    const beat=note.start%16,accent=beat===0?5:beat===8?3:beat%4===0?1:-2;
    const hook=section.hook?config.expression.hookAccent:0;
    let v=voice==='lead'?65+raw*.29:voice==='counter'?36+raw*.31:48+raw*.35;
    if(voice==='counter'&&!leadCells[note.start])v+=7;
    note.velocity=Math.round(clamp(v+accent+hook,low,high));
    note.sourceVelocity=round(raw);
}

function cut(events,end){return events.filter(n=>n.start<end).map(n=>({...n,end:Math.min(end,n.end)}));}
function grid(events,rows){const a=Array(rows).fill(0);for(const n of events){a[n.start]=n.pitch-35;for(let i=n.start+1;i<n.end;i++)a[i]=255;}return a;}

function arrange(m,c,phraseRows=64){
    const original=arrangeTwo(m,{...c,bassStyle:'pedal'});
    const song={...original,file:c.file.replace('.mid','_gb3.mid'),counter:[],bass:[],edits:original.edits.filter(e=>e.type!=='loop-turnaround'),version:3};
    delete song.chords;delete song.noteGrid;
    const q=quantize(m,{beatScale:c.beatScale,phase:c.originBeat*c.beatScale}),sourceById=new Map(m.notes.map(n=>[n.id,n]));
    const leadCells=cellsOf(song.lead,song.rows);
    for(const [index,section] of song.sections.entries()){
        const s=c.sections[index],start=s.startBeat*c.beatScale*4,end=s.endBeat*c.beatScale*4,offset=section.outputRow,rows=section.rows;
        const lead=leadCells.slice(offset,offset+rows);
        let bass=sourceEvents(supportPath(q,start,end,{...c.bass,...s.bass},'bass',lead),start);
        bass=placeBass(bass,rows,song.edits,index,offset,phraseRows);
        const counter=sourceEvents(supportPath(q,start,end,{...c.counter,...s.counter},'counter',lead,cellsOf(bass,rows)),start);
        for(const [voice,events] of [['bass',bass],['counter',counter]]){
            for(const n of events){
                n.start+=offset;n.end+=offset;n.section=index;n.octave??=0;n.kind='source-voice';
                // Shortening is intentional articulation; pitch and attack are retained.
                if(voice==='counter'&&n.end-n.start>=3&&n.end-n.start<=8){
                    n.end--;song.edits.push({type:'counter-release',row:n.end,sourceNoteIds:n.sourceNoteIds});
                }
                song[voice].push(n);
            }
        }
        const previous=song.sections[index-1];
        if(previous&&Math.abs(previous.sourceEndBeat-section.sourceStartBeat)>.001){
            for(const voice of ['bass','counter'])song[voice]=song[voice].filter(n=>n.section===index||n.start<offset-1).map(n=>n.section===index?n:{...n,end:Math.min(n.end,offset-1)});
        }
    }
    // Preserve the source bass cadence instead of injecting a guessed dominant.
    for(const voice of VOICES){
        song[voice]=cut(song[voice],song.rows-2);
        for(const n of song[voice]){
            if(voice==='lead'){n.octave=song.sections[n.section].octave;n.sourcePitch=n.pitch-n.octave;n.kind='source-voice';}
            expression(n,voice,c,sourceById,song.sections[n.section],leadCells);
        }
    }
    song.edits.push({type:'loop-release',row:song.rows-2,reason:'Two rest rows release all three voices; retain the selected source cadence.'});
    song.noteGrid={rest:0,hold:255,pitchOffset:35,...Object.fromEntries(VOICES.map(v=>[v,grid(song[v],song.rows)]))};
    song.counterDuty=c.counter.duty;
    return song;
}

function validate(song,bytes,source,c){
    const m=parseMidi(bytes),src=new Map(source.notes.map(n=>[n.id,n]));
    assert.equal(m.format,1);assert.equal(m.ppq,480);assert.equal(m.tracks.length,4);assert.equal(m.tempos.length,1);assert.equal(m.warnings.length,0);
    assert.equal(m.endTick,song.rows*120);assert(song.bars<=64);assert(Math.abs(m.seconds-song.seconds)<.001);
    const result={format:1,ppq:480,tracks:4,voices:{},allSourcePitchesVerified:true,attackToleranceRows:1,hookProofs:[]};
    for(const [i,voice] of VOICES.entries()){
        const notes=m.tracks[i+1].notes,expected=song[voice];assert.equal(notes.length,expected.length);assert(notes.length>=16);
        let end=0;const velocities=new Set();
        for(const [j,n] of notes.entries()){
            const e=expected[j],section=song.sections[e.section];
            assert.equal(n.channel,[1,0,2][i]);assert(n.start>=end&&n.end>n.start);end=n.end;
            assert.equal(n.start%120,0);assert.equal(n.end%120,0);assert(n.pitch>=36&&n.pitch<=95);
            assert.equal(n.pitch,e.pitch);assert.equal(n.start,e.start*120);assert.equal(n.end,e.end*120);assert.equal(n.velocity,e.velocity);velocities.add(n.velocity);
            assert(e.sourceNoteIds.length>0);
            for(const id of e.sourceNoteIds)assert.equal(src.get(id).pitch+e.octave,n.pitch,'pitch changed beyond phrase octave');
            const sourceRow=Math.round((src.get(e.sourceNoteIds[0]).start/source.ppq-section.sourceStartBeat)*c.beatScale*4)+section.outputRow;
            assert(Math.abs(e.start-sourceRow)<=1||e.start===section.outputRow,'late source attack');
        }
        assert(end<=(song.rows-2)*120);assert(velocities.size>=8,'expression must not collapse to a constant');
        result.voices[voice]={notes:notes.length,range:[Math.min(...notes.map(n=>n.pitch)),Math.max(...notes.map(n=>n.pitch))],velocityRange:[Math.min(...velocities),Math.max(...velocities)],distinctVelocities:velocities.size,maxPolyphony:1};
    }
    for(const [i,s] of song.sections.entries())if(s.hook){
        const ns=song.lead.filter(n=>n.section===i);assert(ns.length>=4);
        const sourcePitches=ns.map(n=>src.get(n.sourceNoteIds[0]).pitch),pitches=ns.map(n=>n.pitch-n.octave);
        assert.deepEqual(sourcePitches,pitches);
        result.hookProofs.push({name:s.name,noteCount:ns.length,sourcePitchSha256:sha256(Buffer.from(sourcePitches)),outputPitchSha256:sha256(Buffer.from(pitches)),onsetRows:ns.map(n=>n.start-s.outputRow)});
    }
    return result;
}

function report(audit){
    const lines=['# 東方MIDI・GB向け3声アレンジ','',
        '2声初稿への「音が平坦」という指摘を受けて改訂。CH2主旋律、CH1副旋律／和声、CH3ベースを想定しています。現行ゲームは2声再生のため、3声MIDIを取り込む際には再生処理・譜面形式・効果音の割り当ての変更が必要です。今回はゲームを変更していません。','',
        '## 変更点と確認範囲','',
        '- 初稿の伴奏に使った定型パターンと推定和音による音の生成を外しました。副旋律とベースも元MIDIのノートから独立して選定し、各音の出典ID、音高、発音位置を記録しています。',
        '- 主旋律の採用区間と音列の骨格は2声版を引き継ぎ、元の音量、拍、主題の位置から強弱を付けました。副旋律は主旋律との重複を避け、休符では前へ出し、短い音の語尾に休符を設けています。',
        '- ベースの音域変更は4小節のまとまりごとのオクターブ移動です。各音を個別に範囲へ折り畳んでいません。曲末は元のベース進行を保ち、全声を2ステップ前に解放します。',
        '- 主旋律と伴奏の音高・発音位置の元MIDI照合は機械的な照合です。元MIDIには採譜の重複・分断があり、原作録音との一致、サビ位置の音楽的な正しさ、聴感・接続の自然さは人による確認が残ります。',
        '- 強弱を持つMIDIと簡易合成試聴を作成しました。現行エンジンはMIDI velocityをそのまま再生できません。GB実機の音量・音色・効果音との競合は次工程です。','',
        '## 一覧','', '|MIDI|元の尺|編曲後|小節|BPM|CH2 / CH1 / CH3 音数|','|---|---:|---:|---:|---:|---:|'];
    for(const t of audit.tracks)lines.push(`|[${t.file}](${t.file})|${t.sourceSeconds.toFixed(1)}秒|${t.seconds.toFixed(1)}秒|${t.bars}|${t.bpm.toFixed(2)}|${VOICES.map(v=>t.validation.voices[v].notes).join(' / ')}|`);
    lines.push('','## 曲別の区間・出典','');
    for(const t of audit.tracks){
        lines.push(`### ${t.sourceFile}`,'',t.editorial,'',t.voiceEditorial,'',`元SHA-256: \`${t.sourceSha256}\``,`3声MIDI SHA-256: \`${t.outputSha256}\``,
            `テンポ: ${t.stepFrames} VBlank/step、${t.bpm.toFixed(6)} BPM。選択した元区間の平均から${t.tempoChangePercent.toFixed(2)}%。`,'',
            '|区間|元MIDIの秒範囲|出力小節|主題優先|','|---|---|---|---|');
        for(const s of t.sections)lines.push(`|${s.name}|${s.sourceStartSeconds.toFixed(2)}〜${s.sourceEndSeconds.toFixed(2)}秒|${s.outputRow/16+1}〜${(s.outputRow+s.rows)/16}|${s.hook?'はい':'—'}|`);
        lines.push('',`省略: ${t.omittedSource.map(s=>`${s.startSeconds.toFixed(2)}〜${s.endSeconds.toFixed(2)}秒`).join('、')||'なし'}。`,'');
    }
    lines.push('## 再生成','', '```powershell','.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/arrange3.cjs','.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/render3.cjs','.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/verify3.cjs','```','',
        '`arrangements3.json`は曲別設定、`audit3.json`は照合と区間、`../../generated/midi_gb3/score.json`は休符0・タイ255・音高MIDI番号−35の3声譜面と全音符の由来です。`input-lock.json`の元MIDI15曲を保持しています。音声・中間データはgeneratedに置いています。','',
        '出典: ユーザー提供の東方原作BGM採譜MIDI。元MIDIにはRipX DAWのメタデータがあります。原作作曲者はZUN / 上海アリス幻樂団。採譜者・配布条件は未記載。原曲・採譜・派生物へリポジトリのMITライセンスを付け直していません。','');
    return lines.join('\n');
}

function run({check=false}={}){
    const config=read(path.join(BASE,'arrangements3.json')),lock=read(path.join(BASE,'input-lock.json'));
    assert.equal(config.tracks.length,15);
    const audit={format:'touhou-gb3-arrangement-audit-v1',settingsSha256:sha256(fs.readFileSync(path.join(BASE,'arrangements3.json'))),provenance:lock.provenance,
        checks:{sourceUnchanged:true,midiRoundTrip:true,sourcePitchesAndAttacks:true,humanListening:false,gameIntegration:false,gbHardwarePlayback:false},tracks:[]},songs=[],outputs=[];
    for(const c of config.tracks){
        const input=fs.readFileSync(path.resolve(BASE,config.sourceDirectory,c.file));assert.equal(sha256(input),lock.sources[c.file]);
        const source=parseMidi(input);assert.equal(source.warnings.length,0);
        const song=arrange(source,c,config.phraseRows),bytes=writeMidi(song),validation=validate(song,bytes,source,c);
        const item={...song,beatScale:c.beatScale,sourceSeconds:round(source.seconds),sourceSha256:sha256(input),outputSha256:sha256(bytes),editorial:c.editorial,voiceEditorial:c.voiceEditorial,validation};
        songs.push(item);const {lead,counter,bass,noteGrid,...summary}=item;audit.tracks.push(summary);outputs.push([path.join(BASE,song.file),bytes]);
    }
    outputs.push([path.join(BASE,'audit3.json'),json(audit)],[path.join(BASE,'REPORT3.md'),report(audit)],[path.join(GENERATED,'score.json'),json({format:'touhou-gb3-intermediate-v1',tracks:songs})]);
    if(!check)fs.mkdirSync(GENERATED,{recursive:true});
    for(const [file,bytes] of outputs){if(check)assert.equal(sha256(fs.readFileSync(file)),sha256(bytes),file);else fs.writeFileSync(file,bytes);}
    for(const t of audit.tracks)console.log(`${t.file}: ${t.bars} bars ${t.seconds.toFixed(2)}s notes ${VOICES.map(v=>t.validation.voices[v].notes).join('/')} velocity ranges ${VOICES.map(v=>t.validation.voices[v].velocityRange.join('-')).join('/')}`);
    console.log(check?'3-voice MIDI, score and reports reproduce byte-for-byte.':'15 three-voice MIDI files written.');return audit;
}
if(require.main===module)run({check:process.argv.includes('--check')});
module.exports={run,arrange,validate,supportPath,sourceEvents,placeBass,BASE,ROOT,GENERATED,VOICES};
