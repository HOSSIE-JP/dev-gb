'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {parseMidi,writeMidi,sha256,round,HZ,noteName} = require('./midi-lib.cjs');
const {quantize,melodyPath} = require('./analyze.cjs');
const BASE = __dirname, ROOT = path.resolve(BASE,'../../../..');
const GENERATED = path.resolve(BASE,'../../generated/midi_gb');
const read = f => JSON.parse(fs.readFileSync(f,'utf8'));
const json = data => JSON.stringify(data,null,2)+'\n';

function mergeMelodyOptions(a,b={}) { return {...a,...b,tracks:b.tracks??a.tracks}; }
function eventsFromCells(cells, offset, transpose=0) {
    const events=[]; let current=null;
    for(let i=0;i<=cells.length;i++) {
        const n=cells[i]??null, prev=cells[i-1];
        // Preserve deliberately repeated attacks, but merge overlapping duplicate layers.
        const attack=n&&prev&&n.pitch===prev.pitch&&n.id!==prev.id&&n.qStart===offset+i
            && n.start>=prev.end-8 && current && i-current.start>=2;
        if(current&&(!n||n.pitch+transpose!==current.pitch||attack)) { current.end=i;events.push(current);current=null; }
        if(n&&!current)current={start:i,end:null,pitch:n.pitch+transpose,sourceNoteIds:[]};
        if(n&&!current.sourceNoteIds.includes(n.id))current.sourceNoteIds.push(n.id);
    }
    return events;
}

function chordAt(notes,start,end,previousRoot) {
    const chroma=Array(12).fill(0), low=Array(12).fill(0), evidence=[];
    for(const n of notes) {
        const overlap=Math.min(end,n.qEnd)-Math.max(start,n.qStart);
        if(overlap<=0||n.pitch<24||n.pitch>88||n.velocity<38||n.rawDuration<.17)continue;
        const energy=Math.min(overlap,8)*(n.velocity/127)**2;
        chroma[n.pitch%12]+=energy*(n.pitch<60?1:.5);
        if(n.pitch<60) {low[n.pitch%12]+=energy; evidence.push({id:n.id,energy});}
    }
    if(!chroma.some(Boolean))return {root:previousRoot??0,third:3,sourceNoteIds:[],confidence:0};
    let best={score:-Infinity};
    for(let root=0;root<12;root++)for(const third of [3,4]) {
        const score=chroma[root]+.85*chroma[(root+third)%12]+.65*chroma[(root+7)%12]+2.2*low[root]+(root===previousRoot?.15:0);
        if(score>best.score)best={score,root,third};
    }
    return {...best,sourceNoteIds:evidence.sort((a,b)=>b.energy-a.energy).slice(0,6).map(n=>n.id),confidence:round(best.score/chroma.reduce((a,b)=>a+b,0))};
}

function makeBass(notes,start,end,leadCells,style,leadTranspose=0) {
    const result=[],chords=[];let previousRoot;
    for(let bar=start;bar<end;bar+=16) {
        const local=bar-start, cells=leadCells.slice(local,local+16), rests=cells.filter(n=>!n).length;
        const attacks=cells.filter((n,i)=>n&&(i===0||!cells[i-1]||n.pitch!==cells[i-1].pitch)).length;
        const a=chordAt(notes,bar,bar+8,previousRoot),b=chordAt(notes,bar+8,bar+16,a.root);
        previousRoot=b.root;chords.push({row:local,...a},{row:local+8,...b});
        let rhythm;
        if(rests>=4||(style==='flowing'&&attacks<=4))rhythm=[[0,2,0],[2,2,12],[4,2,'third'],[6,2,7],[8,2,0],[10,2,12],[12,2,7],[14,2,'third']];
        else if(style==='driving')rhythm=[[0,2,0],[2,2,12],[4,2,0],[6,2,7],[8,2,0],[10,2,12],[12,2,0],[14,2,7]];
        else if(style==='offbeat')rhythm=[[0,3,0],[4,2,12],[6,2,7],[8,3,0],[12,2,12],[14,2,'third']];
        else if(style==='pedal')rhythm=[[0,6,0],[6,2,7],[8,6,0],[14,2,12]];
        else rhythm=[[0,4,0],[4,2,7],[6,2,'third'],[8,4,0],[12,2,7],[14,2,12]];
        for(const [r,d,interval] of rhythm){
            const chord=r<8?a:b,rawPitch=36+chord.root+(interval==='third'?12+chord.third:interval);
            const crowded=rawPitch>=48&&cells.slice(r,r+d).some(n=>n&&n.pitch+leadTranspose<=rawPitch+3);
            const pitch=rawPitch-(crowded?12:0);
            result.push({start:local+r,end:local+r+d,pitch,registerShift:crowded?-12:0,sourceNoteIds:chord.sourceNoteIds,kind:'revoiced-harmony'});
        }
    }
    return {events:result,chords};
}

