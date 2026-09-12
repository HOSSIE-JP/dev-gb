import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import {
    boot,
    frames,
    memory,
    symbols,
    settledTrace,
    GameBoyMode,
    PadKey,
} from "./emulator.mjs";
import { capture } from "./presentation-qa.mjs";

const root = path.resolve(import.meta.dirname, "../.."),
    lib = createRequire(import.meta.url)("../build/library.cjs");

function fixture(axis) {
    const game = lib.readGame(root, "side-caravan"),
        horizontal = axis === "horizontal";
    game.stageFade = false;
    game.timeLimit = false;
    game.bossCelebration = false;
    const hud = game.screens.find((screen) => screen.id === "hud");
    hud.dock = "top";
    hud.rows = 1;
    delete game.items;
    delete game.player.powerUps;
    delete game.player.bomb;
    delete game.player.characters;
    game.player.atomicVolleys = false;
    game.player.weapon = "wrap-shot";
    game.player.invulnerability = 1024;
    game.player.x = horizontal ? 8 : 72;
    game.player.y = horizontal ? 48 : 16;
    for (const actor of [...game.enemies, ...game.bosses])
        delete actor.dropItem;
    game.patterns.push({
        ...game.patterns[0],
        id: "wrap-shot",
        name: "WRAP TEST",
        speed: 2,
        angle: horizontal ? 90 : 180,
        interval: 12,
        lifetime: 100,
        emitterOffsets: [{ x: horizontal ? -8 : 0, y: horizontal ? 0 : -4 }],
    });
    const stage = game.stages[0];
    stage.scrollAxis = axis;
    stage.width = 20;
    stage.height = 18;
    stage.scrollDown = false;
    stage.loopMap = true;
    stage.scrollSpeed = 1;
    stage.clearOnBoss = false;
    stage.requireBoss = false;
    delete stage.parallax;
    delete stage.presentation;
    stage.tiles = Array(20 * 18).fill(0);
    stage.walls = Array(20 * 18).fill(0);
    stage.destructibles = {
        types: [
            {
                id: "panel",
                name: "PANEL",
                tiles: [1, 2, 3, 4],
                hp: 1,
                score: 100,
                solid: false,
            },
        ],
        objects: horizontal
            ? [
                  { id: "edge", type: "panel", x: 0, y: 4 },
                  { id: "preloaded", type: "panel", x: 10, y: 4 },
              ]
            : [
                  { id: "edge", type: "panel", x: 8, y: 0 },
                  { id: "preloaded", type: "panel", x: 8, y: 8 },
              ],
    };
    const scroll = (frame, value) => ({
        id: `scroll-${frame}`,
        frame,
        kind: "scroll",
        ref: "",
        x: 0,
        y: 0,
        count: 1,
        spacing: 0,
        interval: 0,
        value,
    });
    // Pause with one instance visible at both edges. The other instance's next
    // copy is already in the 32-cell VRAM ring, but still outside the viewport.
    stage.events = [scroll(horizontal ? 0 : 8, 0), scroll(120, 1)];
    const art = game.assets.find((a) => a.id === stage.tileset);
    for (let tile = 0; tile < 5; tile++)
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
                art.frames[0].pixels[
                    (Math.floor(tile / (art.width / 8)) * 8 + y) * art.width +
                        (tile % (art.width / 8)) * 8 +
                        x
                ] = tile ? ((tile - 1) % 3) + 1 : 0;
            }
    return game;
}

function isolatedRoot() {
    const dir = fs.mkdtempSync(path.join(root, ".cache/horizontal-wrap-"));
    fs.mkdirSync(path.join(dir, "projects"));
    for (const relative of ["engine", ".tools/gbdk", ".tools/misaki"])
        fs.cpSync(path.join(root, relative), path.join(dir, relative), {
            recursive: true,
        });
    return dir;
}

const hp = (m, syms, index) =>
    (m.ram[syms._ce_object_hp - 0xc000 + (index >> 1)] >> ((index & 1) * 4)) &
    15;
const camera = (m, syms) =>
    m.ram.readUInt16LE(syms._ce_state - 0xc000 + 4) >> 4;
function bgMemory(m) {
    const offset = m.state.readUInt32LE(m.core + 0xa4),
        vram = m.state.subarray(offset);
    return {
        vram,
        map: vram.subarray(
            m.io[0x40] & 8 ? 0x1c00 : 0x1800,
            (m.io[0x40] & 8 ? 0x1c00 : 0x1800) + 1024,
        ),
    };
}

function checkPixels(gb, syms, game, label) {
    const m = memory(gb),
        { vram, map } = bgMemory(m),
        stage = game.stages[0],
        horizontal = stage.scrollAxis === "horizontal";
    const top =
        game.screens.find((s) => s.id === "hud").dock === "top"
            ? lib.hudHeight(game)
            : 0;
    const art = game.assets.find((a) => a.id === stage.tileset),
        cam = camera(m, syms);
    let pixels = 0;
    for (let y = top; y < top + 144 - lib.hudHeight(game); y++)
        for (let x = 0; x < 160; x++) {
            const wx = horizontal ? (x + cam) % 160 : x,
                wy = horizontal ? y - top : (y - top + cam) % 144;
            let tile = 0;
            stage.destructibles.objects.forEach((object, index) => {
                if (
                    hp(m, syms, index) &&
                    wx >= object.x * 8 &&
                    wx < object.x * 8 + 16 &&
                    wy >= object.y * 8 &&
                    wy < object.y * 8 + 16
                ) {
                    tile =
                        stage.destructibles.types[0].tiles[
                            Math.floor((wy - object.y * 8) / 8) * 2 +
                                Math.floor((wx - object.x * 8) / 8)
                        ];
                }
            });
            const sourceX = (tile % (art.width / 8)) * 8 + (wx & 7),
                sourceY = Math.floor(tile / (art.width / 8)) * 8 + (wy & 7);
            const expected =
                art.frames[0].pixels[sourceY * art.width + sourceX];
            const bx = (x + m.io[0x43]) & 255,
                by = (y + m.io[0x42]) & 255,
                number = map[(by >> 3) * 32 + (bx >> 3)];
            const offset =
                    (m.io[0x40] & 16
                        ? number * 16
                        : 0x1000 +
                          (number < 128 ? number : number - 256) * 16) +
                    (by & 7) * 2,
                bit = 7 - (bx & 7);
            const actual =
                ((vram[offset] >> bit) & 1) |
                (((vram[offset + 1] >> bit) & 1) << 1);
            assert.equal(
                actual,
                expected,
                `${label}: screen (${x},${y}), world (${wx},${wy}), tile ${tile}`,
            );
            pixels++;
        }
    return pixels;
}

