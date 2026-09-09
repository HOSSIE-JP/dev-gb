import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { boot, frames, memory, symbols, GameBoyMode } from "./emulator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const labels = [
    "same track does not restart its clock",
    "one-shot ends at the exact note boundary and silences music",
    "pause immediately silences both BGM DACs",
    "resume restores the held notes",
    "pause freezes the phrase clock",
    "resumed one-shot ends at its original boundary",
    "long elapsed updates process at most three rows",
    "bounded catch-up leaves a valid remaining duration",
    "every looping track survives multiple complete phrases",
    "clear fanfare remains active for its authored duration",
    "clear fanfare ends once",
    "invalid track selection switches music off",
    "BGM leaves square-1, noise and mixer registers intact",
    "BGM leaves noise pitch intact",
];

for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
    test(`music runtime ${mode === GameBoyMode.Dmg ? "DMG" : "CGB"}: timing, channels, looping and PCM`, () => {
        const work = fs.mkdtempSync(path.join(os.tmpdir(), "caravan-music-"));
        let gb;
        try {
            for (const name of ["music.c", "music.h"])
                fs.copyFileSync(path.join(root, "engine/caravan", name), path.join(work, name));
            fs.copyFileSync(path.join(root, "editor/tests/fixtures/music_harness.c"), path.join(work, "main.c"));
            const result = spawnSync(
                path.join(root, ".tools/gbdk/bin", process.platform === "win32" ? "lcc.exe" : "lcc"),
                ["-Wm-yc", "-Wl-yt0x19", "-Wm-yo4", "-Wl-m", "-Wl-j", "-debug", "-o", "music.gb", "main.c", "music.c"],
                { cwd: work, encoding: "utf8" },
            );
            if (result.error) throw result.error;
            assert.equal(result.status, 0, result.stdout + result.stderr);
            assert.doesNotMatch(result.stdout + result.stderr, /warning/i);
            const address = symbols(path.join(work, "music.map"))._ce_music_test;
            assert.ok(address >= 0xc000 && address < 0xe000);
            gb = boot(fs.readFileSync(path.join(work, "music.gb")), mode);
            let report;
            for (let n = 0; n < 1200; n++) {
                frames(gb, 1);
                report = memory(gb).ram.subarray(address - 0xc000, address - 0xc000 + 16);
                if (report[0] === 0x4d) break;
            }
            assert.equal(report[0], 0x4d, "GBDK test program must reach completion");
            for (let i = 0; i < labels.length; i++) assert.equal(report[i + 1], 1, labels[i]);
            gb.audio_buffer_eager(true);
            frames(gb, 60);
            const samples = gb.audio_buffer_eager(true);
            assert.ok(samples.some((sample) => sample !== 0), "idle title BGM emits PCM without shooting effects");
        } finally {
            gb?.free();
            fs.rmSync(work, { recursive: true, force: true });
        }
    });
}
