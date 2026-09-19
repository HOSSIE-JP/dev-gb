import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const lib=createRequire(import.meta.url)('../build/library.cjs');
function game(){
    const g=lib.readGame(process.cwd(),'touhou-kouma');
    g.timeLimit=false;g.stages.forEach(s=>{s.events=[];s.requireBoss=false;s.clearOnBoss=false;});
    return g;
}
const fire=s=>!!s.beamPattern||s.entities.some(e=>e.kind==='pshot');
test('Touhou uses ten-point grazes and independent focus/fire for both characters',()=>{
    for(const character of [0,1]){
        const g=game();assert.equal(g.graze.score,10);assert.equal(g.player.focusRequiresA,true);
        const s=new lib.Simulation(g,undefined,character);s.step(0);
        const x=s.playerX;s.step(33);assert.equal(s.playerX-x,s.game.player.focusSpeed*16);
        for(let i=0;i<24;i++){s.step(32);assert(!fire(s),'B alone cannot fire, including laser');}
        for(let i=0;i<16;i++)s.step(48);
        assert(fire(s),'adding A to held B fires');assert.equal(s.bombs,2);
        const t=new lib.Simulation(g,undefined,character);t.step(0);
        for(let i=0;i<16;i++)t.step(16);
        assert(fire(t));for(let i=0;i<16;i++)t.step(48);
        assert(fire(t));assert.equal(t.bombs,2,'adding B to held A does not bomb');
        if(character){t.step(32);assert.equal(t.beamPattern,'','releasing A immediately stops laser');}
    }
});
test('fresh chord bombs once; partial releases and held menu input cannot retrigger',()=>{
    const s=new lib.Simulation(game());s.step(48);assert.equal(s.bombs,2,'entry latch');
    s.step(0);s.step(48);assert.equal(s.bombs,1);
    for(let i=0;i<70;i++)s.step(48);assert.equal(s.bombs,1);
    s.step(16);s.step(48);s.step(32);s.step(48);assert.equal(s.bombs,1);
    s.step(0);s.step(48);assert.equal(s.bombs,0);
});
test('legacy focus autofire and B-only bomb controls retain their old behavior',()=>{
    const g=game();delete g.player.focusRequiresA;
    const s=new lib.Simulation(g);s.step(0);for(let i=0;i<16;i++)s.step(32);
    assert(fire(s));s.step(48);assert.equal(s.bombs,1);
    g.player.focusRequiresA=true;g.player.bomb.button='b';
    const t=new lib.Simulation(g);t.step(0);t.step(32);assert.equal(t.bombs,1);
});