function cutNotesAt(events,end) { return events.filter(n=>n.start<end).map(n=>({...n,end:Math.min(end,n.end)})); }
function noteGrid(events,rows) {
    const grid=Array(rows).fill(0);
    for(const note of events){grid[note.start]=note.pitch-35;for(let row=note.start+1;row<note.end;row++)grid[row]=255;}
    return grid;
}
function omittedRanges(sections,sourceEnd) {
    let next=0;const ranges=[];
    for(const s of sections){if(s.sourceStartBeat>next)ranges.push([next,s.sourceStartBeat]);next=Math.max(next,s.sourceEndBeat);}
    if(next<sourceEnd)ranges.push([next,sourceEnd]);return ranges;
}

function arrange(m,c) {
    const q=quantize(m,{beatScale:c.beatScale,phase:c.originBeat*c.beatScale});
    const song={file:c.file.replace('.mid','_gb2.mid'),sourceFile:c.file,stepFrames:c.stepFrames,duty:c.duty,rows:0,lead:[],bass:[],sections:[],chords:[],edits:[]};
    for(const [index,s] of c.sections.entries()) {
        const start=s.startBeat*c.beatScale*4,end=s.endBeat*c.beatScale*4;
        assert(Number.isInteger(start)&&Number.isInteger(end)&&end>start&&(end-start)%16===0);
        assert(c.originBeat+s.endBeat <= m.endTick/m.ppq+.001, `${c.file}: selection exceeds source`);
        const options=mergeMelodyOptions(c.melody,s.melody);
        let cells=melodyPath(q,start,end,options);
        // Only erase short, weak detours returning immediately to the same pitch.
        for(let i=1;i<cells.length-1;i++) {
            const a=cells[i-1],b=cells[i],d=cells[i+1];
            if(a&&b&&d&&a.pitch===d.pitch&&a.pitch!==b.pitch&&b.rawDuration<.3&&b.velocity<a.velocity*.7) {
                cells[i]=null;song.edits.push({section:index,row:song.rows+i,type:'weak-one-row-ornament-omitted',sourceNoteId:b.id});
            }
        }
        const transpose=s.octave??0,lead=eventsFromCells(cells,start,transpose),bass=makeBass(q,start,end,cells,c.bassStyle,transpose);
        for(const n of lead)assert(n.pitch>=36&&n.pitch<=95,'use a phrase octave, never clamp individual notes');
        const section={name:s.name,hook:!!s.hook,outputRow:song.rows,rows:end-start,
            sourceStartBeat:c.originBeat+s.startBeat,sourceEndBeat:c.originBeat+s.endBeat,
            sourceStartSeconds:round(m.secondsAt((c.originBeat+s.startBeat)*m.ppq)),sourceEndSeconds:round(m.secondsAt((c.originBeat+s.endBeat)*m.ppq)),
            octave:transpose,melodyOptions:options};
        const boundary=song.rows,previous=song.sections.at(-1);
        if(previous&&Math.abs(previous.sourceEndBeat-section.sourceStartBeat)>.001){
            // A sixteenth-note breath releases a cut source sustain before the next phrase.
            song.lead=cutNotesAt(song.lead,boundary-1);song.bass=cutNotesAt(song.bass,boundary-1);
            song.edits.push({row:boundary-1,type:'splice-breath',from:previous.name,to:s.name});
        }
        for(const [voice,events] of [['lead',lead],['bass',bass.events]])for(const n of events)song[voice].push({...n,start:n.start+boundary,end:n.end+boundary,section:index});
        song.chords.push(...bass.chords.map(ch=>({...ch,row:ch.row+boundary,section:index})));
        song.sections.push(section);song.rows+=end-start;
    }
    assert(song.rows<=64*16);
    // The lead gets a short breath, while the accompaniment prepares the next tonic.
    song.lead=cutNotesAt(song.lead,song.rows-2);
    song.bass=cutNotesAt(song.bass,song.rows-4);
    const firstRoot=song.chords[0].root,dominant=36+(firstRoot+7)%12;
    song.bass.push({start:song.rows-4,end:song.rows-2,pitch:dominant,sourceNoteIds:[],kind:'loop-turnaround',section:song.sections.length-1});
    song.edits.push({row:song.rows-4,type:'loop-turnaround',bassPitch:dominant,leadReleaseRow:song.rows-2,reason:'2 rows of rest release all voices before the loop; the bass fifth prepares the first root.'});
    song.noteGrid={rest:0,hold:255,pitchOffset:35,lead:noteGrid(song.lead,song.rows),bass:noteGrid(song.bass,song.rows)};
    song.seconds=round(song.rows*c.stepFrames/HZ);song.bpm=round(HZ*15/c.stepFrames);song.bars=song.rows/16;
    song.selectedSourceSeconds=round(song.sections.reduce((sum,s)=>sum+s.sourceEndSeconds-s.sourceStartSeconds,0));
    song.selectedSourceBpm=round(song.rows/4*60/song.selectedSourceSeconds);
    song.tempoChangePercent=round((song.bpm/song.selectedSourceBpm-1)*100);
    song.omittedSource=omittedRanges(song.sections,m.endTick/m.ppq).map(([a,b])=>({startBeat:round(a),endBeat:round(b),startSeconds:round(m.secondsAt(a*m.ppq)),endSeconds:round(m.secondsAt(b*m.ppq))}));
    return song;
}

