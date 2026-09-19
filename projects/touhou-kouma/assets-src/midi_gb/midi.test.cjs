'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseMidi,writeMidi,midiTrack,sha256,meta}=require('./midi-lib.cjs');
const {arrange,validateSong,BASE,ROOT}=require('./arrange.cjs');
const {melodyPath}=require('./analyze.cjs');

test('SMF reads running status, velocity-zero note off, per-channel same pitch and a tempo change',()=>{
    const header=Buffer.from([77,84,104,100,0,0,0,6,0,0,0,1,1,224]);
    const events=[{tick:0,bytes:[255,81,3,7,161,32]},{tick:0,bytes:[144,60,100]},{tick:0,bytes:[145,60,80]},
        {tick:240,bytes:[60,0]},{tick:480,bytes:[128,60,0]},{tick:480,bytes:[255,81,3,15,66,64]},
        {tick:480,bytes:[144,64,90]},{tick:960,bytes:[64,0]}];
    const m=parseMidi(Buffer.concat([header,midiTrack(events,960)]));
    assert.equal(m.notes.length,3);assert.equal(m.notes[0].end,480);assert.equal(m.notes[1].end,240);assert.equal(m.notes[2].end,960);
    assert.equal(m.seconds,1.5);assert.equal(m.warnings.length,0);
});

test('SMF rejects a truncated file, overlong VLQ and unsupported SMPTE timing',()=>{
    const song={file:'test.mid',rows:16,stepFrames:6,sections:[],lead:[{start:0,end:4,pitch:60}],bass:[]},valid=writeMidi(song);
    assert.throws(()=>parseMidi(valid.subarray(0,-2)));
    const smpte=Buffer.from(valid);smpte.writeUInt16BE(0xe728,12);assert.throws(()=>parseMidi(smpte),/PPQ/);
    const header=valid.subarray(0,14);const badTrack=Buffer.from([77,84,114,107,0,0,0,8,129,129,129,129,129,255,47,0]);assert.throws(()=>parseMidi(Buffer.concat([header,badTrack])),/VLQ/);
});

test('loop MIDI has separate conductor, Unicode markers, rearticulation and all notes off',()=>{
    const s={file:'example.mid',rows:32,stepFrames:5.5,sections:[{outputRow:16,name:'サビ'}],lead:[{start:0,end:8,pitch:72},{start:8,end:12,pitch:72},{start:16,end:30,pitch:76}],bass:[{start:0,end:30,pitch:36}]};
    const m=parseMidi(writeMidi(s));assert.equal(m.tracks.length,3);assert.equal(m.tracks[0].notes.length,0);assert.equal(m.warnings.length,0);
    assert.equal(m.tracks[1].notes.length,3);assert.equal(m.tracks[1].notes[0].end,m.tracks[1].notes[1].start);
    assert(m.tracks[0].events.some(e=>e.type===6&&e.text==='サビ'));assert.equal(m.endTick,3840);
});

test('melody selection follows a connected voice rather than the highest harmonic',()=>{
    const melody=[60,62,64,65].map((pitch,i)=>({id:i,track:1,pitch,velocity:100,qStart:i*4,qEnd:i*4+4,start:i*480,end:i*480+480,rawDuration:1}));
    const harmonic={id:10,track:2,pitch:88,velocity:25,qStart:0,qEnd:16,start:0,end:1920,rawDuration:4};
    const path=melodyPath([...melody,harmonic],0,16,{tracks:{1:1,2:.2},low:55,high:90,center:65});
    assert.deepEqual(path.filter((_,i)=>i%4===0).map(n=>n.pitch),[60,62,64,65]);
});

test('all 15 original MIDI files retain their locked hashes after game integration',()=>{
    // All source hashes are checked against the immutable input lock by the generator.
    const lock=JSON.parse(fs.readFileSync(path.join(BASE,'input-lock.json'),'utf8'));
    assert.equal(Object.keys(lock.sources).length,15);
    for(const [file,hash] of Object.entries(lock.sources))assert.equal(sha256(fs.readFileSync(path.resolve(BASE,'../midi_org',file))),hash);
});

test('all authored source selections obey runtime limits and contain protected hooks',()=>{
    const config=JSON.parse(fs.readFileSync(path.join(BASE,'arrangements.json'),'utf8'));
    for(const c of config.tracks){
        const m=parseMidi(fs.readFileSync(path.resolve(BASE,'../midi_org',c.file))),song=arrange(m,c),bytes=writeMidi(song);
        assert(song.bars<=64);assert(song.sections.some(s=>s.hook));
        validateSong(song,bytes,m);
        assert.deepEqual(bytes,fs.readFileSync(path.join(BASE,song.file)));
    }
});
