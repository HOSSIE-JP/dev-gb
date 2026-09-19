// Read-only, cycle-weighted PC sampling. No instrumented ROM or gameplay edits.
// node editor/tests/cpu-profile.mjs ROM.gb OUT.json [fromTick=120] [toTick=720] [input=fire|focus|none] [both|DMG|CGB]
// A matching Debug .cdb is required for local-function attribution. Debug and
// Release may share symbols ONLY after checking that their ROM bytes match.
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import {
    boot,
    frames,
    memory,
    symbols,
    GameBoyMode,
    PadKey,
} from "./emulator.mjs";

const [romPath, out, from = "120", to = "720", input = "fire", modeFilter = "both", route = "default", character = "0", stage = "0"] =
    process.argv.slice(2);
assert.ok(["both", "DMG", "CGB"].includes(modeFilter), "mode must be both, DMG or CGB");
const rom = fs.readFileSync(romPath),
    stem = romPath.replace(/\.gb$/, "");
const syms = symbols(stem + ".map"),
    cdb = fs.readFileSync(stem + ".cdb", "utf8");
const ranges = [];
for (const m of cdb.matchAll(
    /^L:((?:F[^$]+|G)\$([^$]+)\$0\$0):([0-9a-f]+)$/gim,
)) {
    const end = cdb.match(
        new RegExp(`^L:X${m[1].replaceAll("$", "\\$")}:([0-9a-f]+)$`, "mi"),
    );
    ranges.push({
        name: m[2],
        start: parseInt(m[3], 16),
        end: end ? parseInt(end[1], 16) : undefined,
    });
}
ranges.sort((a, b) => a.start - b.start);
for (let i = 0; i < ranges.length; i++)
    if (ranges[i].end === undefined) {
        // SDCC does not emit an X/end record for __naked functions. Their next
        // function label bounds them; do not let a library symbol absorb kernels.
        const next = ranges[i + 1];
        // Autobank blob markers have no body/end and may be last in a bank.
        ranges[i].end =
            next && next.start >>> 16 === ranges[i].start >>> 16
                ? next.start - 1
                : ranges[i].start;
    }
assert.ok(
    ranges.some((r) => r.name === "ce_step"),
    "linked C function ranges required",
);
const byAddress = new Map();
for (const r of ranges)
    for (let a = r.start; a <= r.end; a++) byAddress.set(a, r.name);
// Library functions without C debug records: use adjacent linker symbols.
const linked = [
    ...fs
        .readFileSync(stem + ".noi", "utf8")
        .matchAll(/^DEF (_\w+) 0x([0-9a-f]+)$/gim),
]
    .map((m) => ({ name: m[1], address: parseInt(m[2], 16) }))
    .filter(
        (s) =>
            s.address > 0x100 && (s.address < 0x4000 || s.address >= 0x10000),
    )
    .sort((a, b) => a.address - b.address);
for (let i = 0; i < linked.length - 1; i++)
    for (
        let a = linked[i].address;
        a < linked[i + 1].address && a < linked[i].address + 1024;
        a++
    )
        if (!byAddress.has(a)) byAddress.set(a, linked[i].name);
