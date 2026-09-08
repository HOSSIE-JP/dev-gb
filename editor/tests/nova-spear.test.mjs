import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lib = createRequire(import.meta.url)("../build/library.cjs");
const authored = () => lib.readGame(root, "nova-spear");

function emptyArena() {
    const game = structuredClone(authored());
    game.stages = [game.stages[0]];
    game.stageOrder = [game.stages[0].id];
    game.startStage = game.stages[0].id;
    game.stages[0].events = [];
    game.stages[0].walls.fill(0);
    game.stages[0].duration = 20;
    game.stages[0].requireBoss = false;
    return game;
}

test("NOVA SPEAR campaign has three reachable, distinct boss encounters before their deadlines", () => {
    const game = authored();
    assert.deepEqual(lib.validate(game).filter((d) => d.severity === "error"), []);
    assert.equal(game.mode, "campaign");
    assert.equal(game.stageOrder.length, 3);
    assert.deepEqual(new Set(game.stageOrder), new Set(game.stages.map((s) => s.id)));
    assert.equal(new Set(game.stages.map((s) => s.tileset)).size, 3);
    const encounters = [];
    for (const id of game.stageOrder) {
        const stage = game.stages.find((s) => s.id === id);
        const bosses = stage.events.filter((e) => e.kind === "boss");
        assert.equal(bosses.length, 1, `${id}: one authored boss encounter`);
        assert.ok(bosses[0].frame < stage.duration * 60 - 600, `${id}: boss has a combat window`);
        assert.ok(stage.clearOnBoss && stage.requireBoss, `${id}: boss defeat is required`);
        assert.ok(stage.music > 0, `${id}: stage soundtrack selected`);
        assert.ok(stage.events.some((e) => e.kind === "enemy"), `${id}: waves precede the boss`);
        const boss = game.bosses.find((b) => b.id === bosses[0].ref);
        assert.ok(boss.phases.length >= 3, `${id}: entrance and changing combat phases`);
        encounters.push(boss.id);
    }
    assert.equal(new Set(encounters).size, 3);
    assert.notEqual(game.player.weapon, game.player.focusWeapon);
    assert.ok(game.player.focusSpeed < game.player.speed);
});

test("NOVA SPEAR A spreads shots; B focuses shots and slows movement", () => {
    const game = emptyArena();
    const wide = new lib.Simulation(game), focus = new lib.Simulation(game);
    for (let tick = 0; tick < 12; tick++) {
        wide.step(16 | 1);
        focus.step(32 | 1);
    }
    const wideShots = wide.entities.filter((e) => e.kind === "pshot");
    const focusShots = focus.entities.filter((e) => e.kind === "pshot");
    assert.ok(wideShots.some((e) => e.vx < 0) && wideShots.some((e) => e.vx > 0));
    assert.ok(focusShots.length > 0 && focusShots.every((e) => e.vx === 0));
    assert.ok(focus.playerX > game.player.x * 16 && focus.playerX < wide.playerX);
    // Switching while held must reset the old repeat/delay state and remain playable.
    for (let tick = 0; tick < 24; tick++) wide.step(32);
    assert.ok(wide.entities.some((e) => e.kind === "pshot" && e.vx === 0));
});

test("legacy projects keep identical A/B firing and movement without focus settings", () => {
    const game = emptyArena();
    delete game.player.focusWeapon;
    delete game.player.focusSpeed;
    const a = new lib.Simulation(game), b = new lib.Simulation(game);
    for (let tick = 0; tick < 120; tick++) {
        const direction = tick % 40 < 20 ? 1 : 2;
        a.step(16 | direction);
        b.step(32 | direction);
        assert.deepEqual(a.trace, b.trace);
        assert.deepEqual(a.entities, b.entities);
    }
});

test("required bosses cannot be bypassed by waiting for the stage timer", () => {
    const game = emptyArena();
    game.stages[0].duration = 1;
    game.stages[0].requireBoss = true;
    const required = new lib.Simulation(game);
    for (let tick = 0; tick < 60; tick++) required.step(0);
    assert.equal(required.result, 1, "Missing required boss defeat is game over");
    assert.equal(required.score, 0, "Timeout failure grants no clear bonus");
    game.stages[0].requireBoss = false;
    const timed = new lib.Simulation(game);
    for (let tick = 0; tick < 60; tick++) timed.step(0);
    assert.equal(timed.result, 2, "Legacy timed stages still clear");
    assert.equal(timed.score, game.clearBonus);
    game.stages[0].duration = 20;
    game.stages[0].requireBoss = true;
    game.stages[0].events = [{ id: "early-end", frame: 20, kind: "end", ref: "", x: 0, y: 0, count: 1, spacing: 0, interval: 0, value: 0 }];
    const early = new lib.Simulation(game);
    for (let tick = 0; tick < 21; tick++) early.step(0);
    assert.equal(early.result, 1, "An end event cannot bypass a required boss either");
    assert.equal(early.score, 0);
});

