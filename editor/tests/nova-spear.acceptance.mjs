// Explicit hardware-emulation acceptance suite. Run after `npm run build`:
// node --test tests/nova-spear.acceptance.mjs
// Builds are confined to normal build output; altered campaign fixtures live in
// a disposable directory. The authored NOVA SPEAR project is never saved over.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PNG } from "../node_modules/pngjs/lib/png.js";
import {
    boot, frames, memory, symbols, settledTrace, entityState,
    simulatedEntities, GameBoyMode, PadKey,
} from "./emulator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lib = createRequire(import.meta.url)("../build/library.cjs");
const game = lib.readGame(root, "nova-spear");
const output = path.join(root, ".cache/nova-spear-qa");
fs.mkdirSync(output, { recursive: true });
const evidence = { builds: {}, original: [], campaignFixture: [] };
const saveEvidence = () => fs.writeFileSync(path.join(output, "acceptance.json"), JSON.stringify(evidence, null, 2) + "\n");
for (const configuration of ["Debug", "Release"])
    evidence.builds[configuration] = lib.compile(root, "nova-spear", configuration, () => {});
saveEvidence();

function capture(gb, name) {
    const image = new PNG({ width: 160, height: 144 }), rgb = gb.frame_buffer_eager();
    for (let i = 0; i < 160 * 144; i++) {
        image.data[i * 4] = rgb[i * 3];
        image.data[i * 4 + 1] = rgb[i * 3 + 1];
        image.data[i * 4 + 2] = rgb[i * 3 + 2];
        image.data[i * 4 + 3] = 255;
    }
    fs.writeFileSync(path.join(output, `${name}.png`), PNG.sync.write(image));
}

function readByte(gb, syms, name) {
    assert.ok(syms[name] >= 0xc000 && syms[name] < 0xe000, `${name} must be in WRAM`);
    return memory(gb).ram[syms[name] - 0xc000];
}

function press(gb, key, count = 5) {
    gb.key_press(key);
    frames(gb, count);
    gb.key_lift(key);
    frames(gb, 5);
}

function awaitTrace(gb, syms, predicate, description) {
    for (let frame = 0; frame < 600; frame++) {
        const trace = settledTrace(gb, syms._ce_trace);
        if (trace && predicate(trace)) return trace;
        frames(gb, 1);
    }
    assert.fail(`Timed out waiting for ${description}`);
}

function audioCount(gb, count = 20) {
    let audible = 0;
    for (let frame = 0; frame < count; frame++) {
        frames(gb, 1);
        for (const sample of gb.audio_buffer_eager(true)) if (sample !== 0) audible++;
    }
    return audible;
}

