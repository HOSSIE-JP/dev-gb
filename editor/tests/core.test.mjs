import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PNG } from "../node_modules/pngjs/lib/png.js";
const require = createRequire(import.meta.url),
    lib = require("../build/library.cjs");
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
const game = lib.readGame(root, "star-caravan");
test("STAR CARAVAN migrated definition and Japanese font are valid", () => {
    assert.deepEqual(lib.validate(game), []);
    const font = lib.readFont(root);
    for (const c of "ABC012あいうえおアイウエオー")
        assert.ok(
            font[c]?.some((n) => n),
            "glyph " + c,
        );
    assert.ok(lib.supportedText("スター きゃらばん 123"));
    assert.equal(lib.supportedText("漢字"), false);
});
test("indexed PNG and 2bpp preserve all four indices and transparency", () => {
    const a = game.assets[0],
        f = a.frames[0],
        png = lib.encodePng(a.width, a.height, f.pixels, true);
    assert.deepEqual(lib.decodeIndexedPng(png, a.width, a.height), f.pixels);
    const indexed = PNG.sync.read(
        lib.indexedPng(a.width, a.height, f.pixels, true),
    );
    assert.equal(indexed.width, a.width);
    assert.deepEqual(
        lib.decodeIndexedPng(
            lib.indexedPng(a.width, a.height, f.pixels, true),
            a.width,
            a.height,
        ),
        f.pixels,
    );
    assert.equal(
        lib.packTiles(a.width, a.height, f.pixels).length,
        (a.width * a.height) / 4,
    );
});
test("DMG drawing honors BGP bit pairs while sprite index zero stays transparent", () => {
    const g = structuredClone(game),
        asset = structuredClone(g.assets.find((a) => a.kind === "sprite")),
        drawn = [],
        ctx = {
            fillStyle: "",
            fillRect(x, y) { drawn.push({ x, y, color: this.fillStyle }); },
        };
    asset.width = asset.height = 8;
    asset.frames = [{ id: "palette-probe", image: "images/probe.png", duration: 1,
        pixels: [0, 1, 2, 3, ...Array(60).fill(0)] }];
    for (const mapping of [undefined, 0xe4, 0x1b, 0x39]) {
        g.dmgPalette = mapping;
        const colors = [0, 1, 2, 3].map((index) =>
            lib.DMG_COLORS[((mapping ?? 0xe4) >> (index * 2)) & 3]);
        drawn.length = 0;
        asset.kind = "sprite";
        lib.drawAsset(ctx, g, asset, 0, 0, 0, true);
        assert.deepEqual(drawn, colors.slice(1).map((color, n) => ({ x: n + 1, y: 0, color })));
        drawn.length = 0;
        asset.kind = "screen";
        lib.drawAsset(ctx, g, asset, 0, 0, 0, true);
        assert.deepEqual(drawn.slice(0, 4).map((pixel) => pixel.color), colors);
    }
    g.dmgPalette = 0x1b;
    drawn.length = 0;
    lib.drawSimulation(ctx, new lib.Simulation(g), true);
    assert.equal(drawn[0].color, lib.DMG_COLORS[3], "empty playfield uses mapped background index zero");
    drawn.length = 0;
    lib.drawAsset(ctx, g, asset, 0, 0, 0, false);
    assert.deepEqual(drawn.slice(0, 4).map((pixel) => pixel.color), g.palettes[asset.palette].colors,
        "CGB palette colors are independent of the DMG register");
});
test("validation rejects missing reference, palette overflow, tile overflow and unsafe text", () => {
    let g = structuredClone(game);
    g.player.asset = "missing";
    assert.ok(lib.validate(g).some((d) => d.target === "player"));
    g = structuredClone(game);
    g.palettes.push(...g.palettes);
    assert.ok(lib.validate(g).length);
    g = structuredClone(game);
    g.assets[0].frames[0].pixels[0] = 4;
    assert.ok(lib.validate(g).some((d) => d.target === g.assets[0].id));
    g = structuredClone(game);
    g.screens[0].items[0].text = "漢";
    assert.ok(lib.validate(g).length);
    g = structuredClone(game);
    g.stages[0].height = 513;
    assert.ok(lib.validate(g).length);
    assert.throws(() => lib.projectDir(root, "../outside"));
    assert.throws(() => lib.safePath(root, "../outside"));
    assert.throws(() => lib.safePath(root, "."));
});
test("save / reload / recovery / copy preserve stable IDs and protect last good data", () => {
    const base = path.join(root, ".cache");
    fs.mkdirSync(base, { recursive: true });
    const temp = fs.mkdtempSync(path.join(base, "editor-store-"));
    fs.mkdirSync(path.join(temp, "projects"));
    try {
        const g = lib.createProject(temp, "sample-one", "SAMPLE ONE", game),
            disk = lib.readGame(temp, "sample-one");
        assert.deepEqual(disk, g);
        const next = structuredClone(g);
        next.assets[0].frames[0].pixels[0] = 2;
        next.screens[0].items[0].text = "きゃらばん";
        lib.recoverGame(temp, "sample-one", next);
        assert.deepEqual(lib.recoverGame(temp, "sample-one"), next);
        lib.saveGame(temp, "sample-one", next);
        assert.deepEqual(lib.readGame(temp, "sample-one"), next);
        assert.equal(lib.recoverGame(temp, "sample-one"), null);
        const copy = lib.createProject(temp, "sample-two", "SAMPLE TWO", next);
        copy.enemies[0].hp = 7;
        lib.saveGame(temp, "sample-two", copy);
        assert.notEqual(lib.readGame(temp, "sample-one").enemies[0].hp, 7);
        const before = fs.readFileSync(
            path.join(temp, "projects/sample-one/assets-src/game.json"),
        );
        next.player.asset = "missing";
        assert.throws(() => lib.saveGame(temp, "sample-one", next));
        assert.deepEqual(
            fs.readFileSync(
                path.join(temp, "projects/sample-one/assets-src/game.json"),
            ),
            before,
        );
        assert.throws(() =>
            lib.createProject(temp, "sample-one", "OVERWRITE", g),
        );
        // Simulate interruption between a PNG replacement and JSON commit.
        const imageFile = path.join(
            temp,
            "projects/sample-one/assets-src",
            g.assets[0].frames[0].image,
        );
        const oldImage = fs.readFileSync(imageFile);
        lib.atomicWrite(
            path.join(temp, ".cache/editor/transactions/sample-one.json"),
            JSON.stringify([
                [
                    "assets-src/" + g.assets[0].frames[0].image,
                    oldImage.toString("base64"),
                ],
            ]),
        );
        fs.writeFileSync(imageFile, Buffer.from("interrupted write"));
        assert.deepEqual(
            lib.readGame(temp, "sample-one").assets[0].frames[0].pixels,
            lib.decodeIndexedPng(
                oldImage,
                g.assets[0].width,
                g.assets[0].height,
            ),
        );
        // Inject a real file-write failure after an image changed, then verify rollback.
        const broken = structuredClone(g);
        broken.assets[0].frames[0].pixels[1] = 1;
        const target = path.join(
            temp,
            "projects/sample-one/assets-src/game.json",
        );
        fs.renameSync(target, target + ".backup");
        fs.mkdirSync(target);
        const pngPath = path.join(
                temp,
                "projects/sample-one/assets-src",
                g.assets[0].frames[0].image,
            ),
            oldPng = fs.readFileSync(pngPath);
        assert.throws(() => lib.saveGame(temp, "sample-one", broken));
        assert.deepEqual(fs.readFileSync(pngPath), oldPng);
    } finally {
        assert.ok(path.resolve(temp).startsWith(path.resolve(base) + path.sep));
        fs.rmSync(temp, { recursive: true, force: true });
    }
});
test("independent attack layers honor their own delays, repeat counts and intervals", () => {
    const g = structuredClone(game);
    g.stages[0].events = [];
    g.enemies[0].motion = { ...lib.normalMotion(), vx: 0, vy: 0 };
    g.enemies[0].pattern = g.patterns[1].id;
    g.enemies[0].attacks = [{ id: "layer-1", pattern: g.patterns[2].id }];
    g.patterns[1].interval = 10;
    g.patterns[1].delay = 0;
    g.patterns[1].repeats = 2;
    g.patterns[2].interval = 7;
    g.patterns[2].delay = 3;
    g.patterns[2].repeats = 3;
    assert.deepEqual(lib.validate(g), []);
    const sim = new lib.Simulation(g),
        calls = [];
    sim.spawnActor(g.enemies[0].id, "enemy", 60, 40);
    sim.shoot = (id, asset, x, y, friendly, sequence) =>
        calls.push([id, sim.tick, sequence]);
    for (let n = 0; n < 30; n++) sim.step(0);
    assert.deepEqual(calls, [
        [g.patterns[1].id, 0, 0],
        [g.patterns[2].id, 3, 0],
        [g.patterns[1].id, 10, 1],
        [g.patterns[2].id, 10, 1],
        [g.patterns[2].id, 17, 2],
    ]);
});
test("motion and patterns use deterministic fixed-point tables", () => {
    const a = new lib.Simulation(game),
        b = new lib.Simulation(game);
    for (let i = 0; i < 600; i++) {
        const input = i % 120 < 60 ? 17 : 18;
        a.step(input);
        b.step(input);
    }
    assert.deepEqual(a.trace, b.trace);
    assert.equal(lib.angleStep(360), 0);
    assert.equal(lib.aimStep(100, 0), 4);
    assert.equal(lib.aimStep(0, 100), 8);
    const p = { ...game.patterns[0], kind: "ring", count: 8, angle: 0 };
    assert.deepEqual(lib.shotAngles(p, 0, 0, 0), [0, 2, 4, 6, 8, 10, 12, 14]);
    const pathMotion = {
        ...lib.normalMotion(),
        kind: "path",
        loop: false,
        points: [
            { x: 0, y: 0, frame: 0 },
            { x: 32, y: 16, frame: 16 },
        ],
    };
    assert.deepEqual(lib.motionOffset(pathMotion, 8), { x: 256, y: 128 });
});
test("player weapon delay and finite bursts restart on a new trigger", () => {
    const g = structuredClone(game);
    g.stages[0].events = [];
    const p = g.patterns.find((p) => p.id === g.player.weapon);
    p.delay = 2;
    p.interval = 3;
    p.repeats = 2;
    const sim = new lib.Simulation(g),
        shots = [];
    sim.shoot = () => shots.push(sim.tick);
    for (let n = 0; n < 12; n++) sim.step(16);
    sim.step(0);
    for (let n = 0; n < 8; n++) sim.step(16);
    assert.deepEqual(shots, [2, 5, 15, 18]);
});
test("stage selection and 16-bit diagnostic tick follow ROM ordering", () => {
    const g = structuredClone(game),
        extra = structuredClone(g.stages[0]);
    extra.id = "unlisted";
    g.stages.push(extra);
    g.startStage = extra.id;
    let sim = new lib.Simulation(g);
    assert.equal(sim.stageIndex, 1);
    sim.tick = 65536;
    assert.equal(sim.trace.tick, 0);
    g.mode = "campaign";
    sim = new lib.Simulation(g);
    assert.equal(sim.stage.id, g.stageOrder[0]);
});
test("caravan time limit, campaign transitions, collision, boss defeat, and OAM admission", () => {
    const g = structuredClone(game);
    g.stages[0].events = [];
    g.stages[0].duration = 1;
    g.stages[0].walls.fill(0);
    let sim = new lib.Simulation(g);
    for (let i = 0; i < 60; i++) sim.step(0);
    assert.equal(sim.result, 2);
    g.mode = "campaign";
    const second = structuredClone(g.stages[0]);
    second.id = "second";
    g.stages.push(second);
    g.stageOrder.push(second.id);
    sim = new lib.Simulation(g);
    for (let i = 0; i < 60; i++) sim.step(0);
    assert.equal(sim.stageIndex, 1);
    assert.equal(sim.result, 0);
    for (let i = 0; i < 60; i++) sim.step(0);
    assert.equal(sim.result, 2);
    g.mode = "caravan";
    g.player.invulnerability = 0;
    g.player.lives = 1;
    g.stages[0].walls.fill(1);
    sim = new lib.Simulation(g);
    sim.step(0);
    assert.equal(sim.result, 1);
    g.stages[0].walls.fill(0);
    g.bosses[0].hp = 1;
    sim = new lib.Simulation(g);
    sim.spawnActor(g.bosses[0].id, "boss", g.player.x, g.player.y - 20);
    sim.shoot(
        g.player.weapon,
        g.player.asset,
        sim.playerX,
        sim.playerY,
        true,
        0,
    );
    for (let i = 0; i < 10; i++) sim.step(16);
    assert.ok(sim.bossDefeated);
    sim = new lib.Simulation(g);
    for (let i = 0; i < 100; i++)
        sim.spawnActor(g.enemies[0].id, "enemy", 20, 20);
    assert.equal(sim.entities.length, 8);
    assert.equal(sim.dropped, 92);
    assert.ok(sim.oam <= 40);
});
