import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { clockRomFrame } = createRequire(import.meta.url)("../build/library.cjs");
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
                oam: state.subarray(state.readUInt32LE(p + 0xb4), state.readUInt32LE(p + 0xb4) + state.readUInt32LE(p + 0xb0)),
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
    for (const m of data.matchAll(/\b([\da-fA-F]{8})\s+(_ce_\w+|_shadow_OAM)\b/g))
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
    for (let i = 0; i < count; i++) clockRomFrame(gb);
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
export function entityState(gb, address, game, capacity = 39) {
    const { ram } = memory(gb),
        assets = game.assets.filter((a) => a.kind === "sprite"),
        result = [];
    for (let slot = 0; slot < capacity; slot++) {
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

// Check the actual DMA destination, not just that a render function was called.
export function assertPublishedOam(gb, syms, game, mode) {
    const {ram,oam,io}=memory(gb), state=syms._ce_state-0xc000;
    assert.equal(oam.length,160);
    assert.deepEqual(oam,ram.subarray(syms._shadow_OAM-0xc000,syms._shadow_OAM-0xc000+160),"completed shadow OAM reached hardware before publication");
    const hud=game.screens.find(s=>s.id==='hud'),height=(hud.rows??2)*8,bottom=hud.dock==='bottom';
    assert.equal(io[0x42],((ram.readUInt16LE(state+4)>>4)-(bottom?0:height))&255);
    const assets=new Map();let first=128;
    for(const a of game.assets.filter(a=>a.kind==='sprite')){assets.set(a.id,{...a,first});first+=a.width*a.height/64*a.frames.length;}
    let slot=0;
    const draw=(id,x,y,age)=>{
        const a=assets.get(id);let time=age%a.frames.reduce((n,f)=>n+f.duration,0),frame=0;
        while(frame+1<a.frames.length&&time>=a.frames[frame].duration){time-=a.frames[frame].duration;frame++;}
        let tile=a.first+frame*a.width*a.height/64;
        for(let row=0;row<a.height/8;row++)for(let col=0;col<a.width/8;col++){
            const sx=(Math.trunc(x/16)-a.origin.x+8+col*8)&255,sy=(Math.trunc(y/16)-a.origin.y+16+row*8)&255;
            const visible=((sx-1)&255)<167&&sy>=(bottom?9:height+9)&&sy<(bottom?160-height:160);
            assert.deepEqual([...oam.subarray(slot*4,slot*4+4)],[visible?sy:0,sx,tile++&255,mode===GameBoyMode.Cgb?a.palette:0],`metasprite tile ${slot}`);slot++;
        }
    };
    const immune=ram.readUInt16LE(state+8),wait=ram.readUInt16LE(syms._ce_respawn-0xc000);
    if(!wait&&(!immune||!(immune&4)))draw(game.player.asset,ram.readInt16LE(state+14),ram.readInt16LE(state+16),ram.readUInt16LE(state));
    const capacity=(syms._ce_state-syms._ce_entities)/25;
    assert.ok(Number.isInteger(capacity)&&capacity>0&&capacity<=39,'linked entity pool layout');
    for(const e of entityState(gb,syms._ce_entities,game,capacity))draw(e.asset,e.x,e.y,e.age);
    for(;slot<40;slot++)assert.equal(oam[slot*4],0,'unused OAM tail stays hidden');
}
