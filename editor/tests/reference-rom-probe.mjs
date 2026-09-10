// Read-only probe for user-supplied MBC1/MBC5 ROMs. No cheats, RAM writes,
// extracted art in source, or ROM distribution. Output belongs in .cache.
// node editor/tests/reference-rom-probe.mjs ROM.gb OUTDIR [warmup=300] [traceFrames=120]
// Warmup is after Start; A is held. Snapshots at PPU boundaries, then observed
// CPU writes with PC/LY and a validated bank tracker. Writes are ATTEMPTS;
// per-frame VRAM diffs separately show what the PPU actually retained.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boot, frames, memory, GameBoyMode, PadKey } from "./emulator.mjs";
import { disassemble } from "./sm83-disasm.mjs";
const { PNG } = createRequire(import.meta.url)("pngjs");
const [romPath, out, warmup = "300", count = "120", recipe = "direct"] =
        process.argv.slice(2),
    rom = fs.readFileSync(romPath);
fs.mkdirSync(out, { recursive: true });
const type = rom[0x147],
    mbc1 = [1, 2, 3].includes(type);
assert.ok(
    mbc1 || [0x19, 0x1a, 0x1b].includes(type),
    "supported bank controller",
);
const gb = boot(rom, GameBoyMode.Dmg),
    rows = [],
    writes = [],
    writers = new Map(),
    pcs = new Map();
let bank = 1,
    upper = 0,
    bankMode = 0,
    oldMem,
    oldVram,
    ram,
    hram,
    lowRomBank = 0,
    cycle = 0,
    lastPc = -1;
