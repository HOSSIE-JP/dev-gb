import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    initSync,
    GameBoy,
    GameBoyMode,
    BootRom,
    PadKey,
    StateManager,
    SaveStateFormat,
} from "../node_modules/boytacean/boytacean.js";
export { GameBoyMode, PadKey };
const directory = path.dirname(fileURLToPath(import.meta.url));
initSync({
    module: fs.readFileSync(
        path.join(directory, "../node_modules/boytacean/boytacean_bg.wasm"),
    ),
});
export function boot(rom, mode = GameBoyMode.Dmg) {
    const gb = new GameBoy(mode);
    gb.set_boot_rom(
        mode === GameBoyMode.Dmg ? BootRom.DmgBootix : BootRom.CgbBoytacean,
    );
    gb.load_unsafe(true);
    gb.load_rom_wa(new Uint8Array(rom)).free();
    return gb;
}
// BESS 1.0 public layout: https://github.com/LIJI32/SameBoy/blob/master/BESS.md
export function memory(gb) {
    const state = Buffer.from(StateManager.save_wa(gb, SaveStateFormat.Bess));
    for (let p = state.readUInt32LE(state.length - 8); p < state.length - 8;) {
        const kind = state.toString("ascii", p, p + 4),
            size = state.readUInt32LE(p + 4);
        p += 8;
        if (kind === "CORE") {
            const offset = state.readUInt32LE(p + 0x9c),
                length = state.readUInt32LE(p + 0x98);
            return {
                ram: state.subarray(offset, offset + length),
                io: state.subarray(p + 0x18, p + 0x98),
                state,
                core: p,
            };
        }
        p += size;
    }
    throw new Error("BESS CORE missing");
}
export function symbols(file) {
    const data = fs.readFileSync(file, "utf8"),
        result = {};
    for (const m of data.matchAll(/\b([\da-fA-F]{8})\s+(_ce_\w+)\b/g))
        result[m[2]] = parseInt(m[1], 16);
    return result;
}
export function trace(gb, address) {
    const { ram } = memory(gb),
        p = address - 0xc000;
    if (ram.toString("ascii", p, p + 2) !== "CE" || ram[p + 22]) return null;
    return {
        tick: ram.readUInt16LE(p + 2),
        stage: ram[p + 4],
        score: ram.readUInt16LE(p + 5),
        lives: ram[p + 7],
        x: ram.readInt16LE(p + 8),
        y: ram.readInt16LE(p + 10),
        bossHp: ram[p + 12],
        entities: ram[p + 13],
        dropped: ram.readUInt16LE(p + 14),
        result: ram[p + 16],
        scene: ram[p + 17],
        stageTick: ram.readUInt16LE(p + 18),
        bossPhase: ram[p + 20],
    };
}
export function frames(gb, count) {
    for (let i = 0; i < count; i++) gb.clocks_cycles(70224);
}
export function settledTrace(gb, address) {
    // Rendering may span several VBlanks. Sample at sub-frame CPU boundaries
    // until the engine publishes a coherent entity snapshot.
    for (let n = 0; n < 256; n++) {
        const t = trace(gb, address);
        if (t) return t;
        gb.clocks_cycles(512);
    }
    return null;
}
// SDCC/SM83 CE_Entity layout (25 bytes, no padding). Compare live positions,
// velocities and phases only while the diagnostic seqlock is stable.
export function entityState(gb, address, game) {
    const { ram } = memory(gb),
        assets = game.assets.filter((a) => a.kind === "sprite"),
        result = [];
    for (let slot = 0; slot < 31; slot++) {
        const p = address - 0xc000 + slot * 25,
            kind = ram[p];
        if (!kind) continue;
        result.push({
            slot,
            kind: ["", "enemy", "boss", "pshot", "eshot", "fx"][kind],
            asset: assets[ram[p + 2]].id,
            hp: kind === 5 ? 0 : ram[p + 3],
            phase: ram[p + 4],
            age: ram.readUInt16LE(p + 6),
            x: ram.readInt16LE(p + 12),
            y: ram.readInt16LE(p + 14),
            vx: ram.readInt16LE(p + 20),
            vy: ram.readInt16LE(p + 22),
        });
    }
    return result;
}
export function simulatedEntities(sim) {
    return sim.entities
        .map(({ slot, kind, asset, hp, phase, age, x, y, vx, vy }) => ({
            slot,
            kind,
            asset,
            hp: kind === "fx" ? 0 : hp,
            phase,
            age,
            x,
            y,
            vx,
            vy,
        }))
        .sort((a, b) => a.slot - b.slot);
}