for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
    const label = mode === GameBoyMode.Dmg ? "dmg" : "cgb";
    test(`NOVA SPEAR original ${label}: title, music, weapons, pause, score and game over`, { timeout: 240000 }, () => {
        const report = evidence.builds.Debug;
        const syms = symbols(report.romPath.replace(/\.gb$/, ".map"));
        const gb = boot(fs.readFileSync(report.romPath), mode);
        const checked = { mode: label };
        try {
            frames(gb, 240);
            assert.equal(settledTrace(gb, syms._ce_trace)?.scene, 0);
            if (mode === GameBoyMode.Dmg)
                for (const register of [0x47, 0x48, 0x49])
                    assert.equal(memory(gb).io[register], game.dmgPalette, "DMG palette preserves dark space and bright ships");
            assert.equal(readByte(gb, syms, "_ce_music_track"), game.music.title);
            assert.ok(audioCount(gb) > 0, "Title music produces PCM without firing");
            capture(gb, `original-title-${label}`);

            press(gb, PadKey.Start);
            awaitTrace(gb, syms, (trace) => trace.scene === 1, "stage graphics to finish loading");
            assert.equal(readByte(gb, syms, "_ce_music_track"), game.stages[0].music);
            assert.equal(memory(gb).io[0x45], 8, "top HUD ends at scanline 8");
            if (mode === GameBoyMode.Cgb) assert.ok(memory(gb).io[0x4d] & 0x80, "CGB CPU runs in double-speed mode");
            const scyBefore = memory(gb).io[0x42];
            const frameBefore = gb.ppu_frame();
            frames(gb, 24);
            assert.ok(gb.ppu_frame() - frameBefore >= 24 && gb.ppu_frame() - frameBefore <= 25, "editor frame budget follows display rate at either CPU speed");
            const downwardPixels = (scyBefore - memory(gb).io[0x42] + 256) % 256;
            assert.ok(downwardPixels > 0 && downwardPixels <= 24, "SCY decreases: scenery travels from top to bottom");
            assert.ok(audioCount(gb) > 0, "Stage BGM produces PCM without firing");
            press(gb, PadKey.Start);
            assert.equal(readByte(gb, syms, "_ce_pause"), 1);
            const paused = settledTrace(gb, syms._ce_trace).tick;
            frames(gb, 30);
            assert.equal(settledTrace(gb, syms._ce_trace).tick, paused);
            press(gb, PadKey.Start);
            assert.equal(readByte(gb, syms, "_ce_pause"), 0);

            gb.key_press(PadKey.A);
            let wide = false, scored = false, last;
            for (let frame = 0; frame < 900; frame++) {
                frames(gb, 1);
                last = settledTrace(gb, syms._ce_trace);
                if (!last || last.scene !== 1) continue;
                const shots = entityState(gb, syms._ce_entities, game).filter((e) => e.kind === "pshot");
                if (shots.some((e) => e.vx < 0) && shots.some((e) => e.vx > 0)) wide = true;
                if (last.score > 0) scored = true;
                if (wide && scored && last.stageTick > 200) break;
            }
            assert.ok(wide, "A produces a wide volley in the original ROM");
            assert.ok(scored, "Original enemy waves award score when shot");
            capture(gb, `original-action-${label}`);
            gb.key_lift(PadKey.A);
            gb.key_press(PadKey.B);
            let focus = false;
            for (let frame = 0; frame < 100; frame++) {
                frames(gb, 1);
                settledTrace(gb, syms._ce_trace);
                const shots = entityState(gb, syms._ce_entities, game).filter((e) => e.kind === "pshot");
                if (shots.length && shots.every((e) => e.vx === 0)) { focus = true; break; }
            }
            assert.ok(focus, "B replaces wide volleys with focused shots");
            gb.key_lift(PadKey.B);

            // With no further input the actual, unmodified game must reach a
            // result, including its required-boss deadline if collisions miss.
            let waitingTick, waitingCamera, observedWait = false, observedWorld = false, observedReturn = false;
            for (let frame = 0; frame < 36000; frame += 4) {
                frames(gb, 4);
                last = settledTrace(gb, syms._ce_trace);
                if (last && last.scene === 1) {
                    const wait = memory(gb).ram.readUInt16LE(syms._ce_respawn - 0xc000);
                    if (wait) {
                        observedWait = true;
                        assert.equal(entityState(gb, syms._ce_entities, game).filter(e => e.kind === "pshot").length, 0);
                        if (waitingTick === undefined) { waitingTick = last.tick; waitingCamera = memory(gb).ram.readUInt16LE(syms._ce_state - 0xc000 + 4); }
                        if (last.tick > waitingTick + 30 && memory(gb).ram.readUInt16LE(syms._ce_state - 0xc000 + 4) !== waitingCamera) observedWorld = true;
                    } else if (observedWait) observedReturn = true;
                }
                if (last?.result) break;
            }
            assert.ok(observedWait && observedWorld && observedReturn, `respawn wait=${observedWait}, world=${observedWorld}, return=${observedReturn}`);
            assert.equal(last?.result, 1);
            assert.equal(last?.scene, 2);
            assert.equal(readByte(gb, syms, "_ce_music_track"), game.music.gameover);
            // A just-enabled LCD has not yet drawn a complete visible frame.
            frames(gb, 4);
            capture(gb, `original-gameover-${label}`);
            Object.assign(checked, { score: last.score, finalTick: last.tick, wide, focus, paused: true });
            press(gb, PadKey.Start);
            awaitTrace(gb, syms, (trace) => trace.scene === 0, "return to title");
            press(gb, PadKey.Select);
            awaitTrace(gb, syms, (trace) => trace.scene === 4, "score screen to finish loading");
            assert.ok(memory(gb).ram.readUInt16LE(syms._ce_scores - 0xc000) >= last.score);
            frames(gb, 4);
            capture(gb, `original-scores-${label}`);
            evidence.original.push(checked);
            saveEvidence();
        } finally { gb.free(); }
    });
}

