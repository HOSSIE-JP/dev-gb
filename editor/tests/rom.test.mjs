import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
    boot,
    trace,
    symbols,
    frames,
    GameBoyMode,
    PadKey,
    memory,
    entityState,
    simulatedEntities,
    settledTrace,
} from "./emulator.mjs";
const require = createRequire(import.meta.url),
    lib = require("../build/library.cjs");
const root = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../..",
    ),
    base = path.join(root, "projects/star-caravan/build/Debug/star-caravan");
const game = lib.readGame(root, "star-caravan");
for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb])
    test(`ROM ${mode === 1 ? "DMG" : "CGB"}: title, input, audio and fixed-point parity`, () => {
        assert.ok(
            fs.existsSync(base + ".gb"),
            "Build star-caravan Debug first",
        );
        const gb = boot(fs.readFileSync(base + ".gb"), mode),
            syms = symbols(base + ".map");
        frames(gb, 240);
        let t = trace(gb, syms._ce_trace);
        assert.equal(t?.scene, 0);
        assert.ok(
            new Set(gb.frame_buffer_eager()).size > 1,
            "Title is not blank",
        );
        const sim = new lib.Simulation(game);
        gb.key_press(PadKey.A);
        let checked = 0,
            audio = 0,
            backgroundSeen = false;
        for (let n = 0; n < 900; n++) {
            frames(gb, 1);
            const next = settledTrace(gb, syms._ce_trace);
            if (!next || next.scene !== 1 || next.tick === 0) continue;
            while (sim.tick < next.tick && !sim.result) sim.step(16);
            const { scene, stageTick, bossPhase, ...actual } = next;
            assert.equal(
                bossPhase,
                sim.entities.find((e) => e.kind === "boss")?.phase ?? 0,
            );
            assert.deepEqual(actual, sim.trace, `tick ${next.tick}`);
            assert.deepEqual(
                entityState(gb, syms._ce_entities, game),
                simulatedEntities(sim),
                `entity positions tick ${next.tick}`,
            );
            checked++;
            if (!backgroundSeen && next.tick > 20) {
                const video = gb.frame_buffer_eager(),
                    edge = new Set();
                for (let y = 24; y < 140; y++)
                    for (let x = 0; x < 8; x++) {
                        const p = (y * 160 + x) * 3;
                        edge.add(`${video[p]},${video[p + 1]},${video[p + 2]}`);
                    }
                backgroundSeen = edge.size > 1;
            }
            if (n % 20 === 0)
                for (const sample of gb.audio_buffer_eager(true))
                    if (sample !== 0) audio++;
            if (next.result) break;
        }
        assert.ok(checked > 100, `Only ${checked} ticks verified`);
        assert.ok(audio > 0, "Audio output must contain nonzero samples");
        // Top-docked HUD must not obscure the background below its two rows.
        assert.ok(
            backgroundSeen,
            "HUD Window obscures the playfield background",
        );
        gb.key_lift(PadKey.A);
        gb.free();
    });