function bankOf(state) {
    let lo = 1,
        hi = 0;
    for (let p = state.readUInt32LE(state.length - 8); p < state.length - 8;) {
        const name = state.toString("ascii", p, p + 4),
            size = state.readUInt32LE(p + 4);
        p += 8;
        if (name === "MBC ")
            for (let q = p; q < p + size; q += 3) {
                const addr = state.readUInt16LE(q),
                    v = state[q + 2];
                if (addr === 0x2000) lo = v;
                if (addr === 0x3000) hi = v & 1;
            }
        p += size;
    }
    return lo + (hi << 8);
}
function category(name){
    if(/wait_vbl|vsync/.test(name))return 'wait';
    if(/publish|dma_transfer|set_bkg|set_sprite_data|set_win|copy_hud_maps/.test(name))return 'transfer';
    if(/ce_bg_flush|compose_dma|pack_map|pack_dma|clear_play_map/.test(name))return 'bgPrepare';
    if(/draw_shot|draw_xy|update_all|occupied_player|guide|ce_bg_begin|ce_bg_update/.test(name))return 'bgUpdateCollision';
    if(/draw_sprites|draw_actor|emit_template|animation|sprite|draw_beam/.test(name))return 'oam';
    if(/collide|box|damage_actor/.test(name))return 'collision';
    if(/shoot|spawn|allocate|init_shot|prepare_shot/.test(name))return 'shooting';
    if(/step_actor|move_complex|move_actor|attack|sequence/.test(name))return 'actors';
    return 'other';
}
const results = {
    rom: romPath,
    romSha256: crypto.createHash("sha256").update(rom).digest("hex"),
    method: "deterministic jittered PC sampling, 256..511 CPU T-cycles; inclusive of interrupts/waits; not per-call timing",
    emulator: "Boytacean 0.13.2",
    fromTick: +from,
    toTick: +to,
    input,
    route, character: +character, stage: +stage,
    modes: [],
};
assert.equal(rom[0x147], 0x1b, "bank decoder here is for the engine MBC5 ROMs");
for (const mode of [GameBoyMode.Dmg, GameBoyMode.Cgb]) {
    if (mode === GameBoyMode.Dmg && rom[0x143] === 0xc0) continue;
    if (modeFilter !== "both" && modeFilter !== (mode === GameBoyMode.Dmg ? "DMG" : "CGB")) continue;
    const gb = boot(rom, mode),
        counts = new Map(),
        tickCosts = new Map(),
        pcs = new Map();
    let seed = 1,
        total = 0,
        samples = 0,
        previousTick = 0;
    try {
        if (route === "fixture") {
            gb.step_to(syms._ce_qa_marker);
        } else if (route !== "default") {
            const byte = name => memory(gb).ram[syms[name] - 0xc000];
            const until = predicate => { for (let n=0;n<12000;n++) { if(predicate())return;frames(gb,1); } throw Error("menu timeout"); };
            const tap = key => { gb.key_press(key);frames(gb,4);gb.key_lift(key);frames(gb,12); };
            until(()=>byte("_ce_scene")===0 && memory(gb).ram.toString("ascii",syms._ce_trace-0xc000,syms._ce_trace-0xc000+2)==="CE" && !memory(gb).ram[syms._ce_trace-0xc000+22] && !byte("_ce_fade_level"));
            if(route==="boss")for(let n=0;n<10;n++)tap(PadKey.B);
            if(+stage){tap(PadKey.Down);for(let n=0;n<+stage;n++)tap(PadKey.Right);}
            tap(PadKey.A);until(()=>byte("_ce_scene")===10&&!byte("_ce_fade_level")&&!memory(gb).ram[syms._ce_trace-0xc000+22]);
            if(+character)tap(PadKey.Right);
            gb.key_press(PadKey.A);
            gb.step_to(syms._ce_step);
        } else {
        frames(gb, 240);
        gb.key_press(PadKey.Start);
        frames(gb, 5);
        gb.key_lift(PadKey.Start);
        for (
            let n = 0;
            n < 600 && memory(gb).ram[syms._ce_scene - 0xc000] !== 1;
            n++
        ) {
            if (memory(gb).ram[syms._ce_scene - 0xc000] === 10) {
                gb.key_press(PadKey.A); frames(gb, 3); gb.key_lift(PadKey.A);
            }
            frames(gb, 1);
        }
        }
        gb.key_lift(PadKey.A);
        if (input === "fire") gb.key_press(PadKey.A);
        if (input === "focus") gb.key_press(PadKey.B);
        // Boss select retains the road timeline. Measure relative to combat
        // entry, otherwise a requested 120..720 interval can be silently empty.
        const tickBase = route === "boss"
            ? memory(gb).ram.readUInt16LE(syms._ce_state - 0xc000) : 0;
        for (let i = 0; i < 2000000; i++) {
            const mem = memory(gb),
                tick = (mem.ram.readUInt16LE(syms._ce_state - 0xc000) - tickBase) & 65535;
            if (tick < +from && [7,8].includes(mem.ram[syms._ce_scene - 0xc000])) {
                frames(gb,1);continue;
            }
            if (mem.ram[syms._ce_scene - 0xc000] !== 1)
                throw Error(`gameplay ended during profile at relative tick ${tick} (base ${tickBase}, scene ${mem.ram[syms._ce_scene - 0xc000]})`);
            previousTick = tick;
            if (tick >= +to) break;
            const regs = gb.registers(),
                pc = regs.pc;
            regs.free();
            const address =
                pc >= 0x4000 && pc < 0x8000
                    ? (bankOf(mem.state) << 16) | pc
                    : pc;
            const name =
                byAddress.get(address) ??
                (pc >= 0xff80
                    ? "HRAM / DMA"
                    : `unmapped ${address.toString(16)}`);
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const elapsed = Number(gb.clocks_cycles(256 + (seed >>> 24)));
            if (tick < +from) continue;
            total += elapsed;
            samples++;
            counts.set(name, (counts.get(name) ?? 0) + elapsed);
            const cost=tickCosts.get(tick)??{};const group=category(name);cost[group]=(cost[group]??0)+elapsed;tickCosts.set(tick,cost);
            pcs.set(address, (pcs.get(address) ?? 0) + elapsed);
        }
        assert.ok(previousTick >= +to, "profile did not reach requested end");
        assert.ok(samples > 0, "profile interval must contain CPU samples");
        results.modes.push({
            mode: mode === GameBoyMode.Dmg ? "DMG" : "CGB",
            tickBase,
            samples,
            totalTCycles: total,
            categoryTCycles: Object.fromEntries(['actors','shooting','collision','oam','bgUpdateCollision','bgPrepare','transfer','wait','other'].map(group=>{
                const values=[...tickCosts.values()].map(c=>c[group]??0).sort((a,b)=>a-b);
                return [group,{mean:values.reduce((a,b)=>a+b,0)/values.length,p95:values[Math.floor(values.length*.95)],max:values.at(-1)}];
            })),
            functions: [...counts]
                .map(([name, cycles]) => ({
                    name,
                    estimatedTCycles: cycles,
                    percent: +((100 * cycles) / total).toFixed(3),
                }))
                .sort((a, b) => b.estimatedTCycles - a.estimatedTCycles),
            hotPCs: [...pcs]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 32)
                .map(([address, cycles]) => ({
                    address: address.toString(16),
                    name: byAddress.get(address),
                    percent: +((100 * cycles) / total).toFixed(3),
                })),
        });
    } finally {
        gb.free();
    }
}
fs.writeFileSync(out, JSON.stringify(results, null, 2) + "\n");
console.log(
    JSON.stringify(
        {
            ...results,
            modes: results.modes.map((m) => ({
                ...m,
                functions: m.functions.slice(0, 16),
                hotPCs: undefined,
            })),
        },
        null,
        2,
    ),
);