test("NOVA SPEAR isolated campaign fixture: all stages and boss phases agree with the simulator on DMG/CGB", { timeout: 240000 }, () => {
    const fixtureRoot = fs.mkdtempSync(path.join(root, ".cache/nova-fixture-"));
    try {
        fs.mkdirSync(path.join(fixtureRoot, "projects"));
        for (const folder of ["engine", ".tools/gbdk", ".tools/misaki"])
            fs.cpSync(path.join(root, folder), path.join(fixtureRoot, folder), { recursive: true });
        const fixture = structuredClone(game);
        fixture.player.invulnerability = 1024;
        fixture.player.x = 80;
        fixture.player.y = 120;
        for (const stage of fixture.stages) {
            stage.walls.fill(0);
            stage.duration = 10;
            const originalBoss = stage.events.find((e) => e.kind === "boss");
            stage.events = [{ ...originalBoss, frame: 20, x: 80, y: 48, count: 1, interval: 0, spacing: 0 }];
        }
        for (const boss of fixture.bosses) {
            boss.hp = 30;
            for (const phase of boss.phases) {
                phase.until = "time";
                // Keep each phase visible across several render/publication
                // cycles on DMG, where one update can span multiple VBlanks.
                phase.threshold = 24;
                phase.motion = { ...lib.normalMotion(), vx: 0, vy: 0 };
            }
        }
        const stored = lib.createProject(fixtureRoot, "nova-fixture", "NOVA QA FIXTURE", fixture);
        const report = lib.compile(fixtureRoot, "nova-fixture", "Debug", () => {});
        const syms = symbols(report.romPath.replace(/\.gb$/, ".map"));
        for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
            const label = mode === GameBoyMode.Dmg ? "dmg" : "cgb";
            const gb = boot(fs.readFileSync(report.romPath), mode);
            const sim = new lib.Simulation(stored);
            const stages = new Set(), phases = new Set(), music = new Set(), fadeLevels = new Set();
            let checked = 0, last, hitSound = false;
            try {
                frames(gb, 240);
                gb.key_press(PadKey.Start);
                gb.key_press(PadKey.B);
                frames(gb, 1);
                gb.key_lift(PadKey.Start);
                for (let frame = 0; frame < 6000; frame++) {
                    frames(gb, 1);
                    if (memory(gb).io[0x21] === 0xa1 && memory(gb).io[0x22] === 0x19) hitSound = true;
                    fadeLevels.add(readByte(gb, syms, "_ce_fade_level"));
                    if (readByte(gb, syms, "_ce_fade_level") === 4)
                        assert.ok(memory(gb).io[0x40] & 0x80, "black stage loading keeps LCD enabled to avoid a white flash");
                    last = settledTrace(gb, syms._ce_trace);
                    if (!last || !last.tick) continue;
                    while (sim.tick < last.tick && !sim.result) sim.step(32);
                    const { scene, stageTick, bossPhase, ...actual } = last;
                    assert.deepEqual(actual, sim.trace, `${label} tick ${last.tick}`);
                    assert.deepEqual(entityState(gb, syms._ce_entities, stored), simulatedEntities(sim), `${label} entities tick ${last.tick}`);
                    checked++;
                    if (!stages.has(last.stage)) capture(gb, `fixture-stage-${last.stage + 1}-${label}`);
                    stages.add(last.stage);
                    music.add(readByte(gb, syms, "_ce_music_track"));
                    if (last.bossHp) {
                        const phase = `${last.stage}:${bossPhase}`;
                        if (!phases.has(phase)) capture(gb, `fixture-boss-${last.stage + 1}-phase-${bossPhase}-${label}`);
                        phases.add(phase);
                    }
                    if (last.result) break;
                }
                assert.equal(last?.result, 2);
                assert.equal(last?.scene, 3);
                assert.equal(stages.size, 3);
                assert.ok(hitSound, "boss impacts trigger the dedicated noise-channel hit sound");
                assert.deepEqual([...fadeLevels].sort(), [0,1,2,3,4], "stage transitions traverse every fade level");
                for (let index = 0; index < stored.stageOrder.length; index++) {
                    const stage = stored.stages.find((s) => s.id === stored.stageOrder[index]);
                    const boss = stored.bosses.find((b) => b.id === stage.events[0].ref);
                    for (let phase = 0; phase < boss.phases.length; phase++)
                        assert.ok(phases.has(`${index}:${phase}`), `${label}: stage ${index + 1}, phase ${phase} observed`);
                }
                assert.ok(last.score >= stored.clearBonus * 3 + stored.bosses.reduce((total, b) => total + b.score, 0));
                assert.equal(readByte(gb, syms, "_ce_music_track"), stored.music.clear);
                assert.ok(audioCount(gb) > 0, "Clear jingle produces PCM");
                capture(gb, `fixture-clear-${label}`);
                evidence.campaignFixture.push({ mode: label, checked, stages: [...stages], phases: [...phases], music: [...music], score: last.score, tick: last.tick });
                saveEvidence();
            } finally { gb.free(); }
        }
    } finally { fs.rmSync(fixtureRoot, { recursive: true, force: true }); }
});
