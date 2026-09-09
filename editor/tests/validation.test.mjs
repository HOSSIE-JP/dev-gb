import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url),
    lib = require("../build/library.cjs"),
    root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
    game = lib.readGame(root, "star-caravan");

test("malformed project JSON produces actionable diagnostics instead of exceptions", () => {
    const broken = [
        ["missing player", (g) => delete g.player],
        ["null asset", (g) => (g.assets[0] = null)],
        ["non-array frames", (g) => (g.assets[0].frames = {})],
        ["missing origin", (g) => delete g.assets[0].origin],
        ["null hitbox", (g) => (g.assets[0].hitbox = null)],
        ["null emitter", (g) => g.assets[0].emitters.push(null)],
        ["missing pixels", (g) => delete g.assets[0].frames[0].pixels],
        ["null motion", (g) => (g.enemies[0].motion = null)],
        ["null path point", (g) => (g.enemies[0].motion.points[0] = null)],
        ["null attack layer", (g) => (g.enemies[0].attacks = [null])],
        ["non-array phases", (g) => (g.bosses[0].phases = "broken")],
        ["missing stage order", (g) => delete g.stageOrder],
        ["null event", (g) => (g.stages[0].events = [null])],
        ["missing map tiles", (g) => delete g.stages[0].tiles],
        ["missing terrain", (g) => delete g.stages[0].walls],
        ["missing palette colors", (g) => delete g.palettes[0].colors],
        ["numeric screen text", (g) => (g.screens[0].items[0].text = 123)],
        ["non-string ID", (g) => (g.patterns[0].id = 123)],
        ["non-boolean loop", (g) => (g.stages[0].loopMap = "false")],
        ["non-boolean path loop", (g) => (g.enemies[0].motion.loop = 0)],
        ["missing provenance", (g) => delete g.provenance],
        ["unsupported schema", (g) => (g.schemaVersion = 2)],
    ];
    for (const [label, mutate] of broken) {
        const copy = structuredClone(game);
        mutate(copy);
        let diagnostics;
        assert.doesNotThrow(() => (diagnostics = lib.validate(copy)), label);
        assert.ok(
            diagnostics.some((d) => d.severity === "error"),
            label,
        );
        assert.ok(
            diagnostics.every((d) => d.target && d.message),
            label,
        );
    }
    for (const value of [null, undefined, "project", [], {}])
        assert.ok(lib.validate(value).length);
});

test("shape validation supports disk pixels and legacy optional attack layers", () => {
    const copy = structuredClone(game);
    for (const actor of [...copy.enemies, ...copy.bosses]) delete actor.attacks;
    for (const boss of copy.bosses)
        for (const phase of boss.phases) delete phase.attacks;
    assert.deepEqual(lib.validate(copy), []);
    for (const asset of copy.assets)
        for (const frame of asset.frames) delete frame.pixels;
    assert.deepEqual(lib.validateShape(copy, { requirePixels: false }), []);
    assert.ok(lib.validateShape(copy).length);
    copy.enemies[0].hp = -1;
    assert.deepEqual(
        lib.validateShape(copy, { requirePixels: false }),
        [],
        "Incomplete edits can be recovered while semantic diagnostics remain visible",
    );
});

test("nested stable IDs reject empty and duplicate entries", () => {
    for (const select of [
        (g) => g.assets[0].frames,
        (g) => g.bosses[0].phases,
        (g) => g.stages[0].events,
        (g) => g.screens[0].items,
    ]) {
        const copy = structuredClone(game),
            items = select(copy);
        items.push(structuredClone(items[0]));
        assert.ok(lib.validate(copy).some((d) => d.message.includes("ID")));
        items.pop();
        items[0].id = "   ";
        assert.ok(lib.validate(copy).some((d) => d.message.includes("ID")));
    }
    const copy = structuredClone(game);
    copy.screens[0].dock = "left";
    copy.screens.push({ ...copy.screens[0], id: "unused-screen" });
    assert.ok(lib.validate(copy).some((d) => d.target === "unused-screen"));
    assert.ok(lib.validate(copy).some((d) => d.message.includes("配置")));
});

test("source PNG collisions are diagnosed before save can replace artwork", () => {
    const copy = structuredClone(game),
        asset = copy.assets[0],
        original = asset.frames[0];
    asset.frames.push({ ...structuredClone(original), id: "another-frame" });
    assert.deepEqual(
        lib.validate(copy),
        [],
        "Identical buffers may share an existing image",
    );
    asset.frames[1].image =
        "images/" +
        path.basename(original.image).replace(/[a-z]/, (c) => c.toUpperCase());
    asset.frames[1].pixels[0] = (original.pixels[0] + 1) % 4;
    assert.ok(
        lib
            .validate(copy)
            .some(
                (d) =>
                    d.message.includes("画像パス") &&
                    d.message.includes("重複"),
            ),
    );
    fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
    const temp = fs.mkdtempSync(path.join(root, ".cache/model-validation-"));
    try {
        fs.mkdirSync(path.join(temp, "projects"));
        lib.createProject(temp, "safe", "SAFE", game);
        copy.name = "safe";
        const file = path.join(
                temp,
                "projects/safe/assets-src",
                original.image,
            ),
            before = fs.readFileSync(file);
        assert.throws(() => lib.saveGame(temp, "safe", copy), /画像パス/);
        assert.deepEqual(fs.readFileSync(file), before);
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
});

test("event diagnostics reflect playable ticks and expanded ROM capacity", () => {
    const copy = structuredClone(game),
        stage = copy.stages[0];
    stage.duration = 1;
    const event = { ...stage.events[0], frame: 59, count: 1, interval: 0 };
    stage.events = [event];
    assert.deepEqual(lib.validate(copy), []);
    let sim = new lib.Simulation(copy),
        spawned = 0;
    sim.spawnActor = () => spawned++;
    for (let i = 0; i < 60; i++) sim.step(0);
    assert.equal(spawned, 1, "Last playable tick executes");
    event.frame = 60;
    assert.ok(lib.validate(copy).some((d) => d.target === event.id));
    event.frame = 59;
    event.count = 2;
    event.interval = 1;
    assert.ok(lib.validate(copy).some((d) => d.message.includes("終了時刻")));
    event.kind = "scroll";
    event.count = 8;
    event.interval = 1024;
    assert.deepEqual(
        lib.validate(copy),
        [],
        "Scroll events execute once; formation fields are unused",
    );
    stage.events = Array.from({ length: 129 }, (_, i) => ({
        ...event,
        id: "large-" + i,
        kind: "enemy",
        frame: 0,
        count: 8,
        interval: 0,
    }));
    assert.ok(lib.validate(copy).some((d) => d.message.includes("1024個")));
});
