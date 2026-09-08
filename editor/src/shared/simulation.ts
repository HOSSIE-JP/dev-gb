import {
    type Game,
    type Asset,
    type Motion,
    type Actor,
    type Boss,
    type Pattern,
    type Stage,
    assetById,
    frameAt,
    q4,
    clamp,
} from "./model";
import { dmgColors } from "./palette";

// 0 = up, 4 = right, 8 = down. These integer tables are emitted into the ROM.
export const SIN = [
    0, 6, 11, 15, 16, 15, 11, 6, 0, -6, -11, -15, -16, -15, -11, -6,
];
export const COS = [
    16, 15, 11, 6, 0, -6, -11, -15, -16, -15, -11, -6, 0, 6, 11, 15,
];
export const angleStep = (degrees: number) =>
    ((Math.round(degrees / 22.5) % 16) + 16) % 16;
export function aimStep(dx: number, dy: number) {
    let best = -32768,
        result = 0;
    for (let n = 0; n < 16; n++) {
        const score = dx * SIN[n] - dy * COS[n];
        if (score > best) {
            best = score;
            result = n;
        }
    }
    return result;
}
export function shotAngles(
    pattern: Pattern,
    sequence: number,
    dx: number,
    dy: number,
): number[] {
    let base = angleStep(pattern.angle);
    if (pattern.kind === "aimed") base = (base + aimStep(dx, dy)) & 15;
    if (pattern.kind === "spiral")
        base = (base + sequence * angleStep(pattern.rotation)) & 15;
    const count =
        pattern.kind === "straight" || pattern.kind === "aimed"
            ? 1
            : pattern.count;
    return Array.from({ length: count }, (_, i) => {
        const offset =
            pattern.kind === "ring"
                ? Math.trunc((i * 16) / count)
                : count > 1
                  ? Math.round(
                        (-pattern.spread / 2 +
                            (pattern.spread * i) / (count - 1)) /
                            22.5,
                    )
                  : 0;
        return (base + offset + 32) & 15;
    });
}
export function motionOffset(m: Motion, age: number): { x: number; y: number } {
    if (m.kind === "path") {
        const points = m.points,
            end = points.at(-1)!.frame;
        const time = m.loop && end ? age % end : Math.min(age, end);
        let i = 0;
        while (i < points.length - 2 && time >= points[i + 1].frame) i++;
        const a = points[i],
            b = points[i + 1],
            dt = Math.max(1, b.frame - a.frame),
            t = time - a.frame;
        return {
            x: q4(a.x) + Math.trunc(q4(b.x - a.x) / dt) * t,
            y: q4(a.y) + Math.trunc(q4(b.y - a.y) / dt) * t,
        };
    }
    let x = q4(m.vx) * age,
        y = q4(m.vy) * age;
    if (m.kind === "wave")
        x += SIN[Math.trunc(((age % m.period) * 16) / m.period)] * m.amplitude;
    if (m.kind === "bounce") {
        const quarter = Math.max(1, Math.trunc(m.period / 4)),
            phase = Math.trunc((age % (quarter * 4)) / quarter),
            part = age % quarter;
        const span = Math.trunc((part * m.amplitude) / quarter);
        x += q4(
            phase === 0
                ? span
                : phase === 1
                  ? m.amplitude - span
                  : phase === 2
                    ? -span
                    : -m.amplitude + span,
        );
    }
    return { x, y };
}
export type Entity = {
    slot: number;
    kind: "enemy" | "boss" | "pshot" | "eshot" | "fx";
    ref: string;
    asset: string;
    x: number;
    y: number;
    baseX: number;
    baseY: number;
    vx: number;
    vy: number;
    hp: number;
    age: number;
    phase: number;
    phaseAge: number;
    sequence: number;
    lifetime: number;
    damage: number;
};
export type Trace = {
    tick: number;
    stage: number;
    score: number;
    lives: number;
    x: number;
    y: number;
    bossHp: number;
    entities: number;
    dropped: number;
    result: number;
};
export class Simulation {
    tick = 0;
    stageIndex = 0;
    stageTick = 0;
    camera = 0;
    scroll = 0;
    score = 0;
    lives = 3;
    playerX = 0;
    playerY = 0;
    invulnerable = 0;
    cooldown = 0;
    playerSequence = 0;
    weaponMode = 0;
    entities: Entity[] = [];
    dropped = 0;
    result = 0;
    bossDefeated = false;
    stage: Stage;
    input = 0;
    aim: { x: number; y: number } | null = null;
    constructor(
        public game: Game,
        stageId = game.mode === "campaign"
            ? game.stageOrder[0]
            : game.startStage,
    ) {
        const ordered = [
            ...game.stageOrder,
            ...game.stages
                .map((s) => s.id)
                .filter((id) => !game.stageOrder.includes(id)),
        ];
        this.stageIndex = Math.max(0, ordered.indexOf(stageId));
        this.stage =
            game.stages.find((s) => s.id === stageId) ?? game.stages[0];
        this.lives = game.player.lives;
        this.playerX = q4(game.player.x);
        this.playerY = q4(game.player.y);
        this.invulnerable = game.player.invulnerability;
        this.camera = this.stage.scrollDown ? (this.stage.height * 8 - 128) * 16 : 0;
        this.scroll = q4(this.stage.scrollSpeed);
        this.cooldown =
            game.patterns.find((p) => p.id === game.player.weapon)?.delay ?? 0;
    }
    slots(asset: string) {
        const a = assetById(this.game, asset);
        return (a.width * a.height) / 64;
    }
    get oam() {
        return (
            this.slots(this.game.player.asset) +
            this.entities.reduce((n, e) => n + this.slots(e.asset), 0)
        );
    }
    get bossHp() {
        return this.entities.find((e) => e.kind === "boss")?.hp ?? 0;
    }
    get trace(): Trace {
        return {
            tick: this.tick & 65535,
            stage: this.stageIndex,
            score: this.score,
            lives: this.lives,
            x: this.playerX,
            y: this.playerY,
            bossHp: this.bossHp,
            entities: this.entities.length,
            dropped: this.dropped & 65535,
            result: this.result,
        };
    }
    add(entity: Omit<Entity, "slot">) {
        const limits = { enemy: 8, boss: 1, pshot: 6, eshot: 16, fx: 4 };
        if (
            this.entities.length >= 31 ||
            this.entities.filter((e) => e.kind === entity.kind).length >=
                limits[entity.kind] ||
            this.oam + this.slots(entity.asset) > 40
        ) {
            this.dropped++;
            return;
        }
        let slot = 0;
        while (this.entities.some((e) => e.slot === slot)) slot++;
        this.entities.push({ ...entity, slot });
        this.entities.sort((a, b) => a.slot - b.slot);
    }
    spawnActor(ref: string, kind: "enemy" | "boss", x: number, y: number) {
        const actor = (
            kind === "boss" ? this.game.bosses : this.game.enemies
        ).find((a) => a.id === ref);
        if (!actor) return;
        this.add({
            kind,
            ref,
            asset: actor.asset,
            x: q4(x),
            y: q4(y),
            baseX: q4(x),
            baseY: q4(y),
            vx: 0,
            vy: 0,
            hp: actor.hp,
            age: 0,
            phase: 0,
            phaseAge: 0,
            sequence: 0,
            lifetime: 0,
            damage: 1,
        });
    }
    shoot(
        ref: string,
        sourceAsset: string,
        x: number,
        y: number,
        friendly: boolean,
        sequence: number,
    ) {
        const p = this.game.patterns.find((p) => p.id === ref);
        if (!p) return;
        const asset = assetById(this.game, sourceAsset);
        const emitters = asset.emitters.length
            ? asset.emitters
            : [{ x: asset.origin.x, y: asset.origin.y }];
        for (const emitter of emitters) {
            const px = x + q4(emitter.x - asset.origin.x),
                py = y + q4(emitter.y - asset.origin.y);
            const targetX = this.aim ? q4(this.aim.x) : this.playerX,
                targetY = this.aim ? q4(this.aim.y) : this.playerY;
            for (const angle of shotAngles(
                p,
                sequence,
                Math.trunc((targetX - px) / 16),
                Math.trunc((targetY - py) / 16),
            )) {
                const speed = q4(p.speed);
                this.add({
                    kind: friendly ? "pshot" : "eshot",
                    ref,
                    asset: p.asset,
                    x: px,
                    y: py,
                    baseX: px,
                    baseY: py,
                    vx: Math.trunc((SIN[angle] * speed) / 16) | 0,
                    vy: Math.trunc((-COS[angle] * speed) / 16) | 0,
                    hp: 1,
                    age: 0,
                    phase: 0,
                    phaseAge: 0,
                    sequence: 0,
                    lifetime: p.lifetime,
                    damage: p.damage,
                });
            }
        }
    }
    box(asset: string, x: number, y: number) {
        const a = assetById(this.game, asset);
        return {
            x: Math.trunc(x / 16) - a.origin.x + a.hitbox.x,
            y: Math.trunc(y / 16) - a.origin.y + a.hitbox.y,
            w: a.hitbox.w,
            h: a.hitbox.h,
        };
    }
    overlap(
        a: ReturnType<Simulation["box"]>,
        b: ReturnType<Simulation["box"]>,
    ) {
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }
    wall(box: ReturnType<Simulation["box"]>) {
        const camera = Math.trunc(this.camera / 16),
            top =
                this.game.screens.find((s) => s.id === "hud")?.dock === "top"
                    ? 16
                    : 0;
        const right = box.x + box.w - 1,
            bottom = box.y + box.h - 1;
        if (right < 0 || box.x >= 160 || bottom < top) return false;
        const x1 = Math.max(0, Math.floor(box.x / 8)),
            x2 = Math.min(19, Math.floor(right / 8));
        const y1 = Math.floor((Math.max(top, box.y) - top + camera) / 8),
            y2 = Math.floor((bottom - top + camera) / 8);
        for (let y = y1; y <= y2; y++) {
            const row = this.stage.loopMap ? y % this.stage.height : y;
            if (row >= this.stage.height) continue;
            for (let x = x1; x <= x2; x++)
                if (this.stage.walls[row * 20 + x]) return true;
        }
        return false;
    }
    hitPlayer() {
        if (this.invulnerable || this.result) return;
        this.explode(this.playerX, this.playerY);
        this.lives--;
        if (!this.lives) this.result = 1;
        else {
            this.invulnerable = this.game.player.invulnerability;
            this.playerX = q4(this.game.player.x);
            this.playerY = q4(this.game.player.y);
        }
    }
    finishStage() {
        this.score = Math.min(65535, this.score + this.game.clearBonus);
        if (
            this.game.mode === "campaign" &&
            this.stageIndex + 1 < this.game.stageOrder.length
        ) {
            this.stageIndex++;
            this.stage = this.game.stages.find(
                (s) => s.id === this.game.stageOrder[this.stageIndex],
            )!;
            this.stageTick = 0;
            this.camera = this.stage.scrollDown ? (this.stage.height * 8 - 128) * 16 : 0;
            this.scroll = q4(this.stage.scrollSpeed);
            this.entities = [];
            this.bossDefeated = false;
            this.cooldown = this.game.patterns.find(
                (p) => p.id === this.game.player.weapon,
            )!.delay;
            this.playerSequence = 0;
            this.playerX = q4(this.game.player.x);
            this.weaponMode = 0;
            this.playerY = q4(this.game.player.y);
            this.invulnerable = this.game.player.invulnerability;
        } else this.result = 2;
    }
    explode(x: number, y: number) {
        if (!this.game.effects.explosion) return;
        this.add({
            kind: "fx",
            ref: "",
            asset: this.game.effects.explosion,
            x,
            y,
            baseX: x,
            baseY: y,
            vx: 0,
            vy: 0,
            hp: 1,
            age: 0,
            phase: 0,
            phaseAge: 0,
            sequence: 0,
            lifetime: this.game.effects.duration,
            damage: 0,
        });
    }
    step(input = this.input) {
        if (this.result) return;
        const g = this.game,
            p = g.player,
            a = assetById(g, p.asset),
            top =
                g.screens.find((s) => s.id === "hud")?.dock === "top" ? 16 : 0;
        const mode = input & 32 && p.focusWeapon ? 1 : 0;
        const pattern = mode ? p.focusWeapon! : p.weapon;
        const weapon = g.patterns.find((x) => x.id === pattern)!;
        const speed = q4(mode ? p.focusSpeed ?? p.speed : p.speed);
        if (this.weaponMode !== mode) {
            this.weaponMode = mode;
            this.cooldown = weapon.delay;
            this.playerSequence = 0;
        }
        this.playerX += (input & 1 ? speed : 0) - (input & 2 ? speed : 0);
        this.playerY += (input & 8 ? speed : 0) - (input & 4 ? speed : 0);
        this.playerX = clamp(
            this.playerX,
            q4(a.origin.x),
            q4(160 - a.width + a.origin.x),
        );
        this.playerY = clamp(
            this.playerY,
            q4(top + a.origin.y),
            q4(top + 128 - a.height + a.origin.y),
        );
        if (!(input & 48)) {
            this.cooldown = weapon.delay;
            this.playerSequence = 0;
        } else if (this.cooldown) this.cooldown--;
        else if (!weapon.repeats || this.playerSequence < weapon.repeats) {
            this.shoot(
                pattern,
                p.asset,
                this.playerX,
                this.playerY,
                true,
                this.playerSequence,
            );
            this.playerSequence = (this.playerSequence + 1) & 255;
            this.cooldown = weapon.interval - 1;
        }
        if (this.invulnerable) this.invulnerable--;
        this.camera += this.stage.scrollDown ? -this.scroll : this.scroll;
        const mapEnd = this.stage.height * 8 * 16;
        if (this.stage.loopMap) this.camera = (this.camera + mapEnd) % mapEnd;
        else
            this.camera = Math.min(
                Math.max(0, this.camera),
                (this.stage.height * 8 - 128) * 16,
            );
        let finish = false;
        for (const event of this.stage.events) {
            if (event.kind === "enemy" || event.kind === "boss") {
                for (let n = 0; n < event.count; n++)
                    if (this.stageTick === event.frame + n * event.interval)
                        this.spawnActor(
                            event.ref,
                            event.kind,
                            event.x + n * event.spacing,
                            event.y,
                        );
            } else if (this.stageTick === event.frame) {
                if (event.kind === "scroll") this.scroll = q4(event.value);
                else finish = true;
            }
        }
        // Stable slot order, like the fixed C entity pool. New shots move next tick.
        const active = [...this.entities];
        for (const e of active) {
            if (e.kind === "fx") {
                e.age++;
                if (e.age >= e.lifetime)
                    this.entities = this.entities.filter((x) => x !== e);
            } else if (e.kind === "pshot" || e.kind === "eshot") {
                e.x += e.vx;
                e.y += e.vy;
                e.age++;
                if (
                    e.age >= e.lifetime ||
                    this.wall(this.box(e.asset, e.x, e.y))
                )
                    this.entities = this.entities.filter((x) => x !== e);
            } else {
                const actor = (e.kind === "boss" ? g.bosses : g.enemies).find(
                    (a) => a.id === e.ref,
                )!;
                let motion = actor.motion,
                    pattern = actor.pattern,
                    attacks = actor.attacks ?? [];
                if (e.kind === "boss") {
                    const phases = (actor as Boss).phases,
                        phase = phases[e.phase];
                    if (
                        e.phase + 1 < phases.length &&
                        (phase.until === "time"
                            ? e.phaseAge >= phase.threshold
                            : e.hp <= phase.threshold)
                    ) {
                        e.phase++;
                        e.phaseAge = 0;
                        e.sequence = 0;
                        e.baseX = e.x;
                        e.baseY = e.y;
                    }
                    motion = phases[e.phase].motion;
                    pattern = phases[e.phase].pattern;
                    attacks = phases[e.phase].attacks ?? [];
                }
                const offset = motionOffset(
                    motion,
                    e.kind === "boss" ? e.phaseAge : e.age,
                );
                e.x = e.baseX + offset.x;
                e.y = e.baseY + offset.y;
                const age = e.kind === "boss" ? e.phaseAge : e.age;
                for (const id of [pattern, ...attacks.map((p) => p.pattern)]) {
                    const shot = g.patterns.find((p) => p.id === id);
                    if (
                        !shot ||
                        age < shot.delay ||
                        (age - shot.delay) % shot.interval !== 0
                    )
                        continue;
                    const sequence = Math.trunc(
                        (age - shot.delay) / shot.interval,
                    );
                    if (!shot.repeats || sequence < shot.repeats)
                        this.shoot(
                            id,
                            e.asset,
                            e.x,
                            e.y,
                            false,
                            sequence & 255,
                        );
                }
                e.age++;
                e.phaseAge++;
            }
            if (e.x < -512 || e.x > 3072 || e.y < -512 || e.y > 2816)
                this.entities = this.entities.filter((x) => x !== e);
        }
        for (const shot of [...this.entities].filter(
            (e) => e.kind === "pshot",
        )) {
            const enemy = this.entities.find(
                (e) =>
                    (e.kind === "enemy" || e.kind === "boss") &&
                    this.overlap(
                        this.box(e.asset, e.x, e.y),
                        this.box(shot.asset, shot.x, shot.y),
                    ),
            );
            if (!enemy) continue;
            this.entities = this.entities.filter((e) => e !== shot);
            enemy.hp -= shot.damage;
            if (enemy.hp <= 0) {
                const def = (enemy.kind === "boss" ? g.bosses : g.enemies).find(
                    (e) => e.id === enemy.ref,
                )!;
                this.score = Math.min(65535, this.score + def.score);
                this.entities = this.entities.filter((e) => e !== enemy);
                if (enemy.kind === "boss") this.bossDefeated = true;
                this.explode(enemy.x, enemy.y);
            }
        }
        const playerBox = this.box(p.asset, this.playerX, this.playerY);
        if (this.wall(playerBox)) this.hitPlayer();
        for (const e of this.entities)
            if (
                e.kind !== "pshot" &&
                e.kind !== "fx" &&
                this.overlap(playerBox, this.box(e.asset, e.x, e.y))
            ) {
                this.hitPlayer();
                if (e.kind === "eshot")
                    this.entities = this.entities.filter((a) => a !== e);
            }
        this.tick++;
        this.stageTick++;
        if (!this.result && this.stage.requireBoss && !this.bossDefeated && (finish || this.stageTick >= this.stage.duration * 60))
            this.result = 1;
        if (
            !this.result &&
            (finish ||
                (this.bossDefeated && this.stage.clearOnBoss) ||
                this.stageTick >= this.stage.duration * 60)
        )
            this.finishStage();
    }
}