const png = (file, rgb, w = 160, h = 144) => {
    const p = new PNG({ width: w, height: h });
    for (let i = 0; i < w * h; i++) {
        p.data[i * 4] = rgb[i * 3];
        p.data[i * 4 + 1] = rgb[i * 3 + 1];
        p.data[i * 4 + 2] = rgb[i * 3 + 2];
        p.data[i * 4 + 3] = 255;
    }
    fs.writeFileSync(path.join(out, file), PNG.sync.write(p));
};
function mbcState(state) {
    const values = new Map();
    for (let p = state.readUInt32LE(state.length - 8); p < state.length - 8;) {
        const name = state.toString("ascii", p, p + 4),
            size = state.readUInt32LE(p + 4);
        p += 8;
        if (name === "MBC ")
            for (let q = p; q < p + size; q += 3)
                values.set(state.readUInt16LE(q), state[q + 2]);
        p += size;
    }
    return values;
}
function syncBanks(state, check = false) {
    const m = mbcState(state),
        lo = m.get(0x2000) ?? 1,
        hi = m.get(mbc1 ? 0x4000 : 0x3000) ?? 0,
        mode = m.get(0x6000) ?? 0;
    const actual = mbc1
        ? (lo & 31 || 1) | ((hi & 3) << 5)
        : lo | ((hi & 1) << 8);
    if (check)
        assert.equal(
            bank,
            actual,
            "observed ROM bank writes match emulator BESS state",
        );
    bank = actual;
    upper = hi;
    bankMode = mode;
    lowRomBank = mbc1 && mode ? (hi & 3) << 5 : 0;
}
function read(address) {
    address &= 65535;
    if (address < 0x4000)
        return rom[(lowRomBank * 0x4000 + address) % rom.length];
    if (address < 0x8000)
        return rom[(bank * 0x4000 + address - 0x4000) % rom.length];
    if (address >= 0xc000 && address < 0xe000) return ram[address - 0xc000];
    if (address >= 0xff80 && address < 0xffff) return hram[address - 0xff80];
    throw Error(
        `instruction fetch outside supported code memory ${address.toString(16)}`,
    );
}
function snapshot(index, capture = false) {
    const m = memory(gb),
        v = Buffer.from(gb.vram_eager()),
        lines = Array(144).fill(0),
        height = m.io[0x40] & 4 ? 16 : 8;
    let objs = 0;
    for (let s = 0; s < 40; s++) {
        const y = m.oam[s * 4] - 16;
        if (y <= -height || y >= 144) continue;
        objs++;
        for (let l = Math.max(0, y); l < Math.min(144, y + height); l++)
            lines[l]++;
    }
    const diff = (start, end) => {
        let n = 0;
        if (oldVram)
            for (let i = start; i < end; i++) if (v[i] !== oldVram[i]) n++;
        return n;
    };
    rows.push({
        frame: index,
        ppu: gb.ppu_frame(),
        lcdc: m.io[0x40],
        scy: m.io[0x42],
        scx: m.io[0x43],
        bgp: m.io[0x47],
        wy: m.io[0x4a],
        wx: m.io[0x4b],
        objects: objs,
        peakScanline: Math.max(...lines),
        oamChanged: oldMem ? !m.oam.equals(oldMem.oam) : false,
        tileBytesChanged: diff(0, 0x1800),
        map9800Changed: diff(0x1800, 0x1c00),
        map9c00Changed: diff(0x1c00, 0x2000),
    });
    if (capture) {
        png(`frame-${index}.png`, gb.frame_buffer_eager());
        fs.writeFileSync(path.join(out, `frame-${index}-vram.bin`), v);
        fs.writeFileSync(path.join(out, `frame-${index}-oam.bin`), m.oam);
        fs.writeFileSync(path.join(out, `frame-${index}-io.bin`), m.io);
    }
    oldMem = m;
    oldVram = v;
    ram = Buffer.from(m.ram);
    hram = Buffer.from(gb.hram_eager());
    return m;
}
try {
    frames(gb, 600);
    png("title.png", gb.frame_buffer_eager());
    gb.key_press(PadKey.Start);
    frames(gb, 8);
    gb.key_lift(PadKey.Start);
    if (recipe === "menu") {
        frames(gb, 120);
        gb.key_press(PadKey.A);
        frames(gb, 8);
        gb.key_lift(PadKey.A);
        frames(gb, 8);
    }
    gb.key_press(PadKey.A);
    for (let n = 0; n < +warmup; n++) {
        gb.next_frame();
        snapshot(n, [60, 120, +warmup - 2, +warmup - 1].includes(n));
    }
    syncBanks(oldMem.state);
    const start = gb.ppu_frame();
    let frame = start;
    while (gb.ppu_frame() - start < +count) {
        const reg = gb.registers(),
            pc = reg.pc,
            op = read(pc),
            address =
                pc < 0x4000
                    ? (lowRomBank << 16) | pc
                    : pc < 0x8000
                      ? (bank << 16) | pc
                      : pc;
        // HALT repeatedly returns the following PC: only trace an instruction
        // once until the CPU advances. Exclude idle repeats from writer counts.
        const decoding = disassemble(read, pc);
        let dest = -1,
            value = 0;
        if (pc !== lastPc) {
            if (op === 0xe0) {
                dest = 0xff00 + read(pc + 1);
                value = reg.a;
            } else if (op === 0xe2) {
                dest = 0xff00 + reg.c;
                value = reg.a;
            } else if (op === 0xea) {
                dest = read(pc + 1) | (read(pc + 2) << 8);
                value = reg.a;
            } else if ([0x02, 0x12, 0x22, 0x32].includes(op)) {
                dest =
                    op === 2
                        ? (reg.b << 8) | reg.c
                        : op === 0x12
                          ? (reg.d << 8) | reg.e
                          : (reg.h << 8) | reg.l;
                value = reg.a;
            } else if (
                op === 0x36 ||
                (op >= 0x70 && op <= 0x77 && op !== 0x76)
            ) {
                dest = (reg.h << 8) | reg.l;
                value =
                    op === 0x36
                        ? read(pc + 1)
                        : [reg.b, reg.c, reg.d, reg.e, reg.h, reg.l, 0, reg.a][
                              op & 7
                          ];
            }
            if (dest >= 0x2000 && dest < 0x4000)
                bank = mbc1
                    ? (value & 31 || 1) | ((upper & 3) << 5)
                    : dest < 0x3000
                      ? (bank & 256) | value
                      : (bank & 255) | ((value & 1) << 8);
            if (mbc1 && dest >= 0x4000 && dest < 0x6000) {
                upper = value;
                bank = (bank & 31) | ((upper & 3) << 5);
                lowRomBank = bankMode ? (upper & 3) << 5 : 0;
            }
            if (mbc1 && dest >= 0x6000 && dest < 0x8000) {
                bankMode = value & 1;
                lowRomBank = bankMode ? (upper & 3) << 5 : 0;
            }
            if (dest >= 0xc000 && dest < 0xe000) ram[dest - 0xc000] = value;
            if (dest >= 0xff80 && dest < 0xffff) hram[dest - 0xff80] = value;
            if (
                (dest >= 0x8000 && dest < 0xa000) ||
                [
                    0xff40, 0xff42, 0xff43, 0xff46, 0xff47, 0xff4a, 0xff4b,
                ].includes(dest)
            ) {
                const zone =
                        dest < 0x9800
                            ? "tile-data"
                            : dest < 0xa000
                              ? "tile-map"
                              : dest.toString(16),
                    key = `${address.toString(16)}:${zone}`;
                const item = writers.get(key) ?? {
                    address: address.toString(16),
                    zone,
                    instruction: decoding.text,
                    attempts: 0,
                    minLY: 154,
                    maxLY: 0,
                    values: new Set(),
                    destMin: dest,
                    destMax: dest,
                };
                item.attempts++;
                item.minLY = Math.min(item.minLY, reg.ly);
                item.maxLY = Math.max(item.maxLY, reg.ly);
                item.values.add(value);
                item.destMin = Math.min(item.destMin, dest);
                item.destMax = Math.max(item.destMax, dest);
                writers.set(key, item);
                if (dest >= 0xff00)
                    writes.push({
                        frame: gb.ppu_frame() - start,
                        cycle,
                        pc: address.toString(16),
                        ly: reg.ly,
                        address: dest.toString(16),
                        value,
                    });
            }
        }
        reg.free();
        const elapsed = gb.clock();
        cycle += elapsed;
        pcs.set(address, (pcs.get(address) ?? 0) + elapsed);
        lastPc = pc;
        if (gb.ppu_frame() !== frame) {
            frame = gb.ppu_frame();
            const m = snapshot(
                +warmup + frame - start,
                [1, 2, +count].includes(frame - start),
            );
            syncBanks(m.state, true);
        }
    }
    const result = {
        romSha256: crypto.createHash("sha256").update(rom).digest("hex"),
        romBytes: rom.length,
        cartridgeType: type,
        mode: "DMG",
        emulator: "Boytacean 0.13.2",
        input: `boot 600; Start 8; ${recipe === "menu" ? "wait 120; A 8; wait 8; " : ""}hold A`,
        warmup: +warmup,
        traceFrames: +count,
        rows,
        writes,
        writers: [...writers.values()]
            .map((w) => ({ ...w, values: [...w.values].sort((a, b) => a - b) }))
            .sort((a, b) => b.attempts - a.attempts),
        hotPCs: [...pcs]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 24)
            .map(([pc, cycles]) => ({
                pc: pc.toString(16),
                cycles,
                percent: (100 * cycles) / cycle,
            })),
    };
    fs.writeFileSync(
        path.join(out, "probe.json"),
        JSON.stringify(result, null, 2) + "\n",
    );
    console.log(
        JSON.stringify(
            {
                ...result,
                rows: rows.slice(-4),
                writes: undefined,
                hotPCs: result.hotPCs.slice(0, 8),
            },
            null,
            2,
        ),
    );
} finally {
    gb.free();
}