test("downward scenery decreases camera, wraps cleanly and stops on non-loop maps", () => {
    const game = emptyArena();
    const stage = game.stages[0];
    stage.scrollDown = true;
    const sim = new lib.Simulation(game);
    const initial = sim.camera;
    sim.step(0);
    assert.equal(sim.camera, initial - stage.scrollSpeed * 16);
    sim.camera = 0;
    sim.step(0);
    assert.equal(sim.camera, stage.height * 128 - stage.scrollSpeed * 16);
    stage.loopMap = false;
    const stopped = new lib.Simulation(game);
    stopped.camera = 0;
    stopped.step(0);
    assert.equal(stopped.camera, 0);
});

test("NOVA SPEAR has abundant one-hit, non-firing flights with a boss breathing space", () => {
    const game = authored();
    const spark = game.enemies.find(e => e.id === 'popcorn');
    assert.equal(spark.hp, 1);
    assert.equal(spark.pattern, '');
    for (const stage of game.stages) {
        assert.equal(stage.scrollDown, true);
        const flights = stage.events.filter(e => e.ref === spark.id);
        assert.ok(flights.reduce((n,e)=>n+e.count,0) >= 50);
        const boss = stage.events.find(e=>e.kind==='boss');
        assert.ok(flights.every(e=>e.frame+(e.count-1)*e.interval+100 < boss.frame));
    }
    const arena = emptyArena();
    arena.stages[0].events = [{id:'one-hit',frame:0,kind:'enemy',ref:'popcorn',x:80,y:70,count:1,spacing:0,interval:0,value:0}];
    const sim = new lib.Simulation(arena);
    for(let i=0;i<25;i++) sim.step(16);
    assert.equal(sim.score, spark.score, 'A shot destroys a weak enemy');
    assert.ok(!sim.entities.some(e=>e.kind==='eshot'));
});

test("compact HUD uses one row, bounded numeric fields and the full remaining playfield", () => {
    const game = authored(), hud = game.screens.find(s => s.id === 'hud');
    assert.equal(hud.rows, 1);
    assert.deepEqual(hud.items.map(i=>i.binding), ['score','lives','time']);
    assert.deepEqual(hud.items.map(i=>i.digits), [5,1,3]);
    assert.ok(hud.items.every(i=>i.y===0 && i.x+i.text.length+i.digits<=20));
    assert.deepEqual(lib.validate(game).filter(d=>d.severity==='error'), []);
    const sim = new lib.Simulation(emptyArena());
    for(let i=0;i<100;i++)sim.step(4);
    const asset=game.assets.find(a=>a.id===game.player.asset);
    assert.equal(sim.playerY, (8+asset.origin.y)*16, 'top bound is directly below the 8px HUD');
    const invalid=structuredClone(game);
    invalid.screens.find(s=>s.id==='hud').items[0].y=1;
    assert.ok(lib.validate(invalid).some(d=>d.severity==='error'));
    hud.rows=2;
    const legacy=new lib.Simulation(game);
    for(let i=0;i<100;i++)legacy.step(4);
    assert.equal(legacy.playerY,(16+asset.origin.y)*16,'two-row HUD keeps legacy playfield bounds');
});

test("quadrant aim matches all 16 original dot products, including tie directions", () => {
    for(let dx=-256;dx<=256;dx++)for(let dy=-256;dy<=256;dy++){
        let best=-32768,result=0;
        for(let i=0;i<16;i++){const v=dx*lib.SIN[i]-dy*lib.COS[i];if(v>best){best=v;result=i;}}
        assert.equal(lib.aimStep(dx,dy),result,`${dx},${dy}`);
    }
});

test("respawn wait keeps the world moving and prevents firing or repeat deaths", () => {
    const g=emptyArena();g.player.respawnDelay=180;
    const sim=new lib.Simulation(g);sim.invulnerable=0;
    sim.step(16);assert.ok(sim.entities.some(e=>e.kind==='pshot'));
    sim.hitPlayer();assert.equal(sim.respawn,180);assert.equal(sim.lives,g.player.lives-1);
    assert.ok(!sim.entities.some(e=>e.kind==='pshot'));
    const camera=sim.camera, tick=sim.stageTick,score=sim.score;
    for(let i=0;i<179;i++){sim.hitPlayer();sim.step(16|1);}
    assert.equal(sim.respawn,1);assert.equal(sim.lives,g.player.lives-1);
    assert.equal(sim.stageTick,tick+179);assert.notEqual(sim.camera,camera);
    assert.equal(sim.playerX,g.player.x*16);assert.equal(sim.score,score);
    assert.ok(!sim.entities.some(e=>e.kind==='pshot'));
    sim.step(16);assert.equal(sim.respawn,0);assert.equal(sim.invulnerable,g.player.invulnerability);
    sim.step(16);assert.ok(sim.entities.some(e=>e.kind==='pshot'));
    const legacy=new lib.Simulation({...g,player:{...g.player,respawnDelay:0}});
    legacy.invulnerable=0;legacy.hitPlayer();assert.equal(legacy.respawn,0);assert.equal(legacy.invulnerable,g.player.invulnerability);
});

test("title omits the stage/lives banner and stage fade defaults on", () => {
    const game=authored();assert.ok(!game.screens.find(s=>s.id==='title').items.some(i=>i.text.includes('3 STAGES')));
    assert.equal(game.stageFade??true,true);
    assert.equal(game.player.respawnDelay,90);
});
