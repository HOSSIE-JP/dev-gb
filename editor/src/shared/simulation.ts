import {colorPreview,colorHex} from "./color";
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
    hudHeight, playWidth,
    frameAt,
    q4,
    clamp,
} from "./model";
import { advanceCamera, initialCamera, horizontalStage, screenToWorld, stageCell, destructibleIndex, worldToScreen } from "./stage-space";
import { dmgColors } from "./palette";
import { bombViewportPixels, focusMarkerPixels } from "./presentation";

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
    if (pattern.kind === "aimed" || pattern.kind === "aimed-down") base = (base + aimStep(dx, dy)) & 15;
    if (pattern.kind === "aimed-down") base = clamp(base, 4, 12);
    if (pattern.kind === "spiral")
        base = (base + sequence * angleStep(pattern.rotation)) & 15;
    const count =
        pattern.kind === "laser" || pattern.kind === "straight" || pattern.kind === "aimed" || pattern.kind === "aimed-down" || pattern.kind === "homing"
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
export function launchPoints(p: Pattern, a: Asset, x: number, y: number, sequence: number, width = 160) {
    const l=p.launch;
    if(!l || l.kind==="actor")return p.emitterOffsets ? p.emitterOffsets.map(e=>({x:x+q4(e.x),y:y+q4(e.y),angle:p.angle})) : (a.emitters.length?a.emitters:[a.origin]).map(e=>({x:x+q4(e.x-a.origin.x),y:y+q4(e.y-a.origin.y),angle:p.angle}));
    const py=q4(l.y+(sequence%l.lanes)*l.step);
    if(l.kind==="fixed")return [{x:q4(l.x),y:py,angle:p.angle}];
    const sides=l.kind==="both"?[false,true]:[l.kind==="right"||l.kind==="alternate"&&!!(sequence&1)];
    return sides.map(right=>({x:q4(right?width-2:1),y:py,angle:p.kind==="aimed"||p.kind==="aimed-down"?p.angle:right?270:90}));
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
            x: q4(a.x) + (m.smooth ? Math.trunc(q4(b.x - a.x) * t / dt) : Math.trunc(q4(b.x - a.x) / dt) * t),
            y: q4(a.y) + (m.smooth ? Math.trunc(q4(b.y - a.y) * t / dt) : Math.trunc(q4(b.y - a.y) / dt) * t),
        };
    }
    let x = q4(m.vx) * age,
        y = q4(m.vy) * age;
    if (m.kind === "wave") {
        const phase = Math.trunc((age % m.period) * 256 / m.period), i = phase >> 4;
        const oscillation = SIN[i] * m.amplitude + (m.smooth ? Math.trunc((SIN[(i+1)&15]-SIN[i])*m.amplitude*(phase&15)/16) : 0);
        if (m.oscillationAxis === "y") y += oscillation; else x += oscillation;
    }
    if (m.kind === "bounce") {
        const quarter = Math.max(1, Math.trunc(m.period / 4)),
            phase = Math.trunc((age % (quarter * 4)) / quarter),
            part = age % quarter;
        const span = Math.trunc((part * m.amplitude * (m.smooth ? 16 : 1)) / quarter) / (m.smooth ? 16 : 1);
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
    barrier = 0;
    weaponOverride = "";
    speedLevel = 0;
    objectHp = new Uint8Array(256);
    objectCells = new Map<number, number>();
    score = 0;
    grazeFlash = 0;
    private grazed = new WeakSet<object>();
    lives = 3;
    playerX = 0;
    playerY = 0;
    invulnerable = 0;
    respawn = 0;
    cooldown = 0;
    playerSequence = 0;
    weaponMode = 0;
    bossExitLeft = 0;
    entities: Entity[] = [];
    bgShots: {x: number; y: number; vx: number; vy: number; life: number; damage: number; slot: number; ref: string; angle: number}[] = [];
    bgNext=0;
    bombs=0;
    bombLeft=0;
    bombLatch=true;
    bombBackground="";
    bombStyle="orb";
    private bombHits = new Set<Entity>();
    private eventCursor=0;
    private eventStage?: Stage;
    private scheduledEvents: Stage["events"]=[];
    private deferredFinish=false;
    get bombImage() { return !!this.bombLeft && !!this.game.player.bomb?.live && this.game.player.bomb.presentation === "image"; }
    battleMode = "stage";
    bgLimit = 64;
    intro: BossPhase["intro"] | undefined;
    introLeft = 0;
    phaseLocked = false;
    transition: {boss: Entity; stage: "break" | "return"; elapsed: number; x: number; y: number} | undefined;
    finishPhase(boss: Entity) {
        const b = this.game.bosses.find(b => b.id === boss.ref)!;
        boss.x = boss.baseX = q4(b.battle?.returnX ?? playWidth(this.game)/2); boss.y = boss.baseY = q4(b.battle?.returnY ?? 36);
        ++boss.phase; boss.phaseAge = 0; boss.sequence = 0;
        const phase = b.phases[boss.phase]; if (phase.hp) boss.hp = phase.hp;
        this.transition = undefined; this.startIntro(phase);
        this.phaseLocked = !!this.introLeft || !!phase.hp && phase.until === "time";
    }
    startPhaseChange(boss: Entity, damage: boolean, timeout = false) {
        this.bombLatch=true;
        this.phaseLocked = true; this.bgShots = []; this.bgNext=0;
        this.entities = this.entities.filter(e => !["pshot", "eshot", "fx"].includes(e.kind));
        if (!damage && !timeout) {this.finishPhase(boss); return;}
        if(timeout){this.transition={boss,stage:"return",elapsed:0,x:boss.x,y:boss.y};return;}
        this.explode(boss.x, boss.y);
        this.transition = {boss, stage: "break", elapsed: 0, x: boss.x, y: boss.y};
    }
    get bossStatus() {
        const e=this.entities.find(e=>e.kind==="boss"),b=e&&this.game.bosses.find(b=>b.id===e.ref),p=e&&b?.phases[e.phase];
        if(!e||!b||p?.until!=="hp"||!p.hp)return {boss:"--",bossTime:"--",bossPhase:"--"};
        return {boss:String(e.hp),bossTime:p.timeLimitSeconds?String(Math.max(0,Math.ceil((p.timeLimitSeconds*60-e.phaseAge)/60))):"--",bossPhase:`${b.phases.slice(0,e.phase+1).filter(p=>p.hp&&p.until==="hp").length}/${b.phases.filter(p=>p.hp&&p.until==="hp").length}`};
    }
    finishBossModes() {
        const e=this.entities.find(e=>e.kind==="boss");if(!e)return;
        const b=this.game.bosses.find(b=>b.id===e.ref)!,p=b.phases[e.phase];
        if(p.until!=="hp"||(!p.timeLimitSeconds&&p.score===undefined))return;
        const defeated=e.hp<=0;
        if(!defeated&&(!p.timeLimitSeconds||e.phaseAge<p.timeLimitSeconds*60))return;
        if(defeated&&p.score!==undefined)this.score=Math.min(65535,this.score+p.score);
        this.bombLeft=0;this.bgShots=[];this.bgNext=0;this.entities=this.entities.filter(e=>e.kind!=="pshot"&&e.kind!=="eshot");
        if(e.phase+1<b.phases.length)this.startPhaseChange(e,defeated,!defeated);
        else {if(defeated&&p.score===undefined)this.score=Math.min(65535,this.score+b.score);this.bossDefeated=true;this.entities=this.entities.filter(v=>v!==e);if(defeated)this.explode(e.x,e.y);}
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
        public bossMode=false,
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
        if(this.bossMode)this.stageTick=this.stage.events.find(e=>e.kind==="boss")?.frame??0;
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
            (this.game.player.focusHitbox ? 2 : 0) +
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
    get currentWeapon() { return this.weaponOverride || (this.game.player.powerUps?.shotWeapons[this.shotLevel] ?? this.game.player.weapon); }
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
        const left = Math.max(0, box.x), right = Math.min(playWidth(this.game), box.x + box.w), upper = Math.max(top, box.y), bottom = Math.min(top + 144 - hudHeight(this.game), box.y + box.h);
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
            if (effect.kind === "weapon") {this.weaponOverride=effect.weapon!;this.cooldown=0;this.playerSequence=0;}
            if (effect.kind === "barrier") this.barrier=Math.min(this.game.player.barrierMax ?? 3,this.barrier+effect.amount);
            if (effect.kind === "shot") {this.weaponOverride="";this.shotLevel = Math.min((this.game.player.powerUps?.shotWeapons.length ?? 1) - 1, this.shotLevel + effect.amount);this.cooldown=0;this.playerSequence=0;}
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
        if (!p || (!friendly && this.bombImage)) return;
        const asset = assetById(this.game, sourceAsset);
        const points = launchPoints(friendly?{...p,launch:undefined}:p,asset,x,y,sequence,playWidth(this.game));
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
                if (!friendly && ["bg-bullets","bg-boss"].includes(this.battleMode)) {
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
    private visibleShot(e: Entity) {
        if (playWidth(this.game) === 160) return true;
        const a=assetById(this.game,e.asset),x=Math.trunc(e.x/16)-a.origin.x;
        return x < 120 && x+8 <= 120 && x > -8;
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
        if (right < 0 || box.x >= playWidth(this.game) || bottom < top || box.y >= top + 144 - hudHeight(this.game)) return false;
        const a = screenToWorld(this.game, this.stage, this.camera, Math.max(0, box.x), Math.max(top, box.y)), b = screenToWorld(this.game, this.stage, this.camera, Math.min(playWidth(this.game)-1, right), Math.min(top + 143 - hudHeight(this.game), bottom));
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
    sweepBomb() {
        for (const e of [...this.entities]) {
            if ((e.kind !== "enemy" && e.kind !== "boss") || this.bombHits.has(e) || (e.kind === "boss" && this.phaseLocked)) continue;
            const a = assetById(this.game, e.asset);
            if (e.x + q4(a.width - a.origin.x) <= 0 || e.x - q4(a.origin.x) >= q4(playWidth(this.game)) ||
                e.y + q4(a.height - a.origin.y) <= 0 || e.y - q4(a.origin.y) >= 2304) continue;
            this.bombHits.add(e); this.damageActor(e, this.game.player.bomb!.damage);
        }
    }
    damageActor(enemy:Entity,damage:number) {
        if(enemy.kind==="boss"){
            if(this.phaseLocked)return;
            const b=this.game.bosses.find(b=>b.id===enemy.ref)!,p=b.phases[enemy.phase];
            if(p.until==="hp" && (p.timeLimitSeconds || p.score!==undefined) && enemy.hp<=damage){enemy.hp=0;this.phaseLocked=true;this.bgShots=[];this.entities=this.entities.filter(e=>e.kind!=="pshot"&&e.kind!=="eshot");return;}
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
        if (this.respawn || this.invulnerable || this.result || this.bombImage) return;
        if (this.barrier) {this.barrier--;this.invulnerable=this.game.player.barrierFrames ?? 45;return;}
        this.weaponOverride="";
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
        this.eventCursor=0;this.deferredFinish=false;
        this.battleMode = "stage"; this.bgShots = []; this.bgNext=0;this.bombLatch=true;this.intro = undefined; this.introLeft = 0; this.phaseLocked = false; this.transition = undefined;
        if (this.game.bossCelebration && this.bossDefeated) this.entities = [];
        if(!this.bossMode)this.score = Math.min(65535, this.score + this.game.clearBonus);
        if (
            (this.game.mode === "campaign" || this.bossMode) &&
            this.stageIndex + 1 < this.game.stageOrder.length
        ) {
            this.stageIndex++;
            this.stage = this.game.stages.find(
                (s) => s.id === this.game.stageOrder[this.stageIndex],
            )!;
            this.stageTick = this.bossMode ? this.stage.events.find(e=>e.kind==="boss")?.frame??0 : 0;
            this.grazeFlash=0;
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
            if (!this.bossMode && index >= 0) { this.highscores.splice(index, 0, this.score); this.highscores.length = 5; }
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
            Object.assign(this, new Simulation(this.sourceGame, this.stage.id, this.character, this.bossMode));
            this.highscores = scores; this.resultInput = input;
        }
    }
    step(input = this.input) {
        if (this.result) { if (this.result === 1) this.gameOverStep(input); return; }
        if(this.bossExitLeft){
            for(const e of this.entities)if(e.kind==="fx")e.age++;
            this.entities=this.entities.filter(e=>e.kind!=="fx"||e.age<e.lifetime);
            if(!--this.bossExitLeft)this.finishStage();
            return;
        }
        this.resultInput = input;
        if(this.bombLeft){--this.bombLeft;if (!this.game.player.bomb?.live) return;}
        if (this.transition) {
            const t = this.transition, b = this.game.bosses.find(b => b.id === t.boss.ref)!;
            if (t.stage === "break") {
                if (++t.elapsed >= this.game.effects.duration) {this.entities = this.entities.filter(e => e.kind !== "fx"); t.stage = "return"; t.elapsed = 0;}
                else for (const e of this.entities) if (e.kind === "fx") e.age = t.elapsed;
            } else {
                const position = (start: number, target: number) => {const d = target - start;return start + Math.trunc(d / 32) * t.elapsed + Math.trunc((d % 32) * t.elapsed / 32);};
                t.boss.x = position(t.x, q4(b.battle?.returnX ?? playWidth(this.game)/2)); t.boss.y = position(t.y, q4(b.battle?.returnY ?? 36));
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
        if(bombPressed && this.bombs && !this.respawn && !this.bombLeft){
            this.bombLatch=true;--this.bombs;this.bombLeft=p.bomb!.frames;this.invulnerable=Math.max(this.invulnerable,90);
            this.bgShots=[];this.bgNext=0;this.entities=this.entities.filter(e=>e.kind!=="pshot"&&e.kind!=="eshot");
            if(p.bomb!.destroyBackground) for(const i of this.objectsOverlapping({x:0,y:top,w:playWidth(g),h:144-hudHeight(g)}).sort((a,b)=>a-b)) this.damageObject(i,15);
            this.bombHits.clear();this.sweepBomb();
            if (!p.bomb!.live) return;
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
            q4(playWidth(g) - a.width + a.origin.x),
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
        if(this.grazeFlash)--this.grazeFlash;
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
        let finish = this.deferredFinish;this.deferredFinish=false;
        if(this.eventStage!==this.stage){
            this.eventStage=this.stage;
            this.scheduledEvents=this.stage.events.flatMap(event => event.kind === "enemy" || event.kind === "boss" || event.kind === "item"
                ? Array.from({length:event.count},(_,n)=>({...event,frame:event.frame+n*event.interval,x:event.x+n*event.spacing,y:event.y+n*(event.spacingY??0)})) : [event]).sort((a,b)=>a.frame-b.frame);
        }
        const events=this.scheduledEvents;
        while(this.eventCursor<events.length && events[this.eventCursor].frame<=this.stageTick){
            const event=events[this.eventCursor];
            if(this.bossMode && event.kind!=="boss"){++this.eventCursor;continue;}
            if(event.kind === "boss" && this.bombImage)break;
            if(event.kind === "boss" || event.kind === "enemy") {if(event.kind === "boss" || this.battleMode === "stage")this.spawnActor(event.ref,event.kind,event.x,event.y);}
            else if(event.kind === "item") {if(this.battleMode === "stage")this.spawnItem(event.ref,event.x,event.y);}
            else if(event.kind === "scroll") {if(this.battleMode === "stage")this.scroll=q4(event.value);}
            else finish=true;
            if(this.bossMode && event.kind==="boss")this.eventCursor=events.length;else ++this.eventCursor;
        }
        if(this.bombImage){this.deferredFinish=finish;finish=false;}
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
                        !this.bombImage && e.phase + 1 < phases.length && (phase.until==="time" || (!phase.timeLimitSeconds && phase.score===undefined)) &&
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
                if (e.kind === "boss" && this.battleMode === "bg-boss") {
                    const art=assetById(g,(actor as Boss).battle!.graphic!);
                    e.x=clamp(e.x,q4(art.origin.x-64),q4(art.origin.x+64));
                    e.y=clamp(e.y,q4(art.origin.y-32),q4(art.origin.y+32));
                }
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
            if (e.x < -512 || e.x > q4(playWidth(g)+32) || e.y < -512 || e.y > 2816)
                this.entities = this.entities.filter((x) => x !== e);
        }
        if (this.bombLeft && p.bomb?.live) this.sweepBomb();
        for (const shot of [...this.entities].filter(
            (e) => e.kind === "pshot",
        )) {
            if (!this.entities.includes(shot) || !this.visibleShot(shot)) continue;
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
                e.kind !== "fx" && (e.kind !== "eshot" || this.visibleShot(e)) &&
                (e.kind === "boss" && this.game.bosses.find(b=>b.id===e.ref)?.contactBoxes?.length
                    ? this.game.bosses.find(b=>b.id===e.ref)!.contactBoxes!.some(r=>this.overlap(playerBox,{...r,x:Math.trunc(e.x/16)+r.x,y:Math.trunc(e.y/16)+r.y}))
                    : this.overlap(playerBox, this.box(e.asset, e.x, e.y)))
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
            if (b.x < 0 || b.y < 0 || x > playWidth(g)-2 || y < top || y >= top + 143 - hudHeight(g)) return false;
            if (!this.respawn && this.overlap(pb, {x, y, w:2, h:2})) {this.hitPlayer(); return false;}
            return true;
        });
        const graze = g.graze;
        if (graze?.enabled && !this.invulnerable && !this.respawn && !this.bombLeft && !this.result) {
            const outer={x:pb.x-graze.radius,y:pb.y-graze.radius,w:pb.w+2*graze.radius,h:pb.h+2*graze.radius};
            const award=(bullet:object,box:{x:number;y:number;w:number;h:number})=>{
                if(!this.grazed.has(bullet)&&!this.overlap(pb,box)&&this.overlap(outer,box)){
                    this.grazed.add(bullet);this.score=Math.min(65535,this.score+graze.score);this.grazeFlash=graze.flashFrames;
                }
            };
            for(const b of this.bgShots)award(b,{x:Math.trunc(b.x/16)&~1,y:Math.trunc(b.y/16)&~1,w:2,h:2});
            for(const e of this.entities)if(e.kind==="eshot" && this.visibleShot(e))award(e,this.box(e.asset,e.x,e.y));
        }
        if (!this.bombImage && this.bossDefeated && !this.stage.clearOnBoss && !this.bossMode) {this.battleMode = "stage"; this.bgShots = []; this.scroll = q4(this.stage.scrollSpeed);}
        this.finishBossModes();
        this.tick++;
        this.stageTick = Math.min(65535, this.stageTick + 1);
        if (!this.bombImage && !this.result && this.stage.requireBoss && !this.bossDefeated && (finish || (this.game.timeLimit !== false && this.stageTick >= this.stage.duration * 60)))
            this.result = 1;
        if (
            !this.bombImage && !this.result &&
            (finish ||
                (this.bossDefeated && (this.stage.clearOnBoss || this.bossMode)) ||
                (this.game.timeLimit !== false && this.stageTick >= this.stage.duration * 60))
        ) {
            if(this.bossMode && this.bossDefeated){
                this.entities=this.entities.filter(e=>e.kind==="fx");this.bgShots=[];this.bossExitLeft=60;
            } else this.finishStage();
        }
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
    const color = !dmg && !colorsOverride ? colorPreview(game,asset,frame) : undefined;
    for (let py = 0; py < asset.height; py++)
        for (let px = 0; px < asset.width; px++) {
            const c = frame.pixels[py * asset.width + px];
            if (asset.kind === "sprite" && (color&&frame.cgbPixels ? frame.cgbPixels[py*asset.width+px]<0 : c===0)) continue;
            ctx.fillStyle = color ? colorHex(color[py*asset.width+px]) : colors[c];
            ctx.fillRect(Math.floor(x) + px, Math.floor(y) + py, 1, 1);
        }
}
/** BG/HUD use the inverted palette during a live bomb; sprites keep theirs. */
export function backgroundPaletteGame(sim: Simulation, dmg = false): Game {
    const g = sim.game, bomb = g.player.bomb;
    if (!sim.bombLeft || !bomb?.live) return g;
    if(sim.bombImage && sim.battleMode==="stage" && playWidth(g)===120)return g;
    const visible = Math.floor((bomb.frames - sim.bombLeft) / bomb.flashPeriod) & 1;
    if (sim.bombImage ? !(dmg && playWidth(g) < 160 && !visible) : !visible) return g;
    return {...g, dmgPalette: (g.dmgPalette ?? 0xe4) ^ 255,
        palettes: g.palettes.map(p => ({...p, colors: p.colors.map(c =>
            `#${(parseInt(c.slice(1), 16) ^ 0xffffff).toString(16).padStart(6, "0")}`) as typeof p.colors}))};
}
export function drawSimulation(
    ctx: CanvasRenderingContext2D,
    sim: Simulation,
    dmg: boolean,
    hitboxes = false,
) {
    const g = sim.game, bg = backgroundPaletteGame(sim, dmg),
        s = sim.stage,
        top = g.screens.find((s) => s.id === "hud")?.dock === "top" ? hudHeight(g) : 0;
    ctx.fillStyle = dmg ? dmgColors(bg)[0] : bg.palettes[0].colors[0];
    ctx.fillRect(0, 0, 160, 144);
    ctx.save();ctx.beginPath();ctx.rect(0,top,playWidth(g),144-hudHeight(g));ctx.clip();
    const tileset = assetById(g, s.tileset),
        frame = tileset?.frames[0],
        colors = dmg
            ? dmgColors(bg)
            : bg.palettes[tileset.palette].colors;
    const colorFrame = !dmg && frame ? colorPreview(g,tileset,frame) : undefined;
    if (frame && sim.battleMode === "stage")
        for (let y = 0; y < 144 - hudHeight(g); y++)
            for (let x = 0; x < playWidth(g); x++) {
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
                ctx.fillStyle = colorFrame ? colorHex(colorFrame[sampleY*tileset.width+sampleX]^(bg===g?0:0xffffff)) :
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
    if (sim.battleMode === "bg-boss") {
        const boss=sim.entities.find(e=>e.kind==="boss");
        const graphic = boss && g.bosses.find(b=>b.id===boss.ref)?.battle?.graphic;
        const art = graphic ? assetById(g,graphic) : undefined;
        const bossColors = dmg ? dmgColors(bg) : bg.palettes[art?.palette ?? 0].colors;
        ctx.fillStyle=bossColors[0];ctx.fillRect(0,top,160,144-hudHeight(g));
        if (boss && art) {
            drawAsset(ctx,bg,art,Math.trunc(boss.x/16)-art.origin.x,Math.trunc(boss.y/16)-art.origin.y,boss.age,dmg);
            const sx=art.origin.x-Math.trunc(boss.x/16),sy=art.origin.y-Math.trunc(boss.y/16);
            ctx.fillStyle=bossColors[3];
            for(const shot of sim.bgShots) ctx.fillRect(((Math.trunc(shot.x/16)+sx)&~1)-sx,((Math.trunc(shot.y/16)+sy)&~1)-sy,2,2);
        }
    }
    if (sim.battleMode === "bg-bullets") {
        ctx.fillStyle = bg === g ? "#000" : "#fff"; ctx.fillRect(0,top,160,144-hudHeight(g)); ctx.fillStyle = bg === g ? "#fff" : "#000";
        for (const b of sim.bgShots) { const x = Math.trunc(b.x/16) & ~1, y = Math.trunc(b.y/16) & ~1; ctx.fillRect(x,y,2,2); }
    }
    const roadBomb=sim.bombImage && sim.battleMode==="stage" && playWidth(g)===120;
    const bombVisible=!!(sim.bombLeft&&(Math.floor((g.player.bomb!.frames-sim.bombLeft)/g.player.bomb!.flashPeriod)&1));
    if(sim.bombLeft && (!g.player.bomb?.live || sim.bombImage) && (!roadBomb||bombVisible)){
        ctx.fillStyle="#000";ctx.fillRect(0,0,160,144);
        if((Math.floor((g.player.bomb!.frames-sim.bombLeft)/g.player.bomb!.flashPeriod)&1) || (dmg && playWidth(g)<160)){
            const beam=sim.bombStyle==="beam",narrow=playWidth(g)<160,px=Math.trunc(sim.playerX/16),x=beam?(roadBomb?clamp(px,12,108):px)-(narrow?60:80):0,y=beam?Math.trunc(sim.playerY/16)-(narrow?90:120):0,source=assetById(g,sim.bombBackground),pixels=bombViewportPixels(g,source.id,beam);
            const art={...source,frames:[{...source.frames[0],pixels:pixels.pixels,cgbPixels:pixels.rgb}]};
            if(beam&&y>0){ctx.save();ctx.beginPath();ctx.rect(0,0,160,y);ctx.clip();for(let row=y%8-8;row<y;row+=8){ctx.save();ctx.beginPath();ctx.rect(0,row,160,8);ctx.clip();drawAsset(ctx,bg,art,x,row,0,dmg);ctx.restore();}ctx.restore();}
            drawAsset(ctx,bg,art,x,y,0,dmg);
        }
    }
    const draw = (assetId: string, x: number, y: number, age = sim.tick, flash = false) => {
        const a = assetById(g, assetId);
        drawAsset(
            ctx,
            g,
            a,
            Math.trunc(x / 16) - a.origin.x,
            Math.trunc(y / 16) - a.origin.y,
            age,
            dmg,
            flash ? ["#ffffff","#ffffff","#ffffff","#ffffff"] : undefined,
        );
        if (hitboxes) {
            const b = sim.box(assetId, x, y);
            ctx.strokeStyle = "#ffde59";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(b.x, b.y, b.w, b.h);
        }
    };
    if (!sim.respawn && (sim.bombLeft || !sim.invulnerable || (sim.invulnerable & 4) === 0))
        draw(sim.barrier && g.player.barrierAsset ? g.player.barrierAsset : g.player.asset, sim.playerX, sim.playerY,sim.tick,!!sim.grazeFlash&&!sim.invulnerable&&!sim.bombLeft);
    for (const e of sim.entities) if (!((sim.transition?.stage === "break" || sim.battleMode === "bg-boss") && e.kind === "boss")) draw(e.asset, e.x, e.y, e.age);
    if(g.player.focusHitbox && sim.weaponMode && !sim.respawn){
        const b=sim.box(g.player.asset,sim.playerX,sim.playerY),x=b.x+Math.floor(b.w/2)-3,y=b.y+Math.floor(b.h/2)-3;
        const colors=dmg?dmgColors(g):g.palettes[0].colors;
        focusMarkerPixels.forEach((v,i)=>{if(v){ctx.fillStyle=colors[v];ctx.fillRect(x+i%8,y+Math.floor(i/8),1,1);}});
    }
    if(hitboxes) for(const e of sim.entities.filter(e=>e.kind==="boss")) {
        const weak=sim.box(e.asset,e.x,e.y);ctx.strokeStyle="#ffde59";ctx.lineWidth=0.5;ctx.strokeRect(weak.x,weak.y,weak.w,weak.h);
        ctx.strokeStyle="#ff637d";
        for(const r of g.bosses.find(b=>b.id===e.ref)?.contactBoxes??[])ctx.strokeRect(Math.trunc(e.x/16)+r.x,Math.trunc(e.y/16)+r.y,r.w,r.h);
    }
    ctx.restore();
}
