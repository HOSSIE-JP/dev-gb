import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..'),lib=createRequire(import.meta.url)('../build/library.cjs');
const load=()=>lib.readGame(root,'touhou-kouma');

test('retained two-voice result cues can enter the editor without changing their source notation',()=>{
    const g=load(),before=structuredClone(g.musicTracks);
    for(const t of g.musicTracks){const edited=lib.editableMusicTrack(t);assert.deepEqual(lib.musicErrors([edited]),[]);assert.deepEqual(edited.bars.map(b=>b.lead),t.bars.map(b=>b.lead));assert.deepEqual(edited.bars.map(b=>b.bass),t.bars.map(b=>b.bass));}
    assert.deepEqual(g.musicTracks,before);
});

test('sixteen hash-checked UGE songs cover title, seven road/boss pairs and ending; old result cues remain independent',()=>{
    const g=load(),catalog=lib.readProjectMusic(root,g.name);
    assert.equal(g.stageOrder.length,7);assert.equal(catalog.ugeTracks.length,16);
    assert.equal(g.musicUgeTracks.find(t=>t.id===g.music.title).key,'title');
    for(const [i,id] of g.stageOrder.entries()){
        const s=g.stages.find(s=>s.id===id);
        assert.equal(g.musicUgeTracks.find(t=>t.id===s.music).key,`stage${i+1}`);
        assert.equal(g.musicUgeTracks.find(t=>t.id===s.bossMusic).key,`boss${i+1}`);
    }
    assert.equal(g.musicUgeTracks.find(t=>t.id===g.ending.music).key,'ending');
    assert.deepEqual(catalog.tracks.map(t=>t.id),[32,33,34]);
    assert.equal(g.musicTracks.find(t=>t.id===g.music.victory).loop,false);
    const bad=structuredClone(g);bad.bossCelebration=true;bad.music.victory=29;
    assert(lib.validate(bad).some(d=>d.severity==='error'&&d.target==='music'));
});

test('UGE generation is deterministic, checks source hashes, and preserves edited result-song IDs',()=>{
    const g=load(),out=fs.mkdtempSync(path.join(root,'.cache/uge-test-'));
    try{
        const a=path.join(out,'a'),b=path.join(out,'b'),project=path.join(root,'projects',g.name);
        const sources=lib.generateMusic(project,a,undefined,g.musicTracks,g.musicUgeTracks);
        assert.equal(sources.filter(f=>/^caravan_uge_\d+\.c$/.test(f)).length,16);
        lib.generateMusic(project,b,undefined,g.musicTracks,g.musicUgeTracks);
        for(const f of sources)assert.deepEqual(fs.readFileSync(path.join(a,f)),fs.readFileSync(path.join(b,f)));
        const result=g.musicTracks.find(t=>t.id===32);
        assert(fs.readFileSync(path.join(a,'caravan_music_32.c'),'utf8').includes(result.bars[0].lead.join(',')));
        const bad=structuredClone(g.musicUgeTracks);bad[0].ugeSha256='0'.repeat(64);
        assert.throws(()=>lib.generateMusic(project,b,undefined,g.musicTracks,bad),/SHA-256 mismatch/);
        bad[0]=structuredClone(g.musicUgeTracks[0]);bad[0].loopStartRow=0;
        assert.throws(()=>lib.generateMusic(project,b,undefined,g.musicTracks,bad),/Invalid UGE event metadata/);
    }finally{fs.rmSync(out,{recursive:true,force:true});}
});

test('ordinary save/reopen and project-copy retain all UGE sources without a catalogue dependency',()=>{
    const g=load(),out=fs.mkdtempSync(path.join(root,'.cache/uge-copy-'));
    try{
        fs.mkdirSync(path.join(out,'projects',g.name,'assets-src'),{recursive:true});
        fs.cpSync(path.join(root,'projects',g.name,'assets-src/uge-bgm-v2'),path.join(out,'projects',g.name,'assets-src/uge-bgm-v2'),{recursive:true});
        lib.createProject(out,'copied','UGE COPY',g);
        const copy=lib.readGame(out,'copied');copy.stages[0].music=19;
        const before=lib.revision(lib.readGame(out,'copied'));
        lib.saveGame(out,'copied',copy,before);
        const reopened=lib.readGame(out,'copied');assert.equal(reopened.stages[0].music,19);
        assert.deepEqual(reopened.musicUgeTracks,g.musicUgeTracks);
        for(const t of g.musicUgeTracks)for(const f of [t.ugeFile,t.eventFile,t.scoreFile])
            assert.deepEqual(fs.readFileSync(path.join(out,'projects/copied',f)),fs.readFileSync(path.join(root,'projects',g.name,f)));
        assert(!fs.existsSync(path.join(out,'projects/copied/assets-src/uge-bgm-v2/CATALOG.json')));
        fs.cpSync(path.join(root,'engine/caravan/assets-src'),path.join(out,'engine/caravan/assets-src'),{recursive:true});
        assert.equal(lib.generateMusic(path.join(out,'projects/copied'),path.join(out,'generated'),undefined,reopened.musicTracks,reopened.musicUgeTracks).filter(f=>/^caravan_uge_\d+\.c$/.test(f)).length,16);
    }finally{fs.rmSync(out,{recursive:true,force:true});}
});
