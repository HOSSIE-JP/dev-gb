import fs from "node:fs";
import path from "node:path";

import type { UgeMusicTrack } from "../shared/model";

/** Convert UGE v6 source files into native hUGEDriver C song descriptors. */
export function exportUgeSongs(assets: string, target: string, tracks: UgeMusicTrack[]) {
    const files: string[] = [], rows: string[] = [];
    for (const track of tracks) {
        const input = path.resolve(assets, path.relative("assets-src", track.ugeFile));
        const data = fs.readFileSync(input);
        let p = 0;
        const u32 = () => { if (p + 4 > data.length) throw new Error(`Truncated UGE file at byte ${p}/${data.length}: ${input}`); const n = data.readUInt32LE(p); p += 4; return n; };
        const u8 = () => { if (p >= data.length) throw new Error(`Truncated UGE file at byte ${p}/${data.length}: ${input}`); return data[p++]; };
        const text = () => { const n = data[p]; const s = data.toString("utf8", p + 1, p + 1 + n); p += 256; return s; };
        if (u32() !== 6) throw new Error(`${input}: only UGE v6 is supported`);
        const title = text(), artist = text(); text();
        const instruments: any[] = [];
        for (let i = 0; i < 45; i++) {
            const start = p, kind = u32(), name = text(), length = u32(), lengthEnabled = u8(), volume = u8(), direction = u32(), period = u8(), sweepTime = u32(), sweepDirection = u32(), sweepShift = u32(), duty = u8(), waveVolume = u32(), waveIndex = u32(), noiseBits = u32(), subEnabled = u8(), sub = [];
            for (let n = 0; n < 64; n++) sub.push([u32(), u32(), u32(), u32(), u8()]);
            if (p - start !== 1385) throw new Error(`${input}: invalid instrument record`);
            instruments.push({ kind, name, length, lengthEnabled, volume, direction, period, sweepTime, sweepDirection, sweepShift, duty, waveVolume, waveIndex, noiseBits, subEnabled, sub });
        }
        const waves: number[][] = [];
        for (let i = 0; i < 16; i++) { waves.push([...data.subarray(p, p + 32)]); p += 32; }
        const tempo = u32(), timer = u8(), divider = u32();
        if (timer) throw new Error(`${input}: timer playback is not supported (divider ${divider})`);
        if (!tempo || tempo > 255 || tempo !== track.ticksPerRow) throw new Error(`${input}: invalid tempo`);
        const patternCount = u32(), patterns: number[][][] = [];
        for (let n = 0; n < patternCount; n++) {
            const id = u32(), rows: number[][] = [];
            for (let r = 0; r < 64; r++) { const note = u32(), instrument = u32(); u32(); const effect = u32(); rows.push([note, instrument, effect, u8()]); }
            patterns[id] = rows;
        }
        const orders: number[][] = [];
        for (let ch = 0; ch < 4; ch++) {
            const n = u32(), arr: number[] = [];
            for (let i = 0; i < n - 1; i++) arr.push(u32());
            if (u32() !== 0) throw new Error(`${input}: invalid order terminator`);
            orders.push(arr);
        }
        const routines: Buffer[] = [];
        for (let i = 0; i < 16; i++) { const n = u32(); routines.push(data.subarray(p, p + n)); p += n; }
        if (p !== data.length || orders.some(order => order.length !== orders[0].length)) throw new Error(`${input}: malformed song layout`);
        if (!orders[0].length || orders[0].length > 127 || orders[0].length * 64 !== track.rows) throw new Error(`${input}: invalid order count`);
        if (routines.some(routine => routine.length)) throw new Error(`${input}: custom routines cannot be represented by this GBDK exporter`);
        const symbols = new Map<string, string>(), unique: number[][][] = [];
        for (const order of orders) for (const id of order) {
            const pat = patterns[id]; if (!pat) throw new Error(`${input}: missing pattern ${id}`);
            const key = JSON.stringify(pat);
            if (!symbols.has(key)) { symbols.set(key, `p${unique.length}`); unique.push(pat); }
        }
        const used = [new Set<number>(), new Set<number>(), new Set<number>()];
        for (let ch = 0; ch < 4; ch++) for (const id of orders[ch]) for (const [note, ins] of patterns[id])
            if (note !== 90 && ins) { if (ins > 15) throw new Error(`${input}: invalid instrument index`); used[ch < 2 ? 0 : ch - 1].add(ins - 1); }
        const prefix = `ce_uge_${track.id}`, code = ["#pragma bank 255", "#include <gb/gb.h>", "#include \"hUGEDriver.h\"", `BANKREF(${prefix})`, ""];
        const rowTicks: number[] = [];
        let currentTempo = tempo;
        for (let row = 0; row < track.rows; row++) {
            for (let ch = 0; ch < 4; ch++) {
                const [, , effect, param] = patterns[orders[ch][row >> 6]][row & 63];
                if (effect === 15) {
                    if (!param) throw new Error(`${input}: zero tempo is not supported`);
                    currentTempo = param;
                }
                if (effect === 13 || (effect === 11 && (row !== track.rows - 1 ||
                    param !== (track.endMode === "stop" ? orders[0].length : track.loopStartRow / 64 + 1))))
                    throw new Error(`${input}: only a terminal order jump is supported`);
            }
            rowTicks.push(currentTempo);
        }
        const events = JSON.parse(fs.readFileSync(path.resolve(assets, path.relative("assets-src", track.eventFile)), "utf8"));
        let eventTempo = tempo;
        for (let row = 0; row < track.rows; row++) {
            for (const event of events.events.filter((e: any) => e.row === row).sort((a: any, b: any) => a.ch - b.ch))
                if (event.effect === 15) eventTempo = event.param;
            if (eventTempo !== rowTicks[row]) throw new Error(`${input}: event/UGE tempo mismatch at row ${row}`);
        }
        const speeds = [...new Set(rowTicks)];
        if (speeds.length > 2) throw new Error(`${input}: at most two row tempos are supported`);
        const packedTicks = Array.from({length: Math.ceil(rowTicks.length / 8)}, (_, i) =>
            rowTicks.slice(i * 8, i * 8 + 8).reduce((bits, speed, bit) => bits | (+(speed !== speeds[0]) << bit), 0));
        code.push(`const unsigned char ${prefix}_ticks[]={${packedTicks.join(",")}};`);
        for (let i = 0; i < unique.length; i++) {
            code.push(`static const unsigned char ${prefix}_p${i}[] = {`);
            for (const [note, ins, effect, param] of unique[i]) {
                if (effect > 15) throw new Error(`${input}: unsupported effect ${effect}`);
                code.push(`    DN(${note === 90 ? "___" : note},${ins},0x${((effect << 8) | param).toString(16).toUpperCase().padStart(3, "0")}),`);
            }
            code.push("};");
        }
        for (let ch = 0; ch < 4; ch++) code.push(`static const unsigned char * const ${prefix}_order${ch + 1}[] = {${orders[ch].map(id => `${prefix}_${symbols.get(JSON.stringify(patterns[id]))}`).join(",")}};`);
        for (let kind = 0; kind < 3; kind++) for (let ix = 0; ix < 15; ix++) {
            const ins = instruments[kind * 15 + ix];
            if (!ins.subEnabled || !used[kind].has(ix)) continue;
            code.push(`static const unsigned char ${prefix}_sub${kind}_${ix}[] = {`);
            for (let n = 0; n < 32; n++) {
                let [note, , jump, effect, param] = ins.sub[n]; if (n === 31) jump = 1;
                code.push(`    DN(${note === 90 ? "___" : note},${jump},0x${((effect << 8) | param).toString(16).toUpperCase().padStart(3, "0")}),`);
            }
            code.push("};");
        }
        const env = (ins: any) => (ins.volume << 4) | (ins.direction ? 0 : 8) | (ins.period & 7);
        const sub = (kind: number, ix: number, ins: any) => ins.subEnabled && used[kind].has(ix) ? `${prefix}_sub${kind}_${ix}` : "0";
        code.push(`static const hUGEDutyInstr_t ${prefix}_duty[15] = {`);
        for (let ix = 0; ix < 15; ix++) { const i = instruments[ix]; if (i.kind !== 0 || i.sweepTime > 7 || Math.abs(i.sweepShift) > 7 || i.length > 64) throw new Error(`${input}: invalid pulse instrument`); code.push(`{${(i.sweepTime << 4) | (i.sweepDirection ? 8 : 0) | Math.abs(i.sweepShift)},${(i.duty << 6) | (i.lengthEnabled ? (64 - i.length) & 63 : 0)},${env(i)},${sub(0, ix, i)},${128 | (i.lengthEnabled ? 64 : 0)}},`); }
        code.push("};", `static const hUGEWaveInstr_t ${prefix}_wave[15] = {`);
        for (let ix = 0; ix < 15; ix++) { const i = instruments[15 + ix]; if (i.kind !== 1) throw new Error(`${input}: invalid wave instrument`); code.push(`{${i.lengthEnabled ? (256 - i.length) & 255 : 0},${i.waveVolume << 5},${i.waveIndex},${sub(1, ix, i)},${128 | (i.lengthEnabled ? 64 : 0)}},`); }
        code.push("};", `static const hUGENoiseInstr_t ${prefix}_noise[15] = {`);
        for (let ix = 0; ix < 15; ix++) { const i = instruments[30 + ix]; if (i.kind !== 2) throw new Error(`${input}: invalid noise instrument`); code.push(`{${env(i)},${sub(2, ix, i)},${(i.lengthEnabled ? (64 - i.length) & 63 : 0) | (i.lengthEnabled ? 64 : 0) | (i.noiseBits ? 128 : 0)},0,0},`); }
        code.push("};", `static const unsigned char ${prefix}_waves[16 * 16] = {`);
        for (const wave of waves) code.push(wave.filter((_, i) => !(i & 1)).map((n, i) => ((n << 4) | wave[i * 2 + 1])).join(",") + ",");
        code.push("};", `static const unsigned char ${prefix}_order_count=${orders[0].length * 2};`, `const hUGESong_t ${prefix}={${tempo},&${prefix}_order_count,${prefix}_order1,${prefix}_order2,${prefix}_order3,${prefix}_order4,${prefix}_duty,${prefix}_wave,${prefix}_noise,0,${prefix}_waves};`);
        const file = `caravan_uge_${track.id}.c`;
        fs.writeFileSync(path.join(target, file), code.join("\n") + "\n");
        files.push(file); rows.push(`{BANK(${prefix}),&${prefix},${prefix}_ticks,${track.rows},${track.endMode === "stop" ? 65535 : track.loopStartRow},${speeds[0]},${speeds[1] ?? speeds[0]}}`);
        void title; void artist;
    }
    const refs = tracks.map(t => `BANKREF_EXTERN(ce_uge_${t.id})\nextern const hUGESong_t ce_uge_${t.id};\nextern const unsigned char ce_uge_${t.id}_ticks[];`).join("\n");
    fs.writeFileSync(path.join(target, "caravan_uge_index.c"), `#pragma bank 0\n#include \"music.h\"\n#include \"hUGEDriver.h\"\n${refs}\nconst CE_UgeSongRef ce_uge_scores[22]={${Array.from({ length: 22 }, (_, i) => tracks.some(t => t.id === i + 16) ? rows[tracks.findIndex(t => t.id === i + 16)] : "{0,0,0,0,0,0,0}" ).join(",")}};\n`);
    files.push("caravan_uge_index.c");
    return files;
}
