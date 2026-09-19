'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseMidi,sha256,round,HZ}=require('./midi-lib.cjs');
const {run:arrange,BASE,ROOT,GENERATED,VOICES}=require('./arrange3.cjs');
const {run:render}=require('./render3.cjs');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
function run(){
    const audit=arrange({check:true}),audio=render({check:true}),score=read(path.join(GENERATED,'score.json')),lock=read(path.join(BASE,'input-lock.json'));
    const expected=Array.from({length:15},(_,i)=>`th06_${String(i+1).padStart(2,'0')}_gb3.mid`);
    assert.deepEqual(fs.readdirSync(BASE).filter(f=>/^th06_\d+_gb3\.mid$/.test(f)).sort(),expected);
    for(const [file,hash] of Object.entries(lock.sources))assert.equal(sha256(fs.readFileSync(path.resolve(BASE,'../midi_org',file))),hash);
    const engineBaselineDifferences=Object.entries(lock.protectedSources).filter(([file,hash])=>sha256(fs.readFileSync(path.join(ROOT,file)))!==hash).map(([file])=>file);
    const checks=[];
    for(const t of audit.tracks){
        const m=parseMidi(fs.readFileSync(path.join(BASE,t.file))),song=score.tracks.find(s=>s.file===t.file);
        const original=parseMidi(fs.readFileSync(path.resolve(BASE,'../midi_org',t.sourceFile))),sourceById=new Map(original.notes.map(n=>[n.id,n]));
        assert.deepEqual(m.meters,[{tick:0,numerator:4,denominator:4}]);
        assert.equal(m.tracks.length,4);assert.equal(m.format,1);assert.equal(m.ppq,480);assert.equal(m.warnings.length,0);
        assert.equal(m.tempos.length,1);assert.equal(m.tempos[0].tick,0);
        assert(Math.abs(m.seconds-t.rows*t.stepFrames/HZ)<.001);assert(Number.isInteger(t.stepFrames*2));
        assert(t.bars<=64&&t.bars===t.rows/16);assert(Math.abs(t.tempoChangePercent)<8);
        if(t.sourceSeconds>=75)assert(t.seconds>=75&&t.seconds<=105);else assert(t.seconds<=t.sourceSeconds+1);
        const markers=m.tracks[0].events.filter(e=>e.type===6);
        assert(markers.some(e=>e.text==='LOOP_START'&&e.tick===0));assert(markers.some(e=>e.text==='LOOP_END'&&e.tick===t.rows*120));
        const active={};const details={};
        for(const [index,voice] of VOICES.entries()){
            const notes=m.tracks[index+1].notes,events=song[voice],grid=song.noteGrid[voice];
            assert.equal(notes.length,events.length);assert.equal(grid.length,t.rows);
            active[voice]=Array(t.rows).fill(null);let end=0,maxGap=0,held=null;
            for(const [i,n] of notes.entries()){
                const e=events[i];assert.equal(n.channel,[1,0,2][index]);assert(n.pitch>=36&&n.pitch<=95);
                assert(n.start>=end&&n.end>n.start);maxGap=Math.max(maxGap,n.start-end);end=n.end;
                assert.equal(n.start%120,0);assert.equal(n.end%120,0);assert(n.velocity>0&&n.velocity<=127);
                assert.equal(n.start,e.start*120);assert.equal(n.end,e.end*120);assert.equal(n.pitch,e.pitch);assert.equal(n.velocity,e.velocity);
                for(const id of e.sourceNoteIds)assert.equal(sourceById.get(id).pitch+e.octave,e.pitch);
                const section=t.sections[e.section],src=sourceById.get(e.sourceNoteIds[0]);
                const onset=Math.round((src.start/original.ppq-section.sourceStartBeat)*t.beatScale*4)+section.outputRow;
                assert(Math.abs(onset-e.start)<=1||e.start===section.outputRow);
                for(let r=e.start;r<e.end;r++){assert.equal(active[voice][r],null);active[voice][r]=n.pitch;}
            }
            for(let row=0;row<t.rows;row++){
                if(grid[row]===0)held=null;else if(grid[row]!==255)held=grid[row]+35;
                else assert(held!==null,'tie without note');
                assert.equal(held,active[voice][row],'explicit rest/tie representation');
            }
            assert(end<=(t.rows-2)*120);assert(new Set(notes.map(n=>n.velocity)).size>=8);
            details[voice]={notes:notes.length,largestRestSeconds:round(maxGap/480*60/t.bpm),velocityRange:[Math.min(...notes.map(n=>n.velocity)),Math.max(...notes.map(n=>n.velocity))]};
        }
        let bassCounterCrossingRows=0,unisonPitchClassRows=0;
        for(let row=0;row<t.rows;row++){
            const l=active.lead[row],c=active.counter[row],b=active.bass[row];
            if(l!==null&&b!==null)assert(b<l,'bass obscures lead');
            if(l!==null&&c!==null)assert(c<l,'counter obscures lead');
            if(b!==null&&c!==null&&b>=c)bassCounterCrossingRows++;
            if(c!==null&&l!==null&&c%12===l%12)unisonPitchClassRows++;
        }
        assert.equal(bassCounterCrossingRows,0);
        // A/B samples use the same melody and section clock; differences are expression and accompaniment.
        const old=parseMidi(fs.readFileSync(path.join(BASE,t.file.replace('_gb3','_gb2'))));
        assert.deepEqual(m.tracks[1].notes.map(n=>[n.pitch,n.start,n.end]),old.tracks[1].notes.map(n=>[n.pitch,n.start,n.end]));
        for(let i=1;i<t.sections.length;i++)if(Math.abs(t.sections[i-1].sourceEndBeat-t.sections[i].sourceStartBeat)>.001){
            const boundary=t.sections[i].outputRow;
            for(const voice of VOICES)assert.equal(active[voice][boundary-1],null,'source splice must release');
        }
        checks.push({file:t.file,bars:t.bars,seconds:t.seconds,sourcePitchAndAttackVerified:true,melodyMatchesTwoVoice:true,voices:details,bassCounterCrossingRows,unisonPitchClassRows,allNotesOffBeforeLoop:true});
    }
    assert.equal(audio.files.length,61);let clipping=false;
    for(const a of audio.files){
        const bytes=fs.readFileSync(path.join(GENERATED,'audition',a.name));assert.equal(sha256(bytes),a.sha256);
        assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.equal(bytes.readUInt32LE(4)+8,bytes.length);
        assert.equal(bytes.readUInt16LE(20),1);assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt32LE(24),22050);assert.equal(bytes.readUInt16LE(34),16);assert.equal(bytes.readUInt32LE(40)+44,bytes.length);
        let peak=0;for(let i=44;i<bytes.length;i+=2)peak=Math.max(peak,Math.abs(bytes.readInt16LE(i)));
        assert(peak>200,'silent preview');clipping||=peak>=32767;
    }
    assert.equal(clipping,false);
    const html=fs.readFileSync(path.join(BASE,'index3.html'),'utf8');assert.equal((html.match(/<article>/g)||[]).length,15);assert.equal((html.match(/<audio /g)||[]).length,61);
    for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g))assert(fs.existsSync(path.resolve(BASE,match[1])),`Missing playlist link ${match[1]}`);
    const validation={format:'gb3-validation-v1',allPassed:true,midiCount:15,audioFiles:61,sourceFilesUnchanged:true,engineBaselineDifferences,byteReproducibility:true,audioClipping:clipping,checks,
        limits:['Musical fidelity and natural loop transitions require listening; provenance checks do not prove melody selection.','No original-game recording comparison.','This MIDI-only check does not test game integration or APU playback; see INTEGRATION.md and the v44 QA report. Physical hardware remains untested.','Local HTML UI was not opened because the browser tool rejected local file URLs.']};
    fs.writeFileSync(path.join(BASE,'validation3.json'),JSON.stringify(validation,null,2)+'\n');
    console.log('PASS: 15 three-voice MIDI, 61 WAV, hashes, source attacks, registers, rests/ties, loops and reproducibility.');return validation;
}
if(require.main===module)run();
module.exports={run};

