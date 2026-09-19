// Compare captured objects with identical authored data and fixture mainloops.
// node editor/tests/gbc-render-benchmark.mjs OLD_OBJECTS NEW_OBJECTS OLD_ENGINE NEW_ENGINE OUT [scenario,...]
// Each build is a diagnostic ROM, never the production deliverable.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const [oldObjects,newObjects,oldEngine,newEngine,outArg,selected='spread,cluster,moving,guided,graze,burst,bomb']=process.argv.slice(2);
const out=path.resolve(outArg),results=[];
fs.mkdirSync(out,{recursive:true});
function run(script,args,dir){
    const log=fs.openSync(path.join(dir,path.basename(script)+'.log'),'w');
    const r=spawnSync(process.execPath,['editor/tests/'+script,...args],{stdio:['ignore',log,log],windowsHide:true});
    fs.closeSync(log);
    assert.equal(r.status,0,`${script}: see ${dir} (${r.error?.message??'exit '+r.status})`);
}
const read=p=>JSON.parse(fs.readFileSync(path.join(p,'results.json')));
for(const scenario of selected.split(','))for(const character of [0,1]){
    const dir=path.join(out,`${scenario}-${character}`),roms=[],native=[];
    fs.mkdirSync(dir,{recursive:true});
    for(const [name,objects,engine] of [['old',oldObjects,oldEngine],['new',newObjects,newEngine]]){
        const build=path.join(dir,name);fs.mkdirSync(build,{recursive:true});
        run('gbc-runtime-stress.mjs',[objects,build,scenario,String(character),'--engine',engine],build);
        const rom=path.join(build,'touhou-kouma.gb');roms.push(rom);
        const timings=path.join(build,'native');fs.mkdirSync(timings);
        run('gbc-runtime-native-load.mjs',[rom,timings],build);native.push(read(timings));
    }
    // Input source must be identical, not merely labelled with the same scenario.
    assert.equal(fs.readFileSync(path.join(dir,'old/mainloop.c'),'utf8'),fs.readFileSync(path.join(dir,'new/mainloop.c'),'utf8'));
    const parity=path.join(dir,'parity');
    run('gbc-runtime-parity.mjs',[...roms,parity,'fixture',String(character),'6','600'],dir);
    const p=read(parity);
    assert.equal(native[0].inputHash,native[1].inputHash);
    const compact=r=>({romHash:r.romHash,inputHash:r.inputHash,updates:r.updates,frames:r.frames,updatesPerSecond:r.updatesPerSecond,deadlineMisses:r.deadlineMisses,dmaEndMax:r.dmaEndMax,
        bombSustain:r.rows.slice(1).filter((v,i)=>v.bomb&&r.rows[i].bomb).reduce((a,v)=>{const i=r.rows.indexOf(v);a.updates++;a.frames+=(v.frame-r.rows[i-1].frame)&65535;return a;},{updates:0,frames:0})});
    const row={scenario,character,old:compact(native[0]),new:compact(native[1]),parity:{updates:p.summary[0].updates,mismatches:p.mismatches.length,oamMismatches:p.oamMismatches,pixelMismatches:p.pixelMismatches,stateHashes:p.summary.map(r=>r.stateHash),pixelHashes:p.summary.map(r=>r.pixelHash)}};
    results.push(row);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(row));
}
