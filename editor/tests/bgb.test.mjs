import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);
test("BGB official headless interface boots and plays the editor ROM", () => {
    const out = path.join(root, ".cache/editor-qa");
    fs.mkdirSync(out, { recursive: true });
    const movie = path.join(out, "bgb-input.dem"),
        screen = path.join(out, "bgb-play.bmp");
    // BGB 1.6.6 official documentation: one active-button bitmask per VBlank,
    // D-pad in the high nibble, A=bit 0. No desktop/GUI automation is used.
    fs.writeFileSync(
        movie,
        Buffer.concat([Buffer.alloc(240), Buffer.alloc(900, 1)]),
    );
    const result = spawnSync(
        path.join(root, ".tools/bgb/bgb64.exe"),
        [
            "-hf",
            "-nowriteini",
            "-ini",
            path.join(root, ".cache/emulator/bgb/bgb.ini"),
            "-rom",
            path.join(
                root,
                "projects/star-caravan/build/Debug/star-caravan.gb",
            ),
            "-demoplay",
            movie,
            "-screenonexit",
            screen,
        ],
        { cwd: out, windowsHide: true, timeout: 30000 },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.status}: ${result.stderr}`);
    const bmp = fs.readFileSync(screen);
    assert.equal(bmp.toString("ascii", 0, 2), "BM");
    assert.equal(bmp.readInt32LE(18), 160);
    assert.equal(Math.abs(bmp.readInt32LE(22)), 144);
    assert.ok(
        new Set(bmp.subarray(bmp.readUInt32LE(10))).size > 3,
        "Game screen must not be blank",
    );
});