export function drawAsset(
    ctx: CanvasRenderingContext2D,
    game: Game,
    asset: Asset,
    x: number,
    y: number,
    tick: number,
    dmg: boolean,
    colorsOverride?: string[],
) {
    const frame = frameAt(asset, tick),
        colors =
            colorsOverride ??
            (dmg
                ? dmgColors(game)
                : game.palettes[asset.palette]?.colors);
    if (!frame || !colors) return;
    for (let py = 0; py < asset.height; py++)
        for (let px = 0; px < asset.width; px++) {
            const c = frame.pixels[py * asset.width + px];
            if (asset.kind === "sprite" && c === 0) continue;
            ctx.fillStyle = colors[c];
            ctx.fillRect(Math.floor(x) + px, Math.floor(y) + py, 1, 1);
        }
}
export function drawSimulation(
    ctx: CanvasRenderingContext2D,
    sim: Simulation,
    dmg: boolean,
    hitboxes = false,
) {
    const g = sim.game,
        s = sim.stage,
        top = g.screens.find((s) => s.id === "hud")?.dock === "top" ? 16 : 0;
    ctx.fillStyle = dmg ? dmgColors(g)[0] : g.palettes[0].colors[0];
    ctx.fillRect(0, 0, 160, 144);
    const tileset = assetById(g, s.tileset),
        frame = tileset?.frames[0],
        colors = dmg
            ? dmgColors(g)
            : g.palettes[tileset.palette].colors;
    if (frame)
        for (let y = 0; y < 128; y++)
            for (let x = 0; x < 160; x++) {
                const wy = y + Math.trunc(sim.camera / 16);
                let row = Math.trunc(wy / 8);
                if (s.loopMap) row %= s.height;
                if (row >= s.height) continue;
                const cell = row * 20 + Math.trunc(x / 8),
                    tile = s.tiles[cell],
                    tx = (tile % (tileset.width / 8)) * 8,
                    ty = Math.trunc(tile / (tileset.width / 8)) * 8;
                ctx.fillStyle =
                    colors[
                        frame.pixels[
                            (ty + (wy & 7)) * tileset.width + tx + (x & 7)
                        ]
                    ];
                ctx.fillRect(x, y + top, 1, 1);
                if (
                    hitboxes &&
                    s.walls[cell] &&
                    (x % 8 === 0 || wy % 8 === 0)
                ) {
                    ctx.fillStyle = "#ff586b";
                    ctx.fillRect(x, y + top, 1, 1);
                }
            }
    const draw = (assetId: string, x: number, y: number, age = sim.tick) => {
        const a = assetById(g, assetId);
        drawAsset(
            ctx,
            g,
            a,
            Math.trunc(x / 16) - a.origin.x,
            Math.trunc(y / 16) - a.origin.y,
            age,
            dmg,
        );
        if (hitboxes) {
            const b = sim.box(assetId, x, y);
            ctx.strokeStyle = "#ffde59";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
        }
    };
    if (!sim.invulnerable || (sim.invulnerable & 4) === 0)
        draw(g.player.asset, sim.playerX, sim.playerY);
    for (const e of sim.entities) draw(e.asset, e.x, e.y, e.age);
}
