import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..'),require=createRequire(import.meta.url),lib=require('../build/library.cjs');
const base=path.join(root,'projects/touhou-kouma/assets-src/midi_gb'),file=path.join(base,'import.json'),manifest=JSON.parse(fs.readFileSync(file));
const mapping=[[32,33],[30,31],[17,18],[19,20],[21,22],[23,24],[25,26]];

test('project MIDI manifest maps exactly the requested fourteen road/boss tracks; title is retained',()=>{
    const game=lib.readGame(root,'touhou-kouma'),tracks=lib.importMidiMusic(file);
    assert.equal(tracks.length,14);assert.equal(game.musicScore,'assets-src/midi_gb/import.json');
    for(let stage=0;stage<7;stage++)for(let role=0;role<2;role++){
        const s=game.stages.find(s=>s.id===game.stageOrder[stage]),entry=manifest.tracks.find(t=>t.stage===stage+1&&t.role===(role?'boss':'road'));
        assert.equal(s[role?'bossMusic':'music'],mapping[stage][role]);assert.equal(entry.id,mapping[stage][role]);
        assert.equal(entry.file,`th06_${String(stage*2+role+2).padStart(2,'0')}_gb3.mid`);
    }
    assert.deepEqual(game.music,{title:16,boss:18,clear:27,gameover:28,victory:29});
    assert(!tracks.some(t=>t.key==='th06_01_gb3'));
});
test('MIDI import preserves all three note grids and velocities through GB expression quantization',()=>{
    const scores=lib.importMidiMusic(file);
    for(const entry of manifest.tracks){
        const midi=lib.decodeThreeVoiceMidi(fs.readFileSync(path.join(base,entry.file))),song=scores.find(s=>s.id===entry.id);
        assert.equal(song.bars.length,midi.rows/16);assert.equal(song.speed+(song.speedHalf?.5:0),midi.speed);
        for(const [v,voice]of ['lead','counter','bass'].entries()){
            const grid=song.bars.flatMap(b=>b[voice]),expression=song.bars.flatMap(b=>b[['leadEnvelope','counterEnvelope','bassLevel'][v]]);
            assert.equal(grid.filter(n=>n>0&&n<255).length,midi.voices[v].length);
            for(const n of midi.voices[v]){const row=n.start/120;assert.equal(grid[row],n.pitch-35);assert(expression[row]>0);for(let r=row+1;r<n.end/120;r++)assert.equal(grid[r],255);}
            assert.equal(grid.at(-1),0);assert.equal(grid.at(-2),0);
        }
    }
});
test('project overrides leave every unrelated two-voice source and default project score intact',()=>{
    const work=fs.mkdtempSync(path.join(root,'.cache/midi-scope-'));
    try{
        lib.generateMusic(root,path.join(work,'default'));lib.generateMusic(root,path.join(work,'project'),file);
        for(let id=16;id<=37;id++){
            const a=fs.readFileSync(path.join(work,'default',`caravan_music_${id}.c`)),b=fs.readFileSync(path.join(work,'project',`caravan_music_${id}.c`));
            if(manifest.tracks.some(t=>t.id===id))assert(!a.equals(b));else assert.deepEqual(a,b);
        }
    }finally{fs.rmSync(work,{recursive:true,force:true});}
});
test('MIDI import rejects changed bytes and traversal, duplicate IDs and overlapping voice notes',()=>{
    const work=fs.mkdtempSync(path.join(root,'.cache/midi-invalid-'));const first=manifest.tracks[0];
    fs.copyFileSync(path.join(base,first.file),path.join(work,first.file));
    const run=tracks=>{const p=path.join(work,'import.json');fs.writeFileSync(p,JSON.stringify({...manifest,tracks}));return ()=>lib.importMidiMusic(p);};
    try{
        assert.throws(run([{...first,sha256:'0'.repeat(64)}]),/SHA-256/);
        assert.throws(run([{...first,file:'../escape.mid'}]),/filename/);
        assert.throws(run([first,first]),/duplicate/);
        const {writeMidi}=require('../../projects/touhou-kouma/assets-src/midi_gb/midi-lib.cjs');
        const song={file:'bad.mid',rows:16,stepFrames:6,sections:[],lead:[{start:0,end:8,pitch:72}],counter:[{start:0,end:8,pitch:60},{start:4,end:12,pitch:64}],bass:[{start:0,end:8,pitch:40}]};
        assert.throws(()=>lib.decodeThreeVoiceMidi(writeMidi(song)),/overlapping/);
        const game=lib.readGame(root,'touhou-kouma');game.musicScore='../outside.json';assert(lib.validate(game).some(d=>d.severity==='error'&&d.target==='musicScore'));
    }finally{fs.rmSync(work,{recursive:true,force:true});}
});
test('a copied editor project retains its MIDI manifest and exact MIDI payloads',()=>{
    const work=fs.mkdtempSync(path.join(root,'.cache/midi-copy-')),source=path.join(work,'projects/touhou-kouma/assets-src/midi_gb');
    fs.mkdirSync(source,{recursive:true});
    try{
        for(const f of ['import.json',...manifest.tracks.map(t=>t.file)])fs.copyFileSync(path.join(base,f),path.join(source,f));
        const game=lib.readGame(root,'touhou-kouma');lib.createProject(work,'midi-copy','MIDI COPY',game);
        const reopened=lib.readGame(work,'midi-copy'),copied=path.join(work,'projects/midi-copy',reopened.musicScore);
        assert.equal(lib.importMidiMusic(copied).length,14);
        for(const t of manifest.tracks)assert.deepEqual(fs.readFileSync(path.join(path.dirname(copied),t.file)),fs.readFileSync(path.join(base,t.file)));
    }finally{fs.rmSync(work,{recursive:true,force:true});}
});
