'use strict';
// Register the reviewed MIDI bytes, not the intermediate audition score.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..'),lib=require(path.join(root,'editor/build/library.cjs'));
const mapping=[[32,33],[30,31],[17,18],[19,20],[21,22],[23,24],[25,26]];
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'arrangements3.json'),'utf8'));
const lock=JSON.parse(fs.readFileSync(path.join(__dirname,'input-lock.json'),'utf8'));
const game=lib.readGame(root,'touhou-kouma'),revision=lib.revision(game),tracks=[];
assert.equal(game.stageOrder.length,7);
for(let stage=0;stage<7;stage++)for(let role=0;role<2;role++){
    const sourceFile=`th06_${String(stage*2+role+2).padStart(2,'0')}.mid`,file=sourceFile.replace('.mid','_gb3.mid');
    const c=config.tracks.find(t=>t.file===sourceFile),bytes=fs.readFileSync(path.join(__dirname,file));
    lib.decodeThreeVoiceMidi(bytes);
    const target=game.stages.find(s=>s.id===game.stageOrder[stage]);
    target[role?'bossMusic':'music']=mapping[stage][role];
    tracks.push({id:mapping[stage][role],stage:stage+1,stageId:target.id,role:role?'boss':'road',file,
        sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sourceFile,sourceSha256:lock.sources[sourceFile],
        title:`th06_${String(stage*2+role+2).padStart(2,'0')} · ${stage+1}面${role?'ボス':'道中'}`,
        duty:c.duty===.5?128:64,counterDuty:c.counter.duty===.5?128:64,wave:0});
}
const manifest={format:'caravan-midi-import-v1',description:'User-selected stage mapping, three-voice audition import. Track 01 is not imported.',
    provenance:lock.provenance,expression:'Pulse velocities map to 12/9-step maxima; wave bass uses 25% below velocity 76 and 50% otherwise. No per-note pitch or time changes.',tracks};
fs.writeFileSync(path.join(__dirname,'import.json'),JSON.stringify(manifest,null,2)+'\n');
game.musicScore='assets-src/midi_gb/import.json';
lib.saveGame(root,'touhou-kouma',game,revision);
assert.equal(lib.readGame(root,'touhou-kouma').musicScore,game.musicScore);
console.log('14 MIDI imports registered; title, ending, result cues and project/save identity retained.');
