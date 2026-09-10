import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PNG } from "../node_modules/pngjs/lib/png.js";
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
);
function screenshot(gb, label) {
    const out = path.join(root, ".cache/editor-qa");
    fs.mkdirSync(out, { recursive: true });
    const p = new PNG({ width: 160, height: 144 }),
        rgb = gb.frame_buffer_eager();
    for (let i = 0; i < 23040; i++) {
        p.data[i * 4] = rgb[i * 3];
        p.data[i * 4 + 1] = rgb[i * 3 + 1];
        p.data[i * 4 + 2] = rgb[i * 3 + 2];
        p.data[i * 4 + 3] = 255;
    }
    fs.writeFileSync(path.join(out, label + ".png"), PNG.sync.write(p));
}
test(
    "space-containing portable root: MBC5, edited PNG/kana, phases, terrain, campaign, recovery of last ROM",
    { timeout: 180000 },
    () => {
        const temp = fs.mkdtempSync(path.join(root, ".cache/portable space-"));
        try {
            fs.mkdirSync(path.join(temp, ".tools"), { recursive: true });
            fs.mkdirSync(path.join(temp, "projects"));
            for (const tool of ["gbdk", "misaki"])
                fs.cpSync(
                    path.join(root, ".tools", tool),
                    path.join(temp, ".tools", tool),
                    { recursive: true },
                );
            fs.cpSync(path.join(root, "engine"), path.join(temp, "engine"), {
                recursive: true,
            });
            const g = structuredClone(lib.readGame(root, "star-caravan"));
            g.mode = "campaign";
            g.player.invulnerability = 30;
            g.player.lives = 3;
            g.screens[0].items[0].text = "スター きゃらばん";
            g.assets[0].frames[0].pixels[0] = 1;
            g.assets[0].frames[0].pixels[1] = 2;
            const s = g.stages[0];
            s.height = 512;
            s.duration = 2;
            s.scrollSpeed = 0.5;
            s.clearOnBoss = false;
            s.tiles = Array.from({ length: 10240 }, (_, i) => i % 4);
            s.walls = Array.from({ length: 10240 }, (_, i) =>
                i % 20 < 3 ? 1 : 0,
            );
            s.events = [
                {
                    id: "boss-test",
                    frame: 20,
                    kind: "boss",
                    ref: g.bosses[0].id,
                    x: 72,
                    y: 72,
                    count: 1,
                    spacing: 0,
                    interval: 0,
                    value: 0,
                },
                {
                    id: "scroll-test",
                    frame: 30,
                    kind: "scroll",
                    ref: "",
                    x: 0,
                    y: 0,
                    count: 1,
                    spacing: 0,
                    interval: 0,
                    value: 1,
                },
            ];
            g.bosses[0].hp = 3;
            g.bosses[0].phases[0].until = "time";
            g.bosses[0].phases[0].threshold = 2;
            for (const phase of g.bosses[0].phases) {
                phase.motion = {
                    ...lib.normalMotion(),
                    kind: "path",
                    loop: true,
                    points: [
                        { x: 0, y: 0, frame: 0 },
                        { x: 8, y: 0, frame: 16 },
                        { x: 0, y: 0, frame: 32 },
                    ],
                };
                phase.pattern = "";
            }
            g.patterns[1].kind = "straight";
            g.patterns[1].angle = 90;
            g.patterns[1].interval = 9;
            g.patterns[1].delay = 1;
            g.patterns[1].repeats = 2;
            g.patterns[2].kind = "fan";
            g.patterns[2].angle = 270;
            g.patterns[2].interval = 7;
            g.patterns[2].delay = 2;
            g.patterns[2].repeats = 3;
            g.bosses[0].phases[1].pattern = g.patterns[1].id;
            g.bosses[0].phases[1].attacks = [
                { id: "mixed-layer", pattern: g.patterns[2].id },
            ];
            const second = structuredClone(s);
            second.id = "stage-2";
            second.name = "STAGE TWO";
            second.events = [];
            second.scrollSpeed = 4;
            g.stages = [s, second];
            g.stageOrder = [s.id, second.id];
            const created = lib.createProject(temp, "fixture", "FIXTURE", g); // New title then explicit kana edit through shared save path.
            created.screens[0].items[0].text = "スター きゃらばん";
            lib.saveGame(temp, "fixture", created);
            let report = lib.compile(temp, "fixture", "Debug", () => {});
            assert.equal(
                fs.existsSync(path.join(temp, "projects/fixture/build/.caravan-build.lock")),
                false,
                "A successful build must release the project lock",
            );
            assert.ok(
                report.size > 32768,
                "Expanded maps must exercise banked data",
            );
            const base = path.join(
                    temp,
                    "projects/fixture/build/Debug/fixture",
                ),
                rom = fs.readFileSync(base + ".gb"),
                syms = symbols(base + ".map");
            assert.equal(rom[0x147], 0x1b);
            const qa = path.join(root, ".cache/editor-qa");
            fs.mkdirSync(qa, { recursive: true });
            fs.copyFileSync(base + ".gb", path.join(qa, "fixture.gb"));
            fs.copyFileSync(base + ".map", path.join(qa, "fixture.map"));
            for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
                const gb = boot(rom, mode);
                frames(gb, 240);
                let initial;
                for (let n = 0; n < 20; n++) {
                    initial = trace(gb, syms._ce_trace);
                    if (initial) break;
                    gb.clocks_cycles(512);
                }
                screenshot(gb, `kana-title-${mode}`);
                assert.equal(initial?.scene, 0, gb.description_debug());
                const sim = new lib.Simulation(created);
                gb.key_press(PadKey.A);
                let phaseSeen = false,
                    transition = false,
                    last;
                for (let f = 0; f < 1500; f++) {
                    frames(gb, 1);
                    const t = settledTrace(gb, syms._ce_trace);
                    if (!t || !t.tick) continue;
                    while (sim.tick < t.tick && !sim.result) sim.step(16);
                    const { scene, stageTick, bossPhase, ...actual } = t;
                    assert.deepEqual(
                        actual,
                        sim.trace,
                        `mode ${mode}, tick ${t.tick}`,
                    );
                    assert.deepEqual(
                        entityState(gb, syms, created),
                        simulatedEntities(sim),
                        `entity phase/path positions tick ${t.tick}`,
                    );
                    assert.equal(
                        bossPhase,
                        sim.entities.find((e) => e.kind === "boss")?.phase ?? 0,
                    );
                    if (bossPhase === 1) phaseSeen = true;
                    if (t.stage === 1) transition = true;
                    if (t.tick > 20 && t.tick < 40) {
                        assert.deepEqual(
                            Array.from(gb.vram_eager().slice(2048, 2080)),
                            lib.packTiles(
                                created.assets[0].width,
                                created.assets[0].height,
                                created.assets[0].frames[0].pixels,
                            ),
                            "Edited sprite is in VRAM",
                        );
                    }
                    last = t;
                    if (t.result) {
                        screenshot(gb, `campaign-clear-${mode}`);
                        break;
                    }
                }
                assert.ok(phaseSeen, "Boss phase transition observed");
                assert.ok(transition, "Campaign entered stage 2");
                assert.equal(last?.result, 2);
                assert.equal(last?.scene, 3);
                assert.ok(
                    last.score >=
                        created.clearBonus * 2 + created.bosses[0].score,
                    "Boss defeat awards score",
                );
                gb.free();
                const death = boot(rom, mode);
                frames(death, 240);
                death.key_press(PadKey.Start);
                frames(death, 5);
                death.key_lift(PadKey.Start);
                death.key_press(PadKey.Left);
                let outcome;
                for (let i = 0; i < 500; i++) {
                    frames(death, 1);
                    outcome = settledTrace(death, syms._ce_trace);
                    if (outcome?.result) break;
                }
                assert.equal(
                    outcome?.result,
                    1,
                    "Terrain depletes lives and reaches game over",
                );
                screenshot(death, `terrain-gameover-${mode}`);
                death.free();
            }
            // Invalid save never changes the last good ROM; actual conversion failure also leaves it intact.
            const baseline = fs.readFileSync(base + ".gb"),
                broken = lib.readGame(temp, "fixture");
            broken.screens[0].items[0].text =
                "あいうえおかきくけこさしすせそたちつてと";
            broken.screens[0].items[0].x = 0;
            lib.saveGame(temp, "fixture", broken);
            const font = path.join(temp, ".tools/misaki/misaki_gothic.bdf");
            fs.renameSync(font, font + ".missing");
            assert.throws(
                () => lib.compile(temp, "fixture", "Debug", () => {}),
                /misaki_gothic|ENOENT/,
            );
            assert.deepEqual(fs.readFileSync(base + ".gb"), baseline);
            assert.equal(
                fs.existsSync(
                    path.join(
                        temp,
                        "projects/fixture/build/.caravan-build.lock",
                    ),
                ),
                false,
                "A failed asset conversion must release the build lock",
            );
            fs.renameSync(font + ".missing", font);
            created.screens.find((s) => s.id === "hud").dock = "bottom";
            const burst = created.patterns.find(
                (p) => p.id === created.player.weapon,
            );
            burst.delay = 2;
            burst.repeats = 3;
            lib.saveGame(temp, "fixture", created);
            fs.rmSync(path.join(temp, "projects/fixture/generated"), {
                recursive: true,
            });
            report = lib.compile(temp, "fixture", "Release", () => {});
            assert.ok(report.ok, "Rebuild succeeds without generated files");
            assert.ok(
                report.ramBytes > 1000,
                "Release map must report static WRAM, not just shadow OAM",
            );
            for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
                const gb = boot(fs.readFileSync(report.romPath), mode),
                    syms = symbols(report.romPath.replace(/\.gb$/, ".map")),
                    sim = new lib.Simulation(created);
                frames(gb, 240);
                gb.key_press(PadKey.A);
                let checked = false;
                for (let n = 0; n < 300; n++) {
                    frames(gb, 1);
                    const t = settledTrace(gb, syms._ce_trace);
                    if (!t || t.tick < 40 || t.scene !== 1) continue;
                    while (sim.tick < t.tick) sim.step(16);
                    assert.deepEqual(
                        entityState(gb, syms, created),
                        simulatedEntities(sim),
                    );
                    assert.equal(
                        memory(gb).io[0x4a],
                        128,
                        "Bottom HUD uses WY=128",
                    );
                    const video = gb.frame_buffer_eager(),
                        colors = new Set();
                    for (let y = 0; y < 120; y++)
                        for (let x = 0; x < 24; x++) {
                            const p = (y * 160 + x) * 3;
                            colors.add(
                                `${video[p]},${video[p + 1]},${video[p + 2]}`,
                            );
                        }
                    screenshot(gb, `bottom-hud-${mode}`);
                    assert.ok(
                        colors.size > 1,
                        "Bottom HUD leaves background visible",
                    );
                    checked = true;
                    break;
                }
                assert.ok(checked, "Release bottom-HUD gameplay verified");
                gb.free();
            }
        } finally {
            assert.ok(
                path
                    .resolve(temp)
                    .startsWith(path.resolve(root, ".cache") + path.sep),
            );
            fs.rmSync(temp, { recursive: true, force: true });
        }
    },
);