function validateSong(song,midi,sourceMidi) {
    const m=parseMidi(midi),sourceById=new Map(sourceMidi.notes.map(n=>[n.id,n]));
    assert.equal(m.format,1);assert.equal(m.ppq,480);assert.equal(m.tracks.length,3);assert.equal(m.tempos.length,1);
    assert.equal(m.warnings.length,0);assert.equal(m.endTick,song.rows*120);assert(Math.abs(m.seconds-song.seconds)<.001);
    const proofs=[];
    for(const [i,voice] of [[1,'lead'],[2,'bass']]){
        const notes=m.tracks[i].notes;assert.equal(notes.length,song[voice].length);
        let end=0;
        for(const [index,n] of notes.entries()){
            const expected=song[voice][index];
            assert(n.start>=end,`${voice}: polyphony`);assert(n.end>n.start);assert.equal(n.start%120,0);assert.equal(n.end%120,0);
            assert(n.pitch>=36&&n.pitch<=95);assert.equal(n.channel,i);
            assert.equal(n.pitch,expected.pitch);assert.equal(n.start,expected.start*120);assert.equal(n.end,expected.end*120);end=n.end;
            if(voice==='lead') {
                const section=song.sections[expected.section];
                assert(expected.sourceNoteIds.length>0);
                for(const id of expected.sourceNoteIds){const src=sourceById.get(id);assert(src);assert.equal(src.pitch+section.octave,n.pitch,'melody pitch provenance');}
            }
        }
        assert(end<song.rows*120,'voices must release before loop');
    }
    for(const [index,section] of song.sections.entries())if(section.hook){
        const notes=song.lead.filter(n=>n.section===index);
        assert(notes.length>=4,'hook must retain a real phrase');
        const sourceNotes=notes.map(n=>sourceById.get(n.sourceNoteIds[0]));
        const pitches=sourceNotes.map(n=>n.pitch),rhythm=notes.map(n=>n.start-section.outputRow);
        proofs.push({name:section.name,noteCount:notes.length,octave:section.octave,sourcePitchSha256:sha256(Buffer.from(pitches)),
            outputPitchSha256:sha256(Buffer.from(notes.map(n=>n.pitch-section.octave))),rowOnsetSha256:sha256(Buffer.from(JSON.stringify(rhythm))),
            firstNotes:notes.slice(0,12).map(n=>({pitch:n.pitch,name:noteName(n.pitch),row:n.start-section.outputRow,sourceNoteId:n.sourceNoteIds[0]}))});
    }
    return {format:1,ppq:480,tracks:3,tempoEvents:1,maxSimultaneousNotes:2,noteRange:[Math.min(...m.notes.map(n=>n.pitch)),Math.max(...m.notes.map(n=>n.pitch))],leadNotes:song.lead.length,bassNotes:song.bass.length,allNotesOffBeforeLoop:true,hookProvenance:proofs};
}

