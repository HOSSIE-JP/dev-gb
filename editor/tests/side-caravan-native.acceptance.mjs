// BGB's documented -hf/-demoplay/-br interface: unchanged ROM, ordinary inputs,
// read-only CPU breakpoint logging. Separate DMG and CGB hardware modes.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../..");
const file = path.resolve(
    process.argv[2] ??
        path.join(root, "projects/side-caravan/build/Debug/side-caravan.gb"),
);
const out = path.resolve(
    process.argv[3] ?? path.join(root, ".cache/side-native/bgb"),
);
const rom = fs.readFileSync(file),
    map = fs.readFileSync(file.replace(/\.gb$/, ".map"), "utf8");
const syms = Object.fromEntries(
    [...map.matchAll(/\b([\da-fA-F]{8})\s+(_ce_\w+|_sys_time)\b/g)].map((m) => [
        m[2],
        parseInt(m[1], 16),
    ]),
);
const trace = syms._ce_trace,
    state = syms._ce_state;
const signature = Buffer.from([
    0x21,
    (trace + 22) & 255,
    (trace + 22) >> 8,
    0x36,
    0,
]);
const published =
    rom.indexOf(signature, syms._ce_trace_write) + signature.length;
assert.ok(
    published > syms._ce_trace_write && published < syms._ce_sound,
    "coherent trace publication marker",
);
const addresses = [
    trace + 17,
    trace + 2,
    trace + 3,
    trace + 5,
    trace + 6,
    syms._ce_bombs,
    syms._ce_shot_level,
    syms._ce_speed_level,
    state + 4,
    state + 5,
    syms._ce_is_cgb,
    syms._ce_pool_oam,
];
assert.ok(addresses.every(Number.isInteger), "required native symbols exist");
const hex = (n) => n.toString(16),
    breakpoint = `${hex(published)}/..4//SIDE ${addresses.map((n) => `%(${hex(n)})%`).join(" ")}`;
// BGB truncates breakpoint messages at 127 characters. Keep this oracle compact.
assert.ok(breakpoint.split("//")[1].length <= 127);
fs.mkdirSync(out, { recursive: true });
const results = [];
const romHash = crypto.createHash("sha256").update(rom).digest("hex"),
    romCopy = path.join(out, `side-caravan-${romHash.slice(0, 12)}.gb`);
