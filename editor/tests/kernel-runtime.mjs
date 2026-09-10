// Build a private, disposable kernel-oracle ROM, then execute in DMG and CGB.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { boot, memory, symbols, GameBoyMode } from "./emulator.mjs";
const root = fileURLToPath(new URL("../..", import.meta.url));
const lib = createRequire(import.meta.url)("../build/library.cjs");
const out = path.resolve(
    process.argv[2] ?? path.join(root, ".cache/kernel-qa"),
);
fs.mkdirSync(out, { recursive: true });
const fixture = fs.mkdtempSync(path.join(out, "fixture-"));
for (const file of ["engine", ".tools/gbdk", ".tools/misaki"])
    fs.cpSync(path.join(root, file), path.join(fixture, file), {
        recursive: true,
    });
const runtime = path.join(fixture, "engine/caravan/runtime.c");
let source = fs.readFileSync(runtime, "utf8");
const harness = fs.readFileSync(
    new URL("./fixtures/kernel_harness.c", import.meta.url),
    "utf8",
);
assert.ok(source.includes("void ce_run(void) NONBANKED {"));
// Keep the actual kernels in fixed bank 0. Only expose their private linkage
// in this disposable copy; the large independent C oracle runs in bank 2.
const functions = [
    "prepare_player_ranges",
    "box",
    "overlap",
    "prepare_shot",
    "init_shot_visual",
    "advance_shot_animation",
    "shot_box",
    "step_bullet",
    "bullet_overlaps",
];
const declarations = [
    "uint8_t shot_top, shot_bottom;",
    "int16_t player_delta_x, player_delta_y;",
    "CE_Box *box_a, *box_b;",
    "CE_Box *box_out;",
    "uint8_t shot_ox[CE_MAX_ENTITIES], shot_oy[CE_MAX_ENTITIES];",
    "uint8_t shot_range_index[CE_MAX_ENTITIES];",
    "uint8_t shot_frames[CE_MAX_ENTITIES], shot_frame[CE_MAX_ENTITIES], shot_left[CE_MAX_ENTITIES];",
];
for (const declaration of declarations) {
    assert.ok(source.includes(`static ${declaration}`), declaration);
    source = source.replace(`static ${declaration}`, declaration);
}
const expose = (text) =>
    text.replace(
        new RegExp(`\\bstatic (void|uint8_t) (${functions.join("|")})\\(`, "g"),
        "$1 $2(",
    );
source = expose(source);
const kernels = path.join(fixture, "engine/caravan/shot-kernels.h");
fs.writeFileSync(kernels, expose(fs.readFileSync(kernels, "utf8")));
fs.writeFileSync(
    runtime,
    source.slice(0, source.indexOf("void ce_run(void) NONBANKED {")) +
        "\nvoid ce_kernel_test(void) BANKED;\nvoid ce_run(void) NONBANKED {\n    ce_kernel_test(); for (;;) vsync();\n}\n",
);
fs.writeFileSync(
    path.join(fixture, "engine/caravan/mainloop.c"),
    '#pragma bank 2\n#include "caravan.h"\n#include <string.h>\n' +
        declarations.map((d) => `extern ${d}`).join("\n") +
        "\nvoid prepare_player_ranges(void);\nvoid box(CE_Box *, const CE_Entity *);\nuint8_t overlap(void);\n" +
        [
            "prepare_shot",
            "init_shot_visual",
            "advance_shot_animation",
            "shot_box",
        ]
            .map((n) => `void ${n}(uint8_t);`)
            .join("\n") +
        "\nuint8_t step_bullet(uint8_t);\nuint8_t bullet_overlaps(uint8_t);\n" +
        harness.replace(
            "static void ce_kernel_test(void)",
            "void ce_kernel_test(void) BANKED",
        ),
);
fs.appendFileSync(
    path.join(fixture, "engine/caravan/render.c"),
    fs.readFileSync(
        new URL("./fixtures/render_harness.c", import.meta.url),
        "utf8",
    ),
);
fs.mkdirSync(path.join(fixture, "projects"));
const game = lib.readGame(root, "star-caravan");
for (const asset of game.assets.filter((a) => a.kind === "sprite")) {
    const original = asset.frames[0],
        durations = asset.id === game.player.asset ? [128, 128] : [3, 7, 11];
    asset.frames = durations.map((duration, i) => ({
        ...structuredClone(original),
        id: `oracle-${i}`,
        image: `images/${asset.id}-oracle-${i}.png`,
        duration,
    }));
}
lib.createProject(fixture, "kernel-test", "KERNEL TEST", game);
const report = lib.compile(fixture, "kernel-test", "Debug", (line) =>
    process.stdout.write(line),
);
const rom = fs.readFileSync(report.romPath),
    s = symbols(report.romPath.replace(/\.gb$/, ".map")),
    results = [];
for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
    const gb = boot(rom, mode);
    let status = 0,
        cases = 0;
    try {
        // Full-age animation traversal adds several billion emulated cycles.
        for (let n = 0; n < 120000; n++) {
            gb.clocks_cycles(65536);
            const m = memory(gb).ram;
            status = m[s._ce_kernel_status - 0xc000];
            cases = m.readUInt16LE(s._ce_kernel_cases - 0xc000);
            if (status > 1) break;
        }
        assert.equal(
            status,
            0xa5,
            `kernel oracle status ${status}, case counter ${cases}`,
        );
        results.push({
            mode: mode === GameBoyMode.Dmg ? "DMG" : "CGB",
            status,
            casesModulo65536: cases,
            boxCases:
                game.assets.filter((a) => a.kind === "sprite").length * 1600,
            movementCases: 100800,
            bulletAnimation:
                "all single-tile assets; all 65536 ages and wrap; slot reuse",
            renderer:
                "all sprite assets; continuous, skipped, repeated and wrapped ages; slot reuse; negative clipping",
        });
    } finally {
        gb.free();
    }
}
fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(
        {
            rom: report.romPath,
            romSha256: crypto.createHash("sha256").update(rom).digest("hex"),
            results,
        },
        null,
        2,
    ) + "\n",
);
console.log(results);
