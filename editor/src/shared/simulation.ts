import {
    type Game,
    type Asset,
    type Motion,
    type Actor,
    type Boss,
    type BossPhase,
    type Pattern,
    type Stage,
    assetById,
    hudHeight,
    frameAt,
    q4,
    clamp,
} from "./model";
import { advanceCamera, initialCamera, horizontalStage, screenToWorld, stageCell, destructibleIndex, worldToScreen } from "./stage-space";
import { dmgColors } from "./palette";

export const ENTITY_LIMIT = 39;
export const POOL_LIMITS = { enemy: 12, boss: 1, pshot: 6, eshot: 32, fx: 4, item: 4 };

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
    const ax = Math.abs(dx), ay = Math.abs(dy);
    const scores = [ay * 16, ax * 6 + ay * 15, (ax + ay) * 11, ax * 15 + ay * 6, ax * 16];
    let best = -1, result = 0;
    for (let i = 0; i < 5; i++) {
        const angle = dx < 0 ? (dy > 0 ? 8 + i : (16 - i) & 15) : (dy > 0 ? 8 - i : i);
        if (scores[i] > best || (scores[i] === best && angle < result)) { best = scores[i]; result = angle; }
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
        pattern.kind === "straight" || pattern.kind === "aimed" || pattern.kind === "homing"
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
export function launchPoints(p: Pattern, a: Asset, x: number, y: number, sequence: number) {
    const l=p.launch;
    if(!l || l.kind==="actor")return p.emitterOffsets ? p.emitterOffsets.map(e=>({x:x+q4(e.x),y:y+q4(e.y),angle:p.angle})) : (a.emitters.length?a.emitters:[a.origin]).map(e=>({x:x+q4(e.x-a.origin.x),y:y+q4(e.y-a.origin.y),angle:p.angle}));
    const py=q4(l.y+(sequence%l.lanes)*l.step);
    if(l.kind==="fixed")return [{x:q4(l.x),y:py,angle:p.angle}];
    const sides=l.kind==="both"?[false,true]:[l.kind==="right"||l.kind==="alternate"&&!!(sequence&1)];
    return sides.map(right=>({x:q4(right?158:1),y:py,angle:p.kind==="aimed"?p.angle:right?270:90}));
}
export function homingAngle(angle:number, dx:number, dy:number, horizontal=false) {
    let target=aimStep(dx,dy);
    if(horizontal){target=(target+12)&15;angle=(angle+12)&15;}
    if(target<4||target>12)target=horizontal?(dy<0?12:4):(dx<0?12:4);
    angle=clamp(angle,4,12);return (angle+Math.sign(target-angle)+(horizontal?4:0))&15;
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
    if (m.kind === "wave") {
        const oscillation = SIN[Math.trunc(((age % m.period) * 16) / m.period)] * m.amplitude;
        if (m.oscillationAxis === "y") y += oscillation; else x += oscillation;
    }
    if (m.kind === "bounce") {
        const quarter = Math.max(1, Math.trunc(m.period / 4)),
            phase = Math.trunc((age % (quarter * 4)) / quarter),
            part = age % quarter;
        const span = Math.trunc((part * m.amplitude) / quarter);
        const oscillation = q4(
            phase === 0
                ? span
                : phase === 1
                  ? m.amplitude - span
                  : phase === 2
                    ? -span
                    : -m.amplitude + span,
        );
        if (m.oscillationAxis === "y") y += oscillation; else x += oscillation;
    }
    return { x, y };
}
export type Entity = {
    slot: number;
    kind: "enemy" | "boss" | "pshot" | "eshot" | "fx" | "item";
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
    shotLevel = 0;
    speedLevel = 0;
    objectHp = new Uint8Array(256);
    objectCells = new Map<number, number>();
    score = 0;
    lives = 3;
    playerX = 0;
    playerY = 0;
    invulnerable = 0;
    respawn = 0;
    cooldown = 0;
    playerSequence = 0;
    weaponMode = 0;
    entities: Entity[] = [];
    bgShots: {x: number; y: number; vx: number; vy: number; life: number; damage: number; slot: number; ref: string; angle: number}[] = [];
    bgNext=0;
    bombs=0;
    bombLeft=0;
    bombLatch=true;
    bombBackground="";
    bombStyle="orb";
    battleMode = "stage";
    bgLimit = 64;
    intro: BossPhase["intro"] | undefined;
    introLeft = 0;
    phaseLocked = false;
    transition: {boss: Entity; stage: "break" | "return"; elapsed: number; x: number; y: number} | undefined;
    finishPhase(boss: Entity) {
        const b = this.game.bosses.find(b => b.id === boss.ref)!;
        boss.x = boss.baseX = q4(b.battle?.returnX ?? 80); boss.y = boss.baseY = q4(b.battle?.returnY ?? 36);
        ++boss.phase; boss.phaseAge = 0; boss.sequence = 0;
        const phase = b.phases[boss.phase]; if (phase.hp) boss.hp = phase.hp;
        this.transition = undefined; this.startIntro(phase);
        this.phaseLocked = !!this.introLeft || !!phase.hp && phase.until === "time";
    }
    startPhaseChange(boss: Entity, damage: boolean) {
        this.bombLatch=true;
        this.phaseLocked = true; this.bgShots = []; this.bgNext=0;
        this.entities = this.entities.filter(e => !["pshot", "eshot", "fx"].includes(e.kind));
        if (!damage) {this.finishPhase(boss); return;}
        this.explode(boss.x, boss.y);
        this.transition = {boss, stage: "break", elapsed: 0, x: boss.x, y: boss.y};
    }
    startIntro(phase: BossPhase) {
        if (!phase.intro?.enabled) return;
        this.entities = this.entities.filter(e => e.kind !== "pshot" && e.kind !== "eshot");
        this.bgShots = []; this.bgNext=0; this.bombLatch=true;this.intro = phase.intro; this.introLeft = Math.round(phase.intro.seconds * 60);
    }
    dropped = 0;
    result = 0;
    gameOverState: "delay" | "continue" | "done" | undefined;
    deathLeft = 0;
    continueLeft = 0;
    highscores = [0, 0, 0, 0, 0];
    private resultInput = 0;
    readonly sourceGame: Game;
    readonly character: number;
    bossDefeated = false;
    stage: Stage;
    input = 0;
    aim: { x: number; y: number } | null = null;
    constructor(
        public game: Game,
        stageId = game.mode === "campaign"
            ? game.stageOrder[0]
            : game.startStage,
        character=0,
    ) {
        this.sourceGame = game; this.character = character;
        const extra=character ? game.player.characters?.[character-1] : undefined;
        this.bombBackground=extra?.bombBackground || game.player.bomb?.background || "";this.bombStyle=extra?.bombStyle ?? "orb";
        game=this.game={...game,player:{...game.player,...extra}};
        this.bombs=game.player.bomb?.enabled?game.player.bomb.stock:0;
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
        this.camera = initialCamera(this.game, this.stage);
        this.resetObjects();
        this.scroll = q4(this.stage.scrollSpeed);
        this.cooldown =
            game.patterns.find((p) => p.id === this.currentWeapon)?.delay ?? 0;
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
        const caps = this.game.performance;
        const limits = { ...POOL_LIMITS, enemy: caps?.enemies ?? POOL_LIMITS.enemy, pshot: caps?.playerShots ?? POOL_LIMITS.pshot, eshot: caps?.enemyShots ?? POOL_LIMITS.eshot, fx: caps?.effects ?? POOL_LIMITS.fx };
        const reserve = this.game.items?.length && entity.kind !== "item" ? Math.max(0, 4 - this.entities.filter(e => e.kind === "item").length) : 0;
        if (
            this.entities.length >= ENTITY_LIMIT - reserve ||
            this.entities.filter((e) => e.kind === entity.kind).length >=
                limits[entity.kind] ||
            this.oam + this.slots(entity.asset) > 40 - reserve
        ) {
            this.dropped++;
            return;
        }
        let slot = 0;
        while (this.entities.some((e) => e.slot === slot)) slot++;
        this.entities.push({ ...entity, slot });
        this.entities.sort((a, b) => a.slot - b.slot);
    }
    get currentWeapon() { return this.game.player.powerUps?.shotWeapons[this.shotLevel] ?? this.game.player.weapon; }
    get currentSpeed() { return this.game.player.powerUps?.speedLevels[this.speedLevel] ?? this.game.player.speed; }
    resetObjects() {
        this.objectHp.fill(0); this.objectCells = destructibleIndex(this.stage);
        this.stage.destructibles?.objects.forEach((o, i) => this.setObjectHp(i, this.stage.destructibles!.types.find(t => t.id === o.type)!.hp));
    }
    getObjectHp(index: number) { return (this.objectHp[index >> 1] >> ((index & 1) * 4)) & 15; }
    setObjectHp(index: number, hp: number) { const shift = (index & 1) * 4; this.objectHp[index >> 1] = (this.objectHp[index >> 1] & ~(15 << shift)) | ((hp & 15) << shift); }
    objectAtCell(cell: number) {
        if (cell < 0) return undefined;
        return this.objectCells.get(Math.floor(Math.floor(cell / this.stage.width) / 2) * Math.ceil(this.stage.width / 2) + Math.floor((cell % this.stage.width) / 2));
    }
    tileAt(cell: number) {
        const index = this.objectAtCell(cell), s = this.stage;
        if (index !== undefined && this.getObjectHp(index)) {
            const object = s.destructibles!.objects[index], type = s.destructibles!.types.find(t => t.id === object.type)!;
            return type.tiles[(Math.floor(cell / s.width) - object.y) * 2 + cell % s.width - object.x];
        }
        return s.tiles[cell];
    }
    objectsOverlapping(box: {x:number;y:number;w:number;h:number}) {
        if (this.battleMode !== "stage") return [];
        const top = this.game.screens.find(s => s.id === "hud")?.dock === "top" ? hudHeight(this.game) : 0;
        const left = Math.max(0, box.x), right = Math.min(160, box.x + box.w), upper = Math.max(top, box.y), bottom = Math.min(top + 144 - hudHeight(this.game), box.y + box.h);
        const found = new Set<number>();
        if (right <= left || bottom <= upper) return [];
        const a = screenToWorld(this.game, this.stage, this.camera, left, upper), b = screenToWorld(this.game, this.stage, this.camera, right - 1, bottom - 1);
        for (let y = Math.floor(a.y / 8); y <= Math.floor(b.y / 8); y++) for (let x = Math.floor(a.x / 8); x <= Math.floor(b.x / 8); x++) {
            const index = this.objectAtCell(stageCell(this.stage, x * 8, y * 8));
            if (index !== undefined && this.getObjectHp(index)) found.add(index);
        }
        return [...found];
    }
    damageObject(index: number, damage: number) {
        const hp = this.getObjectHp(index); if (!hp) return;
        this.setObjectHp(index, Math.max(0, hp - damage));
        if (hp > damage) return;
        const object = this.stage.destructibles!.objects[index], type = this.stage.destructibles!.types.find(t => t.id === object.type)!;
        this.score = Math.min(65535, this.score + type.score);
        const point = worldToScreen(this.game, this.stage, this.camera, object.x * 8 + 8, object.y * 8 + 8);
        if (this.stage.loopMap) {
            if (horizontalStage(this.stage) && point.x < -7) point.x += this.stage.width * 8;
            if (!horizontalStage(this.stage) && point.y < (this.game.screens.find(s=>s.id==="hud")?.dock==="top"?hudHeight(this.game):0)-7) point.y += this.stage.height * 8;
        }
        if (type.dropItem) this.spawnItem(type.dropItem, point.x, point.y);
    }
    spawnItem(ref: string, x: number, y: number) {
        const item = this.game.items?.find(i => i.id === ref); if (!item) return;
        this.add({kind: "item", ref, asset: item.asset, x:q4(x), y:q4(y), baseX:q4(x), baseY:q4(y), vx:0,vy:0,hp:0,age:0,phase:0,phaseAge:0,sequence:0,lifetime:item.lifetime,damage:0});
    }
    collectItem(entity: Entity) {
        const item = this.game.items?.find(i => i.id === entity.ref); if (!item || !this.entities.includes(entity)) return;
        this.entities = this.entities.filter(e => e !== entity);
        for (const effect of item.effects) {
            if (effect.kind === "shot") {this.shotLevel = Math.min((this.game.player.powerUps?.shotWeapons.length ?? 1) - 1, this.shotLevel + effect.amount);this.cooldown=0;this.playerSequence=0;}
            if (effect.kind === "speed") {this.speedLevel = Math.min((this.game.player.powerUps?.speedLevels.length ?? 1) - 1, this.speedLevel + effect.amount);this.cooldown=0;this.playerSequence=0;}
            if (effect.kind === "bomb") this.bombs = Math.min(this.game.player.bomb?.maxStock ?? 9, this.bombs + effect.amount);
            if (effect.kind === "life") this.lives = Math.min(this.game.player.maxLives ?? 9, this.lives + effect.amount);
            if (effect.kind === "score") this.score = Math.min(65535, this.score + effect.amount);
        }
    }
    spawnActor(ref: string, kind: "enemy" | "boss", x: number, y: number) {
        const actor = (
            kind === "boss" ? this.game.bosses : this.game.enemies
        ).find((a) => a.id === ref);
        if (!actor || (kind === "enemy" && this.battleMode !== "stage") || (kind === "boss" && this.entities.some(e => e.kind === "boss"))) return;
        if (kind === "boss") { const b = actor as Boss; this.battleMode = b.battle?.background ?? "stage"; this.bgLimit = b.battle?.maxBullets ?? 64; if (this.battleMode !== "stage") {this.entities = []; this.bgShots = []; this.bgNext=0;this.scroll = 0;} this.startIntro(b.phases[0]); }
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
            hp: kind === "boss" ? (actor as Boss).phases[0].hp || actor.hp : actor.hp,
            age: 0,
            phase: 0,
            phaseAge: 0,
            sequence: 0,
            lifetime: 0,
            damage: 1,
        });
        if (kind === "boss") this.phaseLocked = !!(actor as Boss).phases[0].hp && (actor as Boss).phases[0].until === "time";
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
        const points = launchPoints(friendly?{...p,launch:undefined}:p,asset,x,y,sequence);
        if (friendly && this.game.player.atomicVolleys) {
            const count = points.length * shotAngles(p, sequence, 0, 0).length;
            const reserve = this.game.items?.length ? Math.max(0, 4 - this.entities.filter(e => e.kind === "item").length) : 0;
            if (this.entities.length + count > ENTITY_LIMIT - reserve || this.entities.filter(e => e.kind === "pshot").length + count > (this.game.performance?.playerShots ?? 6) || this.oam + count * this.slots(p.asset) > 40 - reserve) { this.dropped+=count; return; }
        }
        for (const point of points) {
            const px=point.x,py=point.y;
            const targetX = this.aim ? q4(this.aim.x) : this.playerX,
                targetY = this.aim ? q4(this.aim.y) : this.playerY;
            for (const angle of shotAngles(
                {...p,angle:point.angle},
                sequence,
                Math.trunc((targetX - px) / 16),
                Math.trunc((targetY - py) / 16),
            )) {
                const speed = q4(p.speed);
                if (!friendly && this.battleMode === "bg-bullets") {
                    if (this.bgShots.length < this.bgLimit) {
                        while(this.bgShots.some(b=>b.slot===this.bgNext))this.bgNext=(this.bgNext+1)%this.bgLimit;
                        this.bgShots.push({x: px, y: py, vx: Math.trunc(SIN[angle] * speed / 16), vy: Math.trunc(-COS[angle] * speed / 16), life: p.lifetime, damage: p.damage,slot:this.bgNext,ref:p.id,angle});this.bgNext=(this.bgNext+1)%this.bgLimit;
                    }
                    else this.dropped++;
                    continue;
                }
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
                    sequence: angle,
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
    wall(box: ReturnType<Simulation["box"]>, includeObjects = true) { return this.terrainCollision(box, includeObjects ? 0 : 3, 0); }
    terrainCollision(box: ReturnType<Simulation["box"]>, mode: number, damage: number) {
        if (this.battleMode !== "stage") return false;
        const top = this.game.screens.find(s => s.id === "hud")?.dock === "top" ? hudHeight(this.game) : 0;
        const right = box.x + box.w - 1,
            bottom = box.y + box.h - 1;
        if (right < 0 || box.x >= 160 || bottom < top || box.y >= top + 144 - hudHeight(this.game)) return false;
        const a = screenToWorld(this.game, this.stage, this.camera, Math.max(0, box.x), Math.max(top, box.y)), b = screenToWorld(this.game, this.stage, this.camera, Math.min(159, right), Math.min(top + 143 - hudHeight(this.game), bottom));
        for (let y = Math.floor(a.y / 8); y <= Math.floor(b.y / 8); y++) for (let x = Math.floor(a.x / 8); x <= Math.floor(b.x / 8); x++) {
            const cell=stageCell(this.stage,x*8,y*8),index=this.objectAtCell(cell);
            if(mode!==3&&index!==undefined&&this.getObjectHp(index)){
                if(mode===1){this.damageObject(index,damage);return true;}
                const object=this.stage.destructibles!.objects[index],type=this.stage.destructibles!.types.find(t=>t.id===object.type)!;
                if(type.solid)return true;
            }
            if(this.stage.walls[cell])return true;
        }
        return false;
    }
    damageActor(enemy:Entity,damage:number) {
        if(enemy.kind==="boss"){
            if(this.phaseLocked)return;
            const b=this.game.bosses.find(b=>b.id===enemy.ref)!,p=b.phases[enemy.phase];
            if(p.until==="hp"&&b.phases[enemy.phase+1]&&(p.hp||b.phases[enemy.phase+1].intro?.enabled)&&enemy.hp-damage<=(p.hp?0:p.threshold)){
                enemy.hp=p.hp?0:p.threshold;this.phaseLocked=true;this.bgShots=[];this.bgNext=0;
                this.entities=this.entities.filter(e=>e.kind!=="pshot"&&e.kind!=="eshot");return;
            }
        }
        enemy.hp-=damage;
        if(enemy.hp<=0){
            const a=(enemy.kind==="boss"?this.game.bosses:this.game.enemies).find(a=>a.id===enemy.ref)!;
            this.score=Math.min(65535,this.score+a.score);this.entities=this.entities.filter(e=>e!==enemy);
            if(a.dropItem)this.spawnItem(a.dropItem,enemy.x/16,enemy.y/16);
            if(enemy.kind==="boss")this.bossDefeated=true;this.explode(enemy.x,enemy.y);
        }
    }
    hitPlayer() {
        if (this.respawn || this.invulnerable || this.result) return;
        this.explode(this.playerX, this.playerY);
        this.lives--;
        const power = this.game.player.powerUps;
        if (power) {
            const miss = (level: number, policy: string) => policy === "reset" ? 0 : policy === "down" ? Math.max(0, level - 1) : level;
            this.shotLevel = miss(this.shotLevel, power.shotOnMiss); this.speedLevel = miss(this.speedLevel, power.speedOnMiss);
            this.cooldown=0;this.playerSequence=0;
        }
        if (!this.lives) this.result = 1;
        else {
            this.bombs=this.game.player.bomb?.enabled?this.game.player.bomb.stock:0;this.bombLatch=true;
            this.respawn = this.game.player.respawnDelay ?? 0;
            this.invulnerable = this.respawn ? 0 : this.game.player.invulnerability;
            if (this.respawn) {
                this.entities = this.entities.filter(e => e.kind !== "pshot");
                this.cooldown = 0; this.playerSequence = 0;
            }
            this.playerX = q4(this.game.player.x);
            this.playerY = q4(this.game.player.y);
        }
    }
    finishStage() {
        this.battleMode = "stage"; this.bgShots = []; this.bgNext=0;this.bombLatch=true;this.intro = undefined; this.introLeft = 0; this.phaseLocked = false; this.transition = undefined;
        if (this.game.bossCelebration && this.bossDefeated) this.entities = [];
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
            this.camera = initialCamera(this.game, this.stage);
            this.resetObjects();
            this.scroll = q4(this.stage.scrollSpeed);
            this.entities = [];
            this.bossDefeated = false;
            this.cooldown = this.game.patterns.find(
                (p) => p.id === this.currentWeapon,
            )!.delay;
            this.playerSequence = 0;
            this.playerX = q4(this.game.player.x);
            this.weaponMode = 0;
            this.playerY = q4(this.game.player.y);
            this.invulnerable = this.respawn ? 0 : this.game.player.invulnerability;
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
    private gameOverStep(input: number) {
        const pressed = input & ~this.resultInput; this.resultInput = input;
        if (!this.gameOverState) {
            const index = this.highscores.findIndex(score => this.score > score);
            if (index >= 0) { this.highscores.splice(index, 0, this.score); this.highscores.length = 5; }
            this.deathLeft = Math.round((this.game.continue?.delaySeconds ?? 0) * 60);
            this.gameOverState = "delay";
            if (!this.lives) this.respawn = 1;
            return;
        }
        if (this.gameOverState === "delay") {
            if (this.deathLeft) {
                for (const e of this.entities) if (e.kind === "fx") { ++e.age; --e.lifetime; }
                this.entities = this.entities.filter(e => e.kind !== "fx" || e.lifetime > 0);
                if (--this.deathLeft) return;
            }
            this.continueLeft = this.game.continue?.enabled ? this.game.continue.seconds * 60 : 0;
            this.gameOverState = this.continueLeft ? "continue" : "done";
            return;
        }
        if (this.gameOverState !== "continue") return;
        if (!--this.continueLeft || pressed & 32) { this.continueLeft = 0; this.gameOverState = "done"; return; }
        if (pressed & (16 | 128)) {
            const scores = this.highscores;
            Object.assign(this, new Simulation(this.sourceGame, this.stage.id, this.character));
            this.highscores = scores; this.resultInput = input;
        }
    }
    step(input = this.input) {
        if (this.result) { if (this.result === 1) this.gameOverStep(input); return; }
        this.resultInput = input;
        if(this.bombLeft){--this.bombLeft;return;}
        if (this.transition) {
            const t = this.transition, b = this.game.bosses.find(b => b.id === t.boss.ref)!;
            if (t.stage === "break") {
                if (++t.elapsed >= this.game.effects.duration) {this.entities = this.entities.filter(e => e.kind !== "fx"); t.stage = "return"; t.elapsed = 0;}
                else for (const e of this.entities) if (e.kind === "fx") e.age = t.elapsed;
            } else {
                const position = (start: number, target: number) => {const d = target - start;return start + Math.trunc(d / 32) * t.elapsed + Math.trunc((d % 32) * t.elapsed / 32);};
                t.boss.x = position(t.x, q4(b.battle?.returnX ?? 80)); t.boss.y = position(t.y, q4(b.battle?.returnY ?? 36));
                if (t.elapsed++ === 32) this.finishPhase(t.boss);
            }
            return;
        }
        if (this.introLeft) {
            if (!--this.introLeft) {
                this.intro = undefined;
                const boss = this.entities.find(e => e.kind === "boss");
                const phase = boss && this.game.bosses.find(b => b.id === boss.ref)?.phases[boss.phase];
                this.phaseLocked = !!phase?.hp && phase.until === "time";
            }
            return;
        }
        const g = this.game,
            p = g.player,
            a = assetById(g, p.asset),
            top =
                    g.screens.find((s) => s.id === "hud")?.dock === "top" ? hudHeight(g) : 0;
        const bombMask = p.bomb?.button === "b" ? 32 : 48;
        if(!(input&bombMask))this.bombLatch=false;
        const bombPressed = (input&bombMask)===bombMask && !this.bombLatch;
        if (p.bomb?.button === "b" && (input & 32)) this.bombLatch=true;
        if(bombPressed && this.bombs && !this.respawn){
            this.bombLatch=true;--this.bombs;this.bombLeft=p.bomb!.frames;this.invulnerable=Math.max(this.invulnerable,90);
            this.bgShots=[];this.bgNext=0;this.entities=this.entities.filter(e=>e.kind!=="pshot"&&e.kind!=="eshot");
            if(p.bomb!.destroyBackground) for(const i of this.objectsOverlapping({x:0,y:top,w:160,h:144-hudHeight(g)}).sort((a,b)=>a-b)) this.damageObject(i,15);
            for(const e of [...this.entities])if((e.kind==="enemy"||e.kind==="boss")&&e.x>=0&&e.x<2560&&e.y>=0&&e.y<2304)this.damageActor(e,p.bomb!.damage);
            return;
        }
        const mode = p.bomb?.button !== "b" && input & 32 && p.focusWeapon ? 1 : 0;
        const pattern = mode ? p.focusWeapon! : this.currentWeapon;
        const weapon = g.patterns.find((x) => x.id === pattern)!;
        const speed = q4(mode ? p.focusSpeed ?? this.currentSpeed : this.currentSpeed);
        if (this.respawn) {
            if (!--this.respawn) this.invulnerable = p.invulnerability;
        } else {
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
            q4(top + 144 - hudHeight(g) - a.height + a.origin.y),
        );
        if (!(input & (p.bomb?.button === "b" ? 16 : 48))) {
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
        }
        for (const b of this.bgShots) {
            const p=g.patterns.find(p=>p.id===b.ref)!;
            if(p.kind==="homing" && p.lifetime-b.life<(p.guidance?.frames??48) && !((this.tick-b.slot)&((p.guidance?.period??16)-1))){
                b.angle=homingAngle(b.angle,Math.trunc(this.playerX/16)-Math.trunc(b.x/16),Math.trunc(this.playerY/16)-Math.trunc(b.y/16),horizontalStage(this.stage));
                b.vx=Math.trunc(SIN[b.angle]*q4(p.speed)/16)|0;b.vy=Math.trunc(-COS[b.angle]*q4(p.speed)/16)|0;
            }
            b.x += b.vx; b.y += b.vy; --b.life;
        }
        this.bgShots = this.bgShots.filter(b => b.life > 0);
        this.camera = advanceCamera(this.game, this.stage, this.camera, this.scroll);
        let finish = false;
        for (const event of this.stage.events) {
            if (event.kind === "enemy" || event.kind === "boss" || event.kind === "item") {
                for (let n = 0; n < event.count; n++)
                    if (this.stageTick === event.frame + n * event.interval) {
                        if(event.kind === "item") this.spawnItem(event.ref,event.x+n*event.spacing,event.y+n*(event.spacingY??0));
                        else this.spawnActor(
                            event.ref,
                            event.kind,
                            event.x + n * event.spacing,
                            event.y + n * (event.spacingY ?? 0),
                        );
                    }
            } else if (this.stageTick === event.frame) {
                if (event.kind === "scroll") { if (this.battleMode === "stage") this.scroll = q4(event.value); }
                else finish = true;
            }
        }
        if (this.introLeft) return;
        // Stable slot order, like the fixed C entity pool. New shots move next tick.
        const active = [...this.entities];
        for (const e of active) {
            if (!this.entities.includes(e)) continue;
            if (e.kind === "fx") {
                e.age++;
                if (e.age >= e.lifetime)
                    this.entities = this.entities.filter((x) => x !== e);
            } else if (e.kind === "item") {
                const item = g.items!.find(i => i.id === e.ref)!, offset = motionOffset(item.motion, e.age);
                e.x=e.baseX+offset.x;e.y=e.baseY+offset.y;e.age++;
                if(e.age>=e.lifetime)this.entities=this.entities.filter(x=>x!==e);
            } else if (e.kind === "pshot" || e.kind === "eshot") {
                const p=g.patterns.find(p=>p.id===e.ref)!;
                if(e.kind==="eshot"&&p.kind==="homing"&&e.age<(p.guidance?.frames??48)&&!((this.tick-e.slot)&((p.guidance?.period??16)-1))){
                    e.sequence=homingAngle(e.sequence,Math.trunc(this.playerX/16)-Math.trunc(e.x/16),Math.trunc(this.playerY/16)-Math.trunc(e.y/16),horizontalStage(this.stage));
                    e.vx=Math.trunc(SIN[e.sequence]*q4(p.speed)/16)|0;e.vy=Math.trunc(-COS[e.sequence]*q4(p.speed)/16)|0;
                }
                e.x += e.vx;
                e.y += e.vy;
                e.age++;
                if (e.age >= e.lifetime) this.entities = this.entities.filter(x => x !== e);
                else if(this.terrainCollision(this.box(e.asset,e.x,e.y),e.kind==="pshot"?1:2,e.damage))this.entities=this.entities.filter(x=>x!==e);
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
                            : e.hp <= (phase.hp ? 0 : phase.threshold))
                    ) {
                        if (phase.hp || phases[e.phase + 1].hp) {this.startPhaseChange(e, phase.until === "hp"); return;}
                        e.phase++;
                        e.phaseAge = 0;
                        e.sequence = 0;
                        e.baseX = e.x;
                        e.baseY = e.y;
                        this.startIntro(phases[e.phase]); if (this.introLeft) return;
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
            if (!this.entities.includes(shot)) continue;
            const enemy = this.entities.find(
                (e) =>
                    (e.kind === "enemy" || e.kind === "boss") && !(e.kind === "boss" && this.phaseLocked) &&
                    this.overlap(
                        this.box(e.asset, e.x, e.y),
                        this.box(shot.asset, shot.x, shot.y),
                    ),
            );
            if (!enemy) continue;
            this.entities = this.entities.filter((e) => e !== shot);
            this.damageActor(enemy,shot.damage);
        }
        if (!this.respawn) {
        const playerBox = this.box(p.asset, this.playerX, this.playerY);
        if (this.wall(playerBox)) this.hitPlayer();
        for (const e of this.entities)
            if (
                e.kind !== "pshot" &&
                e.kind !== "fx" &&
                this.overlap(playerBox, this.box(e.asset, e.x, e.y))
            ) {
                if (e.kind === "item") { this.collectItem(e); continue; }
                this.hitPlayer();
                if (e.kind === "eshot")
                    this.entities = this.entities.filter((a) => a !== e);
            }
        }
        const pb = this.box(p.asset, this.playerX, this.playerY);
        this.bgShots = this.bgShots.filter(b => {
            const x = Math.trunc(b.x / 16) & ~1, y = Math.trunc(b.y / 16) & ~1;
            if (b.x < 0 || b.y < 0 || x > 158 || y < top || y >= top + 143 - hudHeight(g)) return false;
            if (!this.respawn && this.overlap(pb, {x, y, w:2, h:2})) {this.hitPlayer(); return false;}
            return true;
        });
        if (this.bossDefeated && !this.stage.clearOnBoss) {this.battleMode = "stage"; this.bgShots = []; this.scroll = q4(this.stage.scrollSpeed);}
        this.tick++;
        this.stageTick = Math.min(65535, this.stageTick + 1);
        if (!this.result && this.stage.requireBoss && !this.bossDefeated && (finish || (this.game.timeLimit !== false && this.stageTick >= this.stage.duration * 60)))
            this.result = 1;
        if (
            !this.result &&
            (finish ||
                (this.bossDefeated && this.stage.clearOnBoss) ||
                (this.game.timeLimit !== false && this.stageTick >= this.stage.duration * 60))
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
        top = g.screens.find((s) => s.id === "hud")?.dock === "top" ? hudHeight(g) : 0;
    ctx.fillStyle = dmg ? dmgColors(g)[0] : g.palettes[0].colors[0];
    ctx.fillRect(0, 0, 160, 144);
    const tileset = assetById(g, s.tileset),
        frame = tileset?.frames[0],
        colors = dmg
            ? dmgColors(g)
            : g.palettes[tileset.palette].colors;
    if (frame && sim.battleMode === "stage")
        for (let y = 0; y < 144 - hudHeight(g); y++)
            for (let x = 0; x < 160; x++) {
                const world = screenToWorld(g, s, sim.camera, x, y + top), cell = stageCell(s, world.x, world.y);
                if (cell < 0) continue;
                const tile = sim.tileAt(cell),
                    tx = (tile % (tileset.width / 8)) * 8,
                    ty = Math.trunc(tile / (tileset.width / 8)) * 8;
                let sampleX=tx+(world.x&7),sampleY=ty+(world.y&7);
                const par=s.parallax;
                if(par?.enabled&&tile>=par.firstTile&&tile<par.firstTile+par.width*par.height){
                    const horizontal=horizontalStage(s),phaseCount=(horizontal?par.width:par.height)*8,camera=Math.floor(sim.camera/16),delta=Math.floor(camera/par.divisor)-camera,phase=((delta%phaseCount)+phaseCount)%phaseCount,local=tile-par.firstTile;
                    const px=(local%par.width*8+(world.x&7)+(horizontal?phase:0))%(par.width*8),py=(Math.floor(local/par.width)*8+(world.y&7)+(horizontal?0:phase))%(par.height*8);
                    const sourceTile=par.firstTile+Math.floor(py/8)*par.width+Math.floor(px/8);
                    sampleX=(sourceTile%(tileset.width/8))*8+(px&7);sampleY=Math.floor(sourceTile/(tileset.width/8))*8+(py&7);
                }
                ctx.fillStyle =
                    colors[
                        frame.pixels[
                            sampleY * tileset.width + sampleX
                        ]
                    ];
                ctx.fillRect(x, y + top, 1, 1);
                if (
                    hitboxes &&
                    s.walls[cell] &&
                    (world.x % 8 === 0 || world.y % 8 === 0)
                ) {
                    ctx.fillStyle = "#ff586b";
                    ctx.fillRect(x, y + top, 1, 1);
                }
            }
    if (sim.battleMode === "bg-bullets") {
        ctx.fillStyle = "#000"; ctx.fillRect(0,top,160,144-hudHeight(g)); ctx.fillStyle = "#fff";
        for (const b of sim.bgShots) { const x = Math.trunc(b.x/16) & ~1, y = Math.trunc(b.y/16) & ~1; ctx.fillRect(x,y,2,2); }
    }
    if(sim.bombLeft){
        ctx.fillStyle="#000";ctx.fillRect(0,0,160,144);
        if(Math.floor((g.player.bomb!.frames-sim.bombLeft)/g.player.bomb!.flashPeriod)&1){
            const beam=sim.bombStyle==="beam",x=beam?Math.trunc(sim.playerX/16)-80:0,y=beam?Math.trunc(sim.playerY/16)-120:0,art=assetById(g,sim.bombBackground);
            if(beam&&y>0){ctx.save();ctx.beginPath();ctx.rect(0,0,160,y);ctx.clip();for(let row=y%8-8;row<y;row+=8){ctx.save();ctx.beginPath();ctx.rect(0,row,160,8);ctx.clip();drawAsset(ctx,g,art,x,row,0,dmg);ctx.restore();}ctx.restore();}
            drawAsset(ctx,g,art,x,y,0,dmg);
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
    if (!sim.respawn && (sim.bombLeft || !sim.invulnerable || (sim.invulnerable & 4) === 0))
        draw(g.player.asset, sim.playerX, sim.playerY);
    for (const e of sim.entities) if (!(sim.transition?.stage === "break" && e.kind === "boss")) draw(e.asset, e.x, e.y, e.age);
}