fs.writeFileSync(romCopy, rom);
for (const mode of ["DMG", "CGB"]) {
    const dir = fs.mkdtempSync(path.join(out, mode.toLowerCase() + "-"));
    const exe = path.join(dir, "bgb64.exe");
    fs.copyFileSync(path.join(root, ".tools/bgb/bgb64.exe"), exe);
    // Stable input sequence in displayed frames, without game-RAM changes.
    const demo = Buffer.concat([
        Buffer.alloc(600),
        Buffer.alloc(8, 8),
        Buffer.alloc(40),
        Buffer.alloc(1800, 1),
        Buffer.alloc(160, 3),
        Buffer.alloc(30, 1),
        Buffer.alloc(160, 3),
        Buffer.alloc(2400, 1),
    ]);
    fs.writeFileSync(path.join(dir, "input.dem"), demo);
    const process = spawnSync(
        exe,
        [
            "-hf",
            "-nobatt",
            "-nowriteini",
            "-ini",
            path.join(dir, "bgb.ini"),
            "-set",
            `SystemMode=${mode === "DMG" ? 0 : 1}`,
            "-set",
            "DebugMsgFile=1",
            "-set",
            "DebugMsgFileTS=0",
            "-rom",
            romCopy,
            "-demoplay",
            path.join(dir, "input.dem"),
            "-screenonexit",
            path.join(dir, "screen.bmp"),
            "-br",
            breakpoint,
        ],
        { cwd: dir, windowsHide: true, timeout: 120000 },
    );
    if (process.error) throw process.error;
    assert.equal(process.status, 0, process.stderr?.toString());
    const rows = fs
        .readFileSync(path.join(dir, "debugmsg.txt"), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.startsWith("SIDE "))
        .map((l) =>
            l
                .slice(5)
                .trim()
                .split(/\s+/)
                .map((v) => parseInt(v, 16)),
        );
    assert.ok(
        rows.every((r) => r.length === 12 && r.every(Number.isFinite)),
        "native trace records are complete",
    );
    const gameplay = rows.filter((r) => r[0] === 1),
        bomb = rows.filter((r) => r[0] === 11),
        u16 = (row, i) => row[i] + 256 * row[i + 1];
    assert.ok(gameplay.length > 250, "real input reaches sustained gameplay");
    assert.ok(
        rows.every((r) => r[10] === (mode === "CGB" ? 1 : 0)),
        "requested hardware mode is actually active",
    );
    assert.ok(
        gameplay.every((r) => r[11] <= 40),
        "OAM budget",
    );
    assert.ok(
        Math.max(...gameplay.map((r) => u16(r, 1))) >= 1000,
        "over 1000 gameplay updates observed",
    );
    assert.ok(
        gameplay.some((r) => r[6] > 0),
        "ordinary collision collects power item",
    );
    assert.ok(
        gameplay.some((r) => r[7] > 0),
        "ordinary collision collects speed item",
    );
    assert.ok(
        gameplay.some((r) => u16(r, 3) > 0),
        "score changes through gameplay",
    );
    assert.ok(
        new Set(gameplay.map((r) => u16(r, 8))).size > 100,
        "horizontal world camera advances",
    );
    assert.ok(bomb.length > 10, "B input activates bomb scene");
    const bombGroups = [],
        bombStockBefore = [];
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] !== 11) continue;
        if (!i || rows[i - 1][0] !== 11) {
            assert.equal(
                rows[i - 1]?.[0],
                1,
                "bomb follows a recorded gameplay state",
            );
            bombGroups.push([]);
            bombStockBefore.push(rows[i - 1][5]);
        }
        bombGroups.at(-1).push(rows[i]);
    }
    assert.equal(
        bombGroups.length,
        2,
        "each held B interval spends exactly once",
    );
    // Faster hardware can collect a bomb pickup before the same displayed-frame
    // input. Each press must spend one from its observed pre-activation stock.
    assert.deepEqual(
        bombGroups.map((group) => group[0][5]),
        bombStockBefore.map((stock) => stock - 1),
        "each press consumes one bomb from the current stock",
    );
    for (const group of bombGroups)
        assert.ok(
            group.every(
                (row) =>
                    u16(row, 1) === u16(group[0], 1) && row[5] === group[0][5],
            ),
            "bomb clock and stock stay fixed throughout the effect",
        );
    const bmp = fs.readFileSync(path.join(dir, "screen.bmp"));
    assert.equal(bmp.toString("ascii", 0, 2), "BM");
    assert.equal(bmp.readInt32LE(18), 160);
    assert.ok(
        new Set(bmp.subarray(bmp.readUInt32LE(10))).size > 3,
        "nonblank native screenshot",
    );
    const result = {
        mode,
        gameplaySamples: gameplay.length,
        lastTick: Math.max(...gameplay.map((r) => u16(r, 1))),
        score: Math.max(...gameplay.map((r) => u16(r, 3))),
        shotLevel: Math.max(...gameplay.map((r) => r[6])),
        speedLevel: Math.max(...gameplay.map((r) => r[7])),
        bombSamples: bomb.length,
        bombStocks: [...new Set(bomb.map((r) => r[5]))],
        bombStockBefore,
        heldBombIntervals: bombGroups.length,
        oamPeak: Math.max(...gameplay.map((r) => r[11])),
        cameraPositions: new Set(gameplay.map((r) => u16(r, 8))).size,
        screenshot: path.join(dir, "screen.bmp"),
    };
    results.push(result);
    console.log(result);
}
const report = {
    rom: file,
    loadedRom: romCopy,
    sha256: romHash,
    emulator: "BGB 1.6.6",
    fixture: false,
    readOnlyBreakpoint: true,
    inputFile: "input.dem per mode",
    results,
};
fs.writeFileSync(
    path.join(out, "results.json"),
    JSON.stringify(report, null, 2),
);
