'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseMidi,writeMidi}=require('./midi-lib.cjs');
const {supportPath,sourceEvents,placeBass}=require('./arrange3.cjs');
const {renderMidi}=require('./render3.cjs');
const note=(id,pitch,extra={})=>({id,pitch,track:1,velocity:100,start:0,end:480,qStart:0,qEnd:8,rawDuration:2,...extra});

test('three voices have independent channels, note velocities and note-off times',()=>{
    const song={file:'fixture.mid',rows:16,stepFrames:6,sections:[],lead:[{pitch:72,start:0,end:4,velocity:100}],counter:[{pitch:64,start:2,end:6,velocity:60}],bass:[{pitch:40,start:0,end:8,velocity:80}]};
    const midi=parseMidi(writeMidi(song));assert.equal(midi.tracks.length,4);
    assert.deepEqual(midi.tracks.slice(1).map(t=>t.notes.map(n=>[n.channel,n.pitch,n.velocity,n.start,n.end])),[[[1,72,100,0,480]],[[0,64,60,240,720]],[[2,40,80,0,960]]]);
    assert.equal(midi.warnings.length,0);
});
test('countermelody uses an independent inner voice instead of a louder lead duplicate or low bass',()=>{
    const notes=[note(0,72,{velocity:127}),note(1,64),note(2,40,{velocity:127})];
    const lead=Array(8).fill({pitch:72,sourceNoteIds:[0]}),bass=Array(8).fill({pitch:40});
    const cells=supportPath(notes,0,8,{tracks:{1:1},low:36,high:84,center:64,velocity:20,restMerit:.7},'counter',lead,bass);
    assert(cells.every(n=>n?.id===1));
});
test('bass register transposes a complete phrase and preserves its contour',()=>{
    const source=[{start:0,end:4,pitch:28},{start:4,end:8,pitch:35},{start:8,end:12,pitch:31}],edits=[];
    const moved=placeBass(source.map(n=>({...n})),16,edits,0,0,64);
    assert.deepEqual(moved.map(n=>n.pitch),[40,47,43]);assert(moved.every(n=>n.octave===12));assert.equal(edits.length,1);
});
test('source attacks preserve repeated notes and do not turn an overlap into a second attack',()=>{
    const first=note(0,60,{end:120,qEnd:1}),second=note(1,60,{start:120,end:360,qStart:1,qEnd:3});
    assert.equal(sourceEvents([first,second,second],0).length,2);
    const overlap=note(2,60,{start:0,end:480,qStart:0,qEnd:4});
    assert.equal(sourceEvents([overlap,second,second],0).length,1);
});
test('audition responds to MIDI velocity rather than just increasing the voice count',()=>{
    const song={file:'fixture.mid',rows:16,stepFrames:6,sections:[],lead:[{pitch:72,start:0,end:8,velocity:100}],counter:[],bass:[]};
    const loud=renderMidi(writeMidi(song),.5,.25);song.lead[0].velocity=50;
    const quiet=renderMidi(writeMidi(song),.5,.25);assert(quiet.rms<loud.rms*.7&&quiet.rms>loud.rms*.4);
});