function reportText(audit) {
    const lines=['# 東方原作MIDI：GB向け2声アレンジ','',
        '全15曲。主旋律はパルスCH2、伴奏は波形CH3を想定。GM音色は音符確認用です。ゲーム本体への登録・音色調整は行っていません。','',
        '## 一覧','', '|MIDI|元の尺|編曲後|小節|BPM|主旋律 / 伴奏の音数|', '|---|---:|---:|---:|---:|---:|'];
    for(const t of audit.tracks)lines.push(`|[${t.file}](${t.file})|${t.sourceSeconds.toFixed(1)}秒|${t.seconds.toFixed(1)}秒|${t.bars}|${t.bpm.toFixed(2)}|${t.validation.leadNotes} / ${t.validation.bassNotes}|`);
    lines.push('','## 編曲と確認範囲','',
        '- 曲ごとに採用区間、旋律の楽器・音域、オクターブ移動を設定しました。最高音だけを残す方式ではなく、音量、音の長さ、旋律の連続性、区間別の声部指定から単旋律を選びます。',
        '- 伴奏は元MIDIの低音と和声音から和声を推定し、低音、5度、分散和音へ再配置しました。元の全パートの忠実な採譜ではありません。',
        '- 元MIDIにはRipX DAWの生成メタデータ、楽器間の重複、細かい音符の分断、テンポ変動があります。本編曲の「サビ」は譜面上の主題・反復・高音域展開から選定した区間です。原作録音との聴き比べや人によるサビ位置の確認は未実施です。',
        '- 主旋律の各音は元のノートIDへ追跡できます。サビの音高列はオクターブ移動を戻して照合し、発音位置は16分音符の格子へ整理しています。端の音の短縮、弱い装飾音の省略、繋ぎ目の休符は edits に記録しています。',
        '- すべて4/4、1小節16ステップ、64小節以下、音域MIDI 36〜95。各演奏トラックは単音。テンポは現行エンジンの整数／半フレーム刻みに合わせた平均値です。MIDI上では1テンポですが、実機の半フレーム交互再生そのものを再現するものではありません。',
        '- 異なる元区間の接続に16分休符、全曲の末尾に短い低音の折り返しと8分休符を置き、次の先頭へ戻ります。自然さの最終判断は試聴で行ってください。','',
        '## 曲別の採用区間','');
    for(const t of audit.tracks){
        lines.push(`### ${t.sourceFile}`,'',t.editorial,'',`元SHA-256: \`${t.sourceSha256}\``, `MIDI SHA-256: \`${t.outputSha256}\``, '', '|区間|元MIDIの秒範囲|編曲後の小節|役割|', '|---|---|---|---|');
        for(const s of t.sections)lines.push(`|${s.name}|${s.sourceStartSeconds.toFixed(2)}〜${s.sourceEndSeconds.toFixed(2)}秒|${s.outputRow/16+1}〜${(s.outputRow+s.rows)/16}|${s.hook?'優先保持する主題':'導入・展開'}${s.octave?` / ${s.octave>0?'+':''}${s.octave}半音`:''}|`);
        lines.push('',`省略: ${t.omittedSource.map(x=>`${x.startSeconds.toFixed(2)}〜${x.endSeconds.toFixed(2)}秒`).join('、')||'なし'}。`,'');
    }
    lines.push('## 再生成','', 'リポジトリのルートから実行します。元MIDIのハッシュが変わっていた場合は処理を止めます。','',
        '```powershell', '.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/arrange.cjs',
        '.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/render.cjs',
        '.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/verify.cjs',
        '.tools/node/node.exe --test projects/touhou-kouma/assets-src/midi_gb/midi.test.cjs', '```','',
        '`arrangements.json`が曲別設定、`input-lock.json`が原本と保護対象のハッシュ、`audit.json`が出力と検査結果です。中間譜面・ノート由来・試聴WAVは`../../generated/midi_gb/`へ保存します。`arrange.cjs --check`は出力を書き換えず再現性を検査します。','',
        '出典: ユーザー提供の東方原作BGM採譜MIDI。原作の作曲者はZUN / 上海アリス幻樂団。採譜者・採譜ファイルの配布条件は未記載です。元曲・採譜・派生MIDIへこのリポジトリのMIT表記を付け直していません。','');
    return lines.join('\n');
}

