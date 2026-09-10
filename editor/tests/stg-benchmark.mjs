// Disposable fixtures, real ROMs and PPU-frame gaps. No gameplay RAM writes.
// node editor/tests/stg-benchmark.mjs ROOT OUTPUT [stress|animation|enemies|boss-0|boss-1|boss-2]
// Optional --dense-baseline changes ONLY the copied legacy enemy-shot cap to 24.
// --cap24 makes a same-load control; --check-budget enforces measured regression ceilings.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {boot,frames,memory,symbols,trace,entityState,simulatedEntities,
    assertPublishedOam,GameBoyMode,PadKey} from './emulator.mjs';

const [rootArg,outArg,caseName='stress',...flags]=process.argv.slice(2);
const root=path.resolve(rootArg), output=path.resolve(outArg);
const lib=createRequire(import.meta.url)(path.join(root,'editor/build/library.cjs'));
const stats=a=>{
    assert.ok(a.length, 'measurement must contain samples');
    const sorted=[...a].sort((a,b)=>a-b), mean=a.reduce((s,n)=>s+n,0)/a.length;
    return {samples:a.length,mean,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),updatesPerSecond:59.7275/mean};
};
fs.mkdirSync(output,{recursive:true});
const fixture=fs.mkdtempSync(path.join(output,'fixture-'));
fs.cpSync(path.join(root,'engine'),path.join(fixture,'engine'),{recursive:true});
// The compiler requires real paths inside the project root.
for(const tool of ['gbdk','misaki']) fs.cpSync(path.join(root,'.tools',tool),path.join(fixture,'.tools',tool),{recursive:true});
if(flags.includes('--dense-baseline')) {
    const file=path.join(fixture,'engine/caravan/runtime.c');
    const text=fs.readFileSync(file,'utf8');
    assert.ok(text.includes('{0, 8, 1, 6, 16, 4}'), 'requires legacy 16-shot runtime');
    fs.writeFileSync(file,text.replace('{0, 8, 1, 6, 16, 4}','{0, 8, 1, 6, 24, 4}'));
}
if(flags.includes('--cap24')) {
    const file=path.join(fixture,'engine/caravan/caravan.h');
    const text=fs.readFileSync(file,'utf8');
    assert.ok(text.includes('#define CE_MAX_ESHOTS 32u'),'requires 32-shot engine');
    fs.writeFileSync(file,text.replace('#define CE_MAX_ESHOTS 32u','#define CE_MAX_ESHOTS 24u'));
    lib.POOL_LIMITS.eshot=24;
}
const isStress=['stress','animation','enemies'].includes(caseName);
const game=lib.readGame(root,isStress?'star-caravan':'nova-spear');
game.stageFade=false;game.timeLimit=false;game.bossCelebration=false;
game.player.invulnerability=1024;game.player.lives=9;
game.stageOrder=[game.stageOrder[0]];
const stage=game.stages[0];stage.duration=60;stage.clearOnBoss=false;stage.requireBoss=false;
if(isStress) {
    const enemy=game.enemies[0], pattern=game.patterns.find(p=>p.asset==='enemy-bullet');
    Object.assign(enemy,{hp:255,pattern:pattern.id,attacks:[]});
    Object.assign(enemy.motion,{kind:'straight',vx:0,vy:0});
    Object.assign(pattern,{kind:'fan',count:8,angle:180,spread:90,speed:.5,interval:64,delay:0,lifetime:384});
    stage.events=[{id:'load',kind:'enemy',ref:enemy.id,frame:0,x:32,y:28,count:3,spacing:48,interval:8,value:0}];
    if(caseName==='enemies') {
        enemy.pattern='';
        stage.events=Array.from({length:12},(_,i)=>({id:`load-${i}`,kind:'enemy',ref:enemy.id,frame:i*8,x:16+(i%6)*24,y:24+Math.floor(i/6)*48,count:1,spacing:0,interval:0,value:0}));
    }
    if(caseName==='animation') {
        for(const [id,durations] of [[enemy.asset,[8,8]],[pattern.asset,[3,7,11]],[game.player.asset,[128,128]]]) {
            const asset=game.assets.find(a=>a.id===id),original=asset.frames[0];
            asset.frames=durations.map((duration,i)=>({...structuredClone(original),id:`anim-${i}`,image:`images/${id}-bench-${i}.png`,duration}));
        }
    }
} else {
    assert.match(caseName,/^boss-[0-2]$/);
    const boss=game.bosses[Number(caseName.at(-1))];
    assert.ok(boss);
    // Exercise phase entry and changes without relying on a human boss clear.
    boss.hp=255;
    for(const phase of boss.phases) if(phase.until==='hp') {phase.until='time';phase.threshold=180;}
    stage.events=[{id:'load',kind:'boss',ref:boss.id,frame:0,x:80,y:-16,count:1,spacing:0,interval:0,value:0}];
}
fs.mkdirSync(path.join(fixture,'projects'));
lib.createProject(fixture,'stg-bench','STG BENCH',game);
const report=flags.includes('--reuse') ? JSON.parse(fs.readFileSync(path.join(output,`${caseName}.json`))) :
    lib.compile(fixture,'stg-bench','Release',()=>{});