test(
    "short horizontal/vertical loops erase visible and preloaded terrain aliases in DMG/CGB ROM",
    { timeout: 600000 },
    () => {
        const dir = isolatedRoot(),
            results = [];
        for (const axis of ["horizontal", "vertical"]) {
            const game = fixture(axis),
                project = `wrap-${axis}`;
            lib.createProject(dir, project, project.toUpperCase(), game);
            const report = lib.compile(dir, project, "Debug", () => {}),
                rom = fs.readFileSync(report.romPath),
                syms = symbols(report.romPath.replace(/\.gb$/, ".map"));
            for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
                const label = `${axis}-${mode === GameBoyMode.Dmg ? "DMG" : "CGB"}`,
                    gb = boot(rom, mode);
                const until = (predicate, limit = 1600) => {
                    for (let n = 0; n < limit; n++) {
                        const trace = settledTrace(gb, syms._ce_trace),
                            m = memory(gb);
                        if (trace?.scene === 1 && predicate(trace, m))
                            return { trace, m };
                        frames(gb, 1);
                    }
                    throw Error(`${label}: route timed out`);
                };
                try {
                    frames(gb, 240);
                    gb.key_press(PadKey.Start);
                    frames(gb, 6);
                    gb.key_lift(PadKey.Start);
                    until((t) => t.tick >= 12);
                    assert.equal(
                        camera(memory(gb), syms),
                        axis === "horizontal" ? 1 : 9,
                    );
                    let pixels = checkPixels(
                        gb,
                        syms,
                        game,
                        `${label} live aliases`,
                    );
                    let previous = Buffer.from(bgMemory(memory(gb)).map),
                        lastTick = -1,
                        deadAt = -1,
                        peakChangedCells = 0;
                    gb.key_press(PadKey.A);
                    const killed = until((t, m) => {
                        if (t.tick === lastTick) return false;
                        assert.ok(
                            t.tick < 110,
                            "both objects are destroyed while the camera is paused",
                        );
                        const current = bgMemory(m).map,
                            changed = current.reduce(
                                (count, value, i) =>
                                    count + (value !== previous[i]),
                                0,
                            );
                        peakChangedCells = Math.max(peakChangedCells, changed);
                        assert.ok(
                            changed <= 8,
                            `${label}: at most eight changed BG cells per published update, saw ${changed}`,
                        );
                        previous = Buffer.from(current);
                        lastTick = t.tick;
                        if (!hp(m, syms, 0) && !hp(m, syms, 1) && deadAt < 0)
                            deadAt = t.tick;
                        return deadAt >= 0 && t.tick >= deadAt + 4;
                    });
                    gb.key_lift(PadKey.A);
                    assert.equal(
                        killed.trace.score,
                        200,
                        "each instance scores once across its copies",
                    );
                    assert.equal(
                        killed.m.ram[syms._ce_pool_counts - 0xc000 + 6],
                        0,
                        "item-free defaults reserve no active pickups",
                    );
                    pixels += checkPixels(
                        gb,
                        syms,
                        game,
                        `${label} destroyed edge aliases`,
                    );
                    capture(gb, path.join(dir, `${label}-destroyed.png`));
                    // The physical copy at world column30 / row26 was loaded before
                    // the hit. Verify it stays erased when scrolling brings it in.
                    until(
                        (t, m) =>
                            t.tick > 120 &&
                            camera(m, syms) >=
                                (axis === "horizontal" ? 100 : 90),
                    );
                    pixels += checkPixels(
                        gb,
                        syms,
                        game,
                        `${label} previously offscreen alias`,
                    );
                    const m = memory(gb);
                    assert.equal(hp(m, syms, 0), 0);
                    assert.equal(hp(m, syms, 1), 0);
                    capture(gb, path.join(dir, `${label}-scrolled.png`));
                    results.push({
                        axis,
                        mode: label,
                        sha256: crypto
                            .createHash("sha256")
                            .update(rom)
                            .digest("hex"),
                        checkedPixels: pixels,
                        peakChangedBgCellsPerUpdate: peakChangedCells,
                        killedAt: deadAt,
                    });
                } catch (error) {
                    capture(gb, path.join(dir, `${label}-failure.png`));
                    throw error;
                } finally {
                    gb.free();
                }
            }
        }
        fs.writeFileSync(
            path.join(dir, "results.json"),
            JSON.stringify(
                {
                    fixture: true,
                    realInput: true,
                    memoryWrites: false,
                    results,
                },
                null,
                2,
            ),
        );
        console.log(
            "Horizontal wrap ROM acceptance:",
            path.join(dir, "results.json"),
        );
    },
);