function run({check=false}={}) {
    const config=read(path.join(BASE,'arrangements.json')),lock=read(path.join(BASE,'input-lock.json'));
    assert.equal(config.tracks.length,15);assert.equal(new Set(config.tracks.map(c=>c.file)).size,15);
    for(const c of config.tracks){assert(/^th06_(0[1-9]|1[0-5])\.mid$/.test(c.file));assert(c.beatScale===1||c.beatScale===2);assert(c.stepFrames>=1&&c.stepFrames<=60&&Number.isInteger(c.stepFrames*2));}
    const generated=[],outputs=[];const audit={format:'touhou-gb2-arrangement-audit-v1',sourceRevision:lock.sourceRevision,
        provenance:lock.provenance,settingsSha256:sha256(fs.readFileSync(path.join(BASE,'arrangements.json'))),
        checks:{sourceUnchanged:true,engineBaseline:'input-lock.json records the pre-integration engine; it is not a regeneration dependency',midiRoundTrip:true,humanListening:false,originalRecordingComparison:false,gbHardwarePlayback:false,gameIntegration:false},tracks:[]};
    for(const c of config.tracks) {
        const bytes=fs.readFileSync(path.resolve(BASE,config.sourceDirectory,c.file)),inputHash=sha256(bytes);
        assert.equal(inputHash,lock.sources[c.file],`source changed: ${c.file}`);
        const m=parseMidi(bytes);assert.equal(m.warnings.length,0);
        const song=arrange(m,c),midi=writeMidi(song),validation=validateSong(song,midi,m);
        const item={...song,sourceSeconds:round(m.seconds),sourceSha256:inputHash,outputSha256:sha256(midi),editorial:c.editorial,beatScale:c.beatScale,validation};
        generated.push(item);
        const {lead,bass,chords,noteGrid,...summary}=item;audit.tracks.push(summary);
        if(check)assert.equal(sha256(fs.readFileSync(path.join(BASE,song.file))),sha256(midi),`non-reproducible ${song.file}`);
        else outputs.push({file:song.file,bytes:midi});
    }
    const score=json({format:'touhou-gb2-intermediate-v1',noteRepresentation:'absolute MIDI pitches; start/end in sixteenth-note rows, end exclusive',tracks:generated});
    const report=reportText(audit),auditJson=json(audit);
    if(check){assert.equal(fs.readFileSync(path.join(BASE,'audit.json'),'utf8'),auditJson);assert.equal(fs.readFileSync(path.join(BASE,'REPORT.md'),'utf8'),report);assert.equal(fs.readFileSync(path.join(GENERATED,'score.json'),'utf8'),score);}
    else {for(const output of outputs)fs.writeFileSync(path.join(BASE,output.file),output.bytes);fs.mkdirSync(GENERATED,{recursive:true});fs.writeFileSync(path.join(GENERATED,'score.json'),score);fs.writeFileSync(path.join(BASE,'audit.json'),auditJson);fs.writeFileSync(path.join(BASE,'REPORT.md'),report);}
    for(const t of audit.tracks)console.log(`${t.file}: ${t.bars} bars, ${t.seconds.toFixed(3)} s, ${t.bpm.toFixed(2)} BPM, ${t.validation.leadNotes}+${t.validation.bassNotes} notes`);
    console.log(check?'Reproducibility verified; no output modified.':'15 MIDI files and provenance reports written.');
    return audit;
}
if(require.main===module)run({check:process.argv.includes('--check')});
module.exports={arrange,validateSong,run,BASE,ROOT,GENERATED,reportText};