if(flags.includes('--reuse')) report.romPath=report.rom;
if(flags.includes('--reuse')) {
    const priorRoot=path.resolve(path.dirname(report.romPath),'../../../..');
    assert.equal(lib.revision(lib.readGame(priorRoot,'stg-bench')),lib.revision(lib.readGame(fixture,'stg-bench')),
        'reused ROM must have identical fixture source');
}
const rom=fs.readFileSync(report.romPath),syms=symbols(report.romPath.replace(/\.gb$/,'.map'));
const results={case:caseName,romSha256:crypto.createHash('sha256').update(rom).digest('hex'),
    fixture:true,rom:report.romPath,ramBytes:report.ramBytes,romBytes:rom.length,modes:[]};
if(flags.includes('--reuse')) assert.equal(results.romSha256,report.romSha256,'reused ROM hash');
for(const mode of [GameBoyMode.Dmg,GameBoyMode.Cgb]) {
    const gb=boot(rom,mode),gaps=[],cycleGaps=[],phases=new Set(),stateHash=crypto.createHash('sha256');
    let previous=0,lastFrame=0,cycles=0,lastCycles=0,peakShots=0,peakEnemies=0,peakEntities=0,peakOam=0,peakScanline=0,checked=0,last;
    const sim=new lib.Simulation(game);
    const parity=!flags.includes('--dense-baseline');
    try {
        frames(gb,240);gb.key_press(PadKey.Start);frames(gb,5);gb.key_lift(PadKey.Start);
        assert.ok(syms._ce_step>0 && syms._ce_step<0x4000, 'nonbanked update entry');
        gb.step_to(syms._ce_step);
        for(let n=0;n<12000;n++) {
            // Stop at the next update entry: the previous pose was rendered,
            // DMA-transferred and published. This avoids missing short seqlock
            // windows, without modifying the ROM or advancing hidden updates.
            cycles+=gb.clock();cycles+=gb.step_to(syms._ce_step);
            const t=trace(gb,syms._ce_trace);
            if(!t||t.scene!==1||t.tick<=previous)continue;
            assert.equal(t.result,0,'fixture must remain in gameplay');
            const frame=gb.ppu_frame();
            if(previous>=120) {assert.equal(t.tick,previous+1,'must observe every measured publication');gaps.push(frame-lastFrame);cycleGaps.push((cycles-lastCycles)/(70224*gb.multiplier()));}
            const entities=entityState(gb,syms._ce_entities,game,(syms._ce_state-syms._ce_entities)/25);
            if(!isStress) {
                const boss=entities.find(e=>e.kind==='boss');
                assert.ok(boss,'boss must remain alive throughout the fixture');
                phases.add(boss.phase);
                if(t.tick>64) assert.ok(boss.y>=0&&boss.y<120*16,'boss battle must remain on screen');
            }
            if(parity) {
                while(sim.tick<t.tick)sim.step(0);
                assert.deepEqual(entities,simulatedEntities(sim),`entity parity at ${t.tick}`);
                assert.equal(t.dropped,sim.dropped&65535);
            }
            assertPublishedOam(gb,syms,game,mode);checked++;
            const {oam}=memory(gb);const lines=Array(144).fill(0);let used=0;
            stateHash.update(JSON.stringify({trace:t,entities,oam:[...oam]}));
            for(let i=0;i<40;i++) {const y=oam[i*4]-16;if(y<=-8||y>=144)continue;used++;
                for(let row=Math.max(0,y);row<Math.min(144,y+8);row++)lines[row]++;}
            peakShots=Math.max(peakShots,entities.filter(e=>e.kind==='eshot').length);
            peakEnemies=Math.max(peakEnemies,entities.filter(e=>e.kind==='enemy').length);
            peakEntities=Math.max(peakEntities,entities.length);
            peakOam=Math.max(peakOam,used);peakScanline=Math.max(peakScanline,...lines);
            previous=t.tick;lastFrame=frame;lastCycles=cycles;last=t;
            if(t.tick>=720)break;
        }
        assert.equal(previous,720,'fixture must complete the measurement range');
        assert.equal(gaps.length,600);
        if(!isStress) assert.equal(phases.size,game.bosses[Number(caseName.at(-1))].phases.length,'all authored phases exercised');
        if(caseName!=='enemies' && isStress && flags.includes('--expect24'))
            assert.equal(peakShots,24,'dense fixture must exercise the 24-shot cap');
        if(caseName!=='enemies' && isStress && flags.includes('--expect32'))assert.equal(peakShots,32,'dense fixture must exercise the 32-shot cap');
        if(caseName==='enemies')assert.equal(peakEnemies,12,'must exercise 12 enemies');
        const elapsed=stats(cycleGaps);
        if(flags.includes('--check-budget')) {
            // Pinned Windows GBDK/Boytacean fixtures, with margin over the measured
            // means. These are regression gates, not a claim of constant 60 Hz.
            const budgets={stress:[3.1,2.1],animation:[4.1,2.1],enemies:[2.1,1.05],
                'boss-0':[1.25,1.05],'boss-1':[1.35,1.05],'boss-2':[1.5,1.05]};
            const budget=budgets[caseName][mode===GameBoyMode.Dmg?0:1];
            assert.ok(elapsed.mean<=budget,`${caseName} mean frame budgets ${elapsed.mean} exceeds ${budget}`);
        }
        results.modes.push({mode:mode===GameBoyMode.Dmg?'DMG':'CGB',gaps:stats(gaps),elapsedFrameBudgets:elapsed,
            peakShots,peakEnemies,peakEntities,peakOam,peakScanline,phases:[...phases],dropped:last.dropped,checked,parity,stateSha256:stateHash.digest('hex')});
    }finally{gb.free();}
}
fs.writeFileSync(path.join(output,`${caseName}.json`),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
