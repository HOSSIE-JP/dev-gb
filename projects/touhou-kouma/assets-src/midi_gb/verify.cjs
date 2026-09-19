'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {parseMidi,sha256,round,HZ}=require('./midi-lib.cjs');
const {BASE,ROOT,GENERATED,run:regenerate}=require('./arrange.cjs');
const {run:render}=require('./render.cjs');
const jsonFile=f=>JSON.parse(fs.readFileSync(f,'utf8'));

function verify(){
    const audit=regenerate({check:true}),score=jsonFile(path.join(GENERATED,'score.json')),config=jsonFile(path.join(BASE,'arrangements.json'));
    const actual=fs.readdirSync(BASE).filter(f=>/^th06_\d+_gb2\.mid$/.test(f)).sort();
    assert.deepEqual(actual,audit.tracks.map(t=>t.file).sort());
    const result={format:'gb2-validation-v1',midiCount:15,allPassed:true,checks:[],limits:['No human listening assessment','No comparison with original game recordings','No GB ROM integration or APU/hardware playback']};
    for(const t of score.tracks){
        const midi=parseMidi(fs.readFileSync(path.join(BASE,t.file))),c=config.tracks.find(c=>c.file===t.sourceFile);
        const src=parseMidi(fs.readFileSync(path.resolve(BASE,'../midi_org',t.sourceFile)));
        assert.equal(midi.meters.length,1);assert.equal(midi.meters[0].numerator,4);assert.equal(midi.meters[0].denominator,4);
        assert(t.bars<=64&&Number.isInteger(t.bars));
        if(src.seconds>=75)assert(t.seconds>=75&&t.seconds<=105,'target loop duration');
        else assert(t.seconds<=src.seconds+2,'do not pad short tracks');
        assert(Math.abs(t.tempoChangePercent)<8,'tempo should remain close to selected source');
        const markers=midi.tracks[0].events.filter(e=>e.type===6);
        assert(markers.some(e=>e.text==='LOOP_START'&&e.tick===0));assert(markers.some(e=>e.text==='LOOP_END'&&e.tick===t.rows*120));
        for(const s of t.sections)assert(markers.some(e=>e.text===s.name&&e.tick===s.outputRow*120));
        let largestGap=0,last=0,leaps=0;const melody=midi.tracks[1].notes;
        for(let i=0;i<melody.length;i++){
            const n=melody[i],trace=t.lead[i],section=t.sections[trace.section],originOutput=section.outputRow*120;
            assert(trace.sourceNoteIds.length);
            for(const id of trace.sourceNoteIds){const source=src.notes[id];assert(source);assert.equal(source.pitch,n.pitch-section.octave);}
            const original=src.notes[trace.sourceNoteIds[0]];
            const projected=Math.round((original.start/src.ppq-section.sourceStartBeat)*c.beatScale*4)*120;
            const actualStart=n.start-originOutput;
            if(actualStart!==0)assert(actualStart>=projected-1&&actualStart-projected<=120.01,`${t.file}: melody attack drift exceeds one row`);
            largestGap=Math.max(largestGap,n.start-last);last=n.end;
            if(i&&Math.abs(n.pitch-melody[i-1].pitch)>12)leaps++;
        }
        assert(largestGap/120*c.stepFrames/HZ<3,'unintended long melodic gap');
        const boundary=t.rows*120,tailRows=(boundary-Math.max(...midi.notes.map(n=>n.end)))/120;
        assert.equal(tailRows,2);
        for(const [voice,track] of [['lead',1],['bass',2]]){
            const grid=t.noteGrid[voice];assert.equal(grid.length,t.rows);let held=0;
            for(let row=0;row<t.rows;row++){
                const code=grid[row];assert(code===255||Number.isInteger(code)&&code>=0&&code<=60);
                if(code!==255)held=code?code+35:0;
                else assert(held,'a tie must follow an active note');
                const event=midi.tracks[track].notes.find(n=>n.start<=row*120&&n.end>row*120);
                assert.equal(held,event?.pitch??0,'runtime rest/tie grid agrees with exported MIDI');
            }
        }
        for(let row=0;row<t.rows;row++){
            const lead=midi.tracks[1].notes.find(n=>n.start<=row*120&&n.end>row*120);
            const bass=midi.tracks[2].notes.find(n=>n.start<=row*120&&n.end>row*120);
            if(lead&&bass)assert(bass.pitch<lead.pitch,'accompaniment must not cover the melodic register');
        }
        // At every source splice all sustained notes finish before the next section.
        for(const edit of t.edits.filter(e=>e.type==='splice-breath')){
            const tick=(edit.row+1)*120;assert(!midi.notes.some(n=>n.start<tick&&n.end>tick-120),'hanging note across splice');
        }
        for(const h of t.validation.hookProvenance)assert.equal(h.sourcePitchSha256,h.outputPitchSha256);
        result.checks.push({file:t.file,bars:t.bars,seconds:t.seconds,tempoChangePercent:t.tempoChangePercent,sourcePitchProvenance:true,sourceAttackWithinOneRow:true,
            largestMelodyGapSeconds:round(largestGap/120*c.stepFrames/HZ),octaveLeaps:leaps,loopRestRows:tailRows,hookSections:t.sections.filter(s=>s.hook).length});
    }
    const audio=render({check:true});assert.equal(audio.files.length,31);
    for(const f of audio.files){
        const b=fs.readFileSync(path.join(GENERATED,'audition',f.name));assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.readUInt32LE(4)+8,b.length);assert.equal(b.readUInt16LE(22),1);assert.equal(b.readUInt32LE(24),22050);assert.equal(b.readUInt16LE(34),16);
        let peak=0,sum=0;for(let i=44;i<b.length;i+=2){const s=b.readInt16LE(i);peak=Math.max(peak,Math.abs(s));sum+=s*s;}assert(peak>0&&peak<32767);assert(sum>0);
    }
    result.audioFiles=31;result.audioClipping=false;result.byteReproducibility=true;
    fs.writeFileSync(path.join(BASE,'validation.json'),JSON.stringify(result,null,2)+'\n');
    console.log('PASS: 15 MIDI files, 31 WAV files, source hashes, pitch/onset provenance, durations and loop boundaries.');
    return result;
}
if(require.main===module)verify();
module.exports={verify};
