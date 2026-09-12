export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Frame = {
    id: string;
    image: string;
    duration: number;
    pixels: number[];
};
export type Asset = {
    id: string;
    name: string;
    kind: "sprite" | "tileset" | "screen";
    width: number;
    height: number;
    palette: number;
    origin: Point;
    hitbox: Rect;
    emitters: Point[];
    frames: Frame[];
};
export type Palette = {
    id: string;
    name: string;
    colors: [string, string, string, string];
};
export type Motion = {
    kind: "straight" | "bounce" | "wave" | "path";
    vx: number;
    vy: number;
    amplitude: number;
    period: number;
    loop: boolean;
    points: (Point & { frame: number })[];
};
export type Pattern = {
    id: string;
    name: string;
    asset: string;
    kind: "straight" | "aimed" | "fan" | "ring" | "spiral" | "homing";
    launch?: { kind: "actor" | "left" | "right" | "alternate" | "both" | "fixed"; x: number; y: number; step: number; lanes: number };
    guidance?: { frames: number; period: number };
    speed: number;
    angle: number;
    count: number;
    spread: number;
    interval: number;
    rotation: number;
    repeats: number;
    delay: number;
    lifetime: number;
    damage: number;
};
export type Actor = {
    id: string;
    name: string;
    asset: string;
    hp: number;
    score: number;
    motion: Motion;
    pattern: string;
    attacks?: { id: string; pattern: string }[];
};
export type BossPhase = {
    id: string;
    name: string;
    until: "time" | "hp";
    threshold: number;
    hp?: number;
    pattern: string;
    attacks?: { id: string; pattern: string }[];
    motion: Motion;
    intro?: { enabled: boolean; background: string; spellName: string; seconds: number };
};
export type Boss = Actor & {
    phases: BossPhase[];
    battle?: { background: "stage" | "blank" | "bg-bullets"; maxBullets: number; returnX?: number; returnY?: number };
};
export type StageEvent = {
    id: string;
    frame: number;
    kind: "enemy" | "boss" | "scroll" | "end";
    ref: string;
    x: number;
    y: number;
    count: number;
    spacing: number;
    interval: number;
    value: number;
};
export type DialoguePage = { id: string; speaker: string; line1: string; line2: string };
export type DialogueScene = { enabled: boolean; background: string; portrait?: string; pages: DialoguePage[] };
export type CharacterDialogue = { id: string; character: string; before: DialogueScene; after: DialogueScene };
export type Presentation = {
    enabled: boolean;
    dialogueBackground: string;
    clearBackground: string;
    rightPalette: number;
    dialogue: DialoguePage[];
    dialoguePortrait?: string;
    characterDialogues?: CharacterDialogue[];
    clearEnabled: boolean;
    baseBonus: number;
    lifeBonus: number;
    noMissBonus: number;
    clearWaitSeconds?: number;
    victoryDialogue?: DialogueScene;
};
export type Parallax = { enabled: boolean; firstTile: number; width: number; height: number; divisor: number };
export type Stage = {
    id: string;
    name: string;
    tileset: string;
    width: number;
    height: number;
    tiles: number[];
    walls: number[];
    scrollSpeed: number;
    loopMap: boolean;
    duration: number;
    clearOnBoss: boolean;
    requireBoss?: boolean;
    scrollDown?: boolean;
    music?: number;
    /** Zero or omitted: use game.music.boss. */
    bossMusic?: number;
    presentation?: Presentation;
    parallax?: Parallax;
    events: StageEvent[];
};
export type TextItem = {
    id: string;
    text: string;
    x: number;
    y: number;
    palette: number;
    digits?: number;
    binding: "none" | "score" | "lives" | "time" | "boss" | "highscores" | "bombs";
};
export type Screen = {
    id: "title" | "gameover" | "clear" | "scores" | "hud";
    name: string;
    background: string;
    palette: number;
    dock: "top" | "bottom";
    rows?: number;
    items: TextItem[];
};
export const hudHeight = (game: Game) => (game.screens.find(s => s.id === "hud")?.rows ?? 2) * 8;

export type PlayerCharacter = { id: string; name: string; asset: string; speed: number; weapon: string; focusWeapon?: string; focusSpeed?: number; bombBackground?: string; bombStyle?: "orb" | "beam"; selectionBackground?: string; gameoverBackground?: string };
export type Bomb = { enabled: boolean; stock: number; damage: number; frames: number; flashPeriod: number; background: string };
export type Game = {
    schemaVersion: 1;
    name: string;
    title: string;
    mode: "caravan" | "campaign";
    seed: number;
    startStage: string;
    stageOrder: string[];
    palettes: Palette[];
    /** Hardware BGP/OBP mapping. Omitted legacy projects retain 0xe4. */
    dmgPalette?: number;
    assets: Asset[];
    patterns: Pattern[];
    enemies: Actor[];
    bosses: Boss[];
    stages: Stage[];
    screens: Screen[];
    player: {
        name?: string;
        selectionBackground?: string;
        gameoverBackground?: string;
        characters?: PlayerCharacter[];
        bomb?: Bomb;
        asset: string;
        speed: number;
        lives: number;
        invulnerability: number;
        respawnDelay?: number;
        weapon: string;
        focusWeapon?: string;
        focusSpeed?: number;
        x: number;
        y: number;
    };
    startup?: { enabled: boolean; fadeSeconds: number; slides: {id: string; background: string; seconds: number}[] };
    ending?: { seconds: number; slides: { id: string; background: string }[];
        music?: number; scoreAfter?: boolean;
        characterSlides?: {id: string; character: string; slides: {id: string; background: string}[]}[] };
    clearBonus: number;
    stageFade?: boolean;
    timeLimit?: boolean;
    bossCelebration?: boolean;
    music?: { title: number; boss: number; clear: number; gameover: number; victory?: number };
    /** Optional admission caps. OAM 40 and the fixed pool remain hard limits. */
    performance?: { enemies: number; playerShots: number; enemyShots: number; effects: number };
    effects: { explosion: string; duration: number };
    provenance: { author: string; license: string; source: string };
};
export type ProjectInfo = { name: string; title: string };
export type Diagnostic = {
    severity: "error" | "warning";
    target: string;
    message: string;
};
export type BuildResult = {
    ok: boolean;
    revision: string;
    configuration: string;
    romPath?: string;
    size?: number;
    ramBytes?: number;
    spriteTiles?: number;
    romHash?: string;
    builtAt?: string;
    durationMs?: number;
    error?: string;
    diagnostics?: Diagnostic[];
};
export const clone = <T>(value: T): T => structuredClone(value);
export const uid = (prefix = "item") =>
    `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
export const q4 = (n: number) => Math.round(n * 16);
export const clamp = (n: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, n));
export const normalMotion = (): Motion => ({
    kind: "straight",
    vx: 0,
    vy: 1,
    amplitude: 20,
    period: 120,
    loop: true,
    points: [
        { x: 0, y: 0, frame: 0 },
        { x: 40, y: 80, frame: 120 },
    ],
});
export const assetById = (game: Game, id: string) =>
    game.assets.find((a) => a.id === id)!;
export const patternById = (game: Game, id: string) =>
    game.patterns.find((p) => p.id === id);
export const DMG_COLORS = ["#e7efd7", "#a4b88a", "#52664b", "#1b2923"];
export const keys = {
    right: 1,
    left: 2,
    up: 4,
    down: 8,
    a: 16,
    b: 32,
    select: 64,
    start: 128,
};
export function supportedText(text: string) {
    return [...text.normalize("NFC")].every((c) =>
        /[\u0020-\u007e\u3041-\u3096\u30a1-\u30fa\u30fc\u3000-\u3002「」・]/u.test(
            c,
        ),
    );
}
export function frameAt(asset: Asset, tick: number): Frame {
    const sum = asset.frames.reduce((n, f) => n + f.duration, 0) || 1;
    let t = tick % sum;
    for (const f of asset.frames) {
        if (t < f.duration) return f;
        t -= f.duration;
    }
    return asset.frames[0];
}

type Shape =
    "string" | "number" | "boolean" | { [key: string]: Shape } | [Shape];

/** Check imported JSON before dereferencing it. Optional fields remain optional
 * so schema version 1 projects written before attack layers still load. */
export function validateShape(
    value: unknown,
    { requirePixels = true }: { requirePixels?: boolean } = {},
): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const point: Shape = { x: "number", y: "number" };
    const motion: Shape = {
        kind: "string",
        vx: "number",
        vy: "number",
        amplitude: "number",
        period: "number",
        loop: "boolean",
        points: [{ x: "number", y: "number", frame: "number" }],
    };
    const attacks: Shape = [{ id: "string", pattern: "string" }];
    const dialoguePage: Shape = {id: "string", speaker: "string", line1: "string", line2: "string"};
    const dialogueScene: Shape = {enabled: "boolean", background: "string", "portrait?": "string", pages: [dialoguePage]};
    const actor = {
        id: "string",
        name: "string",
        asset: "string",
        hp: "number",
        score: "number",
        motion,
        pattern: "string",
        "attacks?": attacks,
    } satisfies Record<string, Shape>;
    const schema: Shape = {
        schemaVersion: "number",
        name: "string",
        title: "string",
        mode: "string",
        seed: "number",
        startStage: "string",
        stageOrder: ["string"],
        palettes: [{ id: "string", name: "string", colors: ["string"] }],
        "dmgPalette?": "number",
        assets: [
            {
                id: "string",
                name: "string",
                kind: "string",
                width: "number",
                height: "number",
                palette: "number",
                origin: point,
                hitbox: { x: "number", y: "number", w: "number", h: "number" },
                emitters: [point],
                frames: [
                    {
                        id: "string",
                        image: "string",
                        duration: "number",
                        [requirePixels ? "pixels" : "pixels?"]: ["number"],
                    },
                ],
            },
        ],
        patterns: [
            {
                id: "string",
                name: "string",
                asset: "string",
                kind: "string",
                speed: "number",
                "launch?": {kind: "string", x: "number", y: "number", step: "number", lanes: "number"},
                "guidance?": {frames: "number", period: "number"},
                angle: "number",
                count: "number",
                spread: "number",
                interval: "number",
                rotation: "number",
                repeats: "number",
                delay: "number",
                lifetime: "number",
                damage: "number",
            },
        ],
        enemies: [actor],
        bosses: [
            {
                ...actor,
                "battle?": {background: "string", maxBullets: "number", "returnX?": "number", "returnY?": "number"},
                phases: [
                    {
                        id: "string",
                        name: "string",
                        until: "string",
                        threshold: "number",
                        "hp?": "number",
                        pattern: "string",
                        "attacks?": attacks,
                        motion,
                        "intro?": {enabled: "boolean", background: "string", spellName: "string", seconds: "number"},
                    },
                ],
            },
        ],
        stages: [
            {
                id: "string",
                name: "string",
                tileset: "string",
                width: "number",
                height: "number",
                tiles: ["number"],
                walls: ["number"],
                scrollSpeed: "number",
                loopMap: "boolean",
                duration: "number",
                clearOnBoss: "boolean",
                "requireBoss?": "boolean",
                "scrollDown?": "boolean",
                "music?": "number",
                "bossMusic?": "number",
                "presentation?": {
                    enabled: "boolean", dialogueBackground: "string", clearBackground: "string", rightPalette: "number",
                    dialogue: [{id: "string", speaker: "string", line1: "string", line2: "string"}],
                    clearEnabled: "boolean", baseBonus: "number", lifeBonus: "number", noMissBonus: "number", "clearWaitSeconds?": "number",
                    "victoryDialogue?": dialogueScene,
                    "dialoguePortrait?": "string",
                    "characterDialogues?": [{id: "string", character: "string", before: dialogueScene, after: dialogueScene}]
                },
                "parallax?": {enabled: "boolean", firstTile: "number", width: "number", height: "number", divisor: "number"},
                events: [
                    {
                        id: "string",
                        frame: "number",
                        kind: "string",
                        ref: "string",
                        x: "number",
                        y: "number",
                        count: "number",
                        spacing: "number",
                        interval: "number",
                        value: "number",
                    },
                ],
            },
        ],
        screens: [
            {
                id: "string",
                name: "string",
                background: "string",
                palette: "number",
                dock: "string",
                "rows?": "number",
                items: [
                    {
                        id: "string",
                        text: "string",
                        x: "number",
                        y: "number",
                        palette: "number",
                        binding: "string",
                        "digits?": "number",
                    },
                ],
            },
        ],
        player: {
            "name?": "string",
            "selectionBackground?": "string", "gameoverBackground?": "string",
            "characters?": [{id: "string", name: "string", asset: "string", speed: "number", weapon: "string", "focusWeapon?": "string", "focusSpeed?": "number", "bombBackground?": "string", "bombStyle?": "string", "selectionBackground?": "string", "gameoverBackground?": "string"}],
            "bomb?": {enabled: "boolean", stock: "number", damage: "number", frames: "number", flashPeriod: "number", background: "string"},
            asset: "string",
            speed: "number",
            lives: "number",
            invulnerability: "number",
            "respawnDelay?": "number",
            weapon: "string",
            "focusWeapon?": "string",
            "focusSpeed?": "number",
            x: "number",
            y: "number",
        },
        "startup?": {enabled:"boolean", fadeSeconds:"number", slides:[{id:"string",background:"string",seconds:"number"}]},
        "ending?": { seconds: "number", slides: [{id: "string", background: "string"}], "music?":"number", "scoreAfter?":"boolean",
            "characterSlides?":[{id:"string",character:"string",slides:[{id:"string",background:"string"}]}] },
        clearBonus: "number",
        "stageFade?": "boolean",
        "timeLimit?": "boolean",
        "bossCelebration?": "boolean",
        "music?": { title: "number", boss: "number", clear: "number", gameover: "number", "victory?": "number" },
        "performance?": { enemies: "number", playerShots: "number", enemyShots: "number", effects: "number" },
        effects: { explosion: "string", duration: "number" },
        provenance: { author: "string", license: "string", source: "string" },
    };
    const check = (data: unknown, expected: Shape, target: string) => {
        const error = (message: string) =>
            diagnostics.push({
                severity: "error",
                target,
                message,
            });
        if (typeof expected === "string") {
            if (typeof data !== expected)
                error(
                    `${expected === "string" ? "文字列" : expected === "number" ? "数値" : "真偽値"}が必要です`,
                );
        } else if (Array.isArray(expected)) {
            if (!Array.isArray(data)) error("配列が必要です");
            else
                for (let i = 0; i < data.length; i++)
                    check(data[i], expected[0], `${target}[${i}]`);
        } else if (!data || typeof data !== "object" || Array.isArray(data)) {
            error("設定オブジェクトが必要です");
        } else {
            const record = data as Record<string, unknown>;
            for (const [field, child] of Object.entries(expected)) {
                const optional = field.endsWith("?"),
                    key = optional ? field.slice(0, -1) : field;
                if (optional && record[key] === undefined) continue;
                check(
                    record[key],
                    child,
                    target === "project" ? key : `${target}.${key}`,
                );
            }
        }
    };
    check(value, schema, "project");
    if (!diagnostics.length && (value as Game).schemaVersion !== 1)
        diagnostics.push({
            severity: "error",
            target: "project",
            message: "未対応の作品形式です",
        });
    return diagnostics;
}

export function validate(value: unknown): Diagnostic[] {
    const shapeErrors = validateShape(value);
    if (shapeErrors.length) return shapeErrors;
    const game = value as Game;
    const d: Diagnostic[] = [];
    const err = (target: string, message: string) =>
        d.push({ severity: "error", target, message });
    const warn = (target: string, message: string) =>
        d.push({ severity: "warning", target, message });
    const uniqueIds = (items: { id: string }[], owner: string) => {
        const seen = new Set<string>();
        for (const item of items) {
            if (!item.id.trim() || seen.has(item.id))
                err(owner, "IDが空、または重複しています");
            seen.add(item.id);
        }
    };
    const integer = (
        value: number,
        min: number,
        max: number,
        target: string,
    ) => {
        if (!Number.isInteger(value) || value < min || value > max)
            err(target, `${min}〜${max}の整数が必要です`);
    };
    const finite = (
        value: number,
        min: number,
        max: number,
        target: string,
    ) => {
        if (!Number.isFinite(value) || value < min || value > max)
            err(target, `${min}〜${max}の数値が必要です`);
    };
    if (!game || game.schemaVersion !== 1)
        return [
            {
                severity: "error",
                target: "project",
                message: "未対応の作品形式です",
            },
        ];
    for (const name of [
        "assets",
        "patterns",
        "enemies",
        "bosses",
        "stages",
        "screens",
        "palettes",
    ] as const)
        uniqueIds(game[name], name);
    const assets = new Map(game.assets.map((a) => [a.id, a]));
    const patterns = new Set(game.patterns.map((p) => p.id));
    const assetRef = (id: string, owner: string, kind = "sprite") => {
        if (!assets.has(id) || assets.get(id)?.kind !== kind)
            err(owner, `${kind}素材「${id}」が見つかりません`);
    };
    const patternRef = (id: string, owner: string) => {
        if (id && !patterns.has(id))
            err(owner, `弾幕「${id}」が見つかりません`);
    };
    const attacks = (items: Actor["attacks"], owner: string) => {
        if (items === undefined) return;
        if (!Array.isArray(items) || items.length > 3) {
            err(owner, "追加弾幕レイヤーは3個までです");
            return;
        }
        uniqueIds(items, owner);
        for (const layer of items) {
            patternRef(layer.pattern, owner);
            if (!layer.pattern) err(owner, "弾幕レイヤーを選択してください");
        }
    };
    integer(game.palettes.length, 1, 8, "palettes");
    integer(game.assets.length, 1, 128, "assets");
    integer(game.assets.filter(a => a.kind === "sprite").length, 1, 64, "assets");
    integer(game.patterns.length, 1, 32, "patterns");
    integer(game.enemies.length, 1, 32, "enemies");
    integer(game.bosses.length, 1, 8, "bosses");
    integer(game.stages.length, 1, 16, "stages");
    integer(game.seed, 1, 255, "seed");
    if (game.dmgPalette !== undefined)
        integer(game.dmgPalette, 0, 255, "dmgPalette");
    integer(game.clearBonus, 0, 65535, "clearBonus");
    if (game.effects?.explosion) assetRef(game.effects.explosion, "effects");
    if (!game.effects) err("effects", "爆発エフェクト設定がありません");
    else integer(game.effects.duration, 1, 255, "effects");
    if (!["caravan", "campaign"].includes(game.mode))
        err("mode", "ゲームモードが不正です");
    for (const pal of game.palettes)
        if (
            pal.colors.length !== 4 ||
            pal.colors.some((c) => !/^#[0-9a-f]{6}$/i.test(c))
        )
            err(pal.id, "4色のRGBパレットが必要です");
    const images = new Map<string, { asset: Asset; frame: Frame }>();
    for (const a of game.assets) {
        uniqueIds(a.frames, a.id);
        if (!["sprite", "tileset", "screen"].includes(a.kind))
            err(a.id, "素材種別が不正です");
        integer(
            a.width,
            8,
            a.kind === "sprite" ? 32 : a.kind === "screen" ? 160 : 128,
            a.id,
        );
        integer(
            a.height,
            8,
            a.kind === "sprite" ? 32 : a.kind === "screen" ? 144 : 128,
            a.id,
        );
        if (a.width % 8 || a.height % 8)
            err(a.id, "画像寸法は8ピクセルの倍数にしてください");
        if (a.kind === "screen" && (a.width !== 160 || a.height !== 144))
            err(a.id, "画面背景は160×144です");
        integer(a.palette, 0, game.palettes.length - 1, a.id);
        integer(a.frames.length, 1, 16, a.id);
        if (a.kind !== "sprite" && a.frames.length > 1)
            warn(a.id, "背景素材は最初のフレームだけをROMに使用します");
        integer(a.origin.x, 0, a.width, a.id);
        integer(a.origin.y, 0, a.height, a.id);
        integer(a.hitbox.x, 0, a.width - 1, a.id);
        integer(a.hitbox.y, 0, a.height - 1, a.id);
        integer(a.hitbox.w, 1, a.width, a.id);
        integer(a.hitbox.h, 1, a.height, a.id);
        if (
            a.hitbox.x + a.hitbox.w > a.width ||
            a.hitbox.y + a.hitbox.h > a.height
        )
            err(a.id, "当たり判定が画像の外にあります");
        if (a.emitters.length > 4) err(a.id, "発射位置は最大4個です");
        for (const e of a.emitters) {
            integer(e.x, -32, 64, a.id);
            integer(e.y, -32, 64, a.id);
        }
        for (const f of a.frames) {
            integer(f.duration, 1, 255, a.id);
            if (!/^images\/[A-Za-z0-9._-]+\.png$/.test(f.image))
                err(a.id, "画像パスはimages内のPNGにしてください");
            if (
                !Array.isArray(f.pixels) ||
                f.pixels.length !== a.width * a.height ||
                f.pixels.some((p) => !Number.isInteger(p) || p < 0 || p > 3)
            )
                err(
                    a.id,
                    "画像は寸法と一致する4色インデックスデータが必要です",
                );
            // Windows project paths are case-insensitive. Two frame buffers may
            // share a source PNG only when saving either writes identical data.
            const imageKey = f.image.toLowerCase(),
                previous = images.get(imageKey);
            if (
                previous &&
                (previous.asset.width !== a.width ||
                    previous.asset.height !== a.height ||
                    (previous.asset.kind === "sprite") !==
                        (a.kind === "sprite") ||
                    previous.frame.pixels.length !== f.pixels.length ||
                    previous.frame.pixels.some(
                        (pixel, index) => pixel !== f.pixels[index],
                    ))
            )
                err(
                    a.id,
                    `画像パス「${f.image}」が異なる画像データで重複しています`,
                );
            else images.set(imageKey, { asset: a, frame: f });
        }
    }
    const motion = (m: Motion, owner: string) => {
        if (!["straight", "bounce", "wave", "path"].includes(m.kind))
            err(owner, "移動方式が不正です");
        finite(m.vx, -8, 8, owner);
        finite(m.vy, -8, 8, owner);
        integer(m.amplitude, 0, 80, owner);
        integer(m.period, 4, 1024, owner);
        if (m.points.length < 2 || m.points.length > 16)
            err(owner, "経路は2〜16点で指定してください");
        let last = -1;
        for (const p of m.points) {
            integer(p.frame, 0, 65535, owner);
            integer(p.x, -256, 256, owner);
            integer(p.y, -256, 256, owner);
            if (p.frame <= last)
                err(owner, "経路の通過時刻は昇順にしてください");
            last = p.frame;
        }
        if (m.points[0]?.frame !== 0) err(owner, "経路の最初の時刻は0です");
    };
    for (const p of game.patterns) {
        assetRef(p.asset, p.id);
        if (!["straight", "aimed", "fan", "ring", "spiral", "homing"].includes(p.kind))
            err(p.id, "弾幕方式が不正です");
        if (p.launch) {
            const l = p.launch;
            if (!["actor", "left", "right", "alternate", "both", "fixed"].includes(l.kind)) err(p.id, "発生位置が不正です");
            integer(l.x, 0, 159, p.id); integer(l.y, 0, 143, p.id);
            integer(l.step, 0, 64, p.id); integer(l.lanes, 1, 8, p.id);
            if (l.y + l.step * (l.lanes - 1) > 143) err(p.id, "発生レーンが画面下端を超えています");
        }
        if (p.guidance) {
            integer(p.guidance.frames, 0, 240, p.id);
            if (![8, 16, 32].includes(p.guidance.period)) err(p.id, "誘導周期は8・16・32更新です");
        }
        finite(p.speed, 0.0625, 8, p.id);
        finite(p.angle, -360, 360, p.id);
        finite(p.rotation, -360, 360, p.id);
        integer(p.count, 1, 16, p.id);
        finite(p.spread, 0, 360, p.id);
        integer(p.interval, 1, 1024, p.id);
        integer(p.repeats, 0, 255, p.id);
        integer(p.delay, 0, 65535, p.id);
        integer(p.lifetime, 1, 2048, p.id);
        integer(p.damage, 1, 255, p.id);
    }
    for (const a of [...game.enemies, ...game.bosses]) {
        attacks(a.attacks, a.id);
        assetRef(a.asset, a.id);
        patternRef(a.pattern, a.id);
        integer(a.hp, 1, 255, a.id);
        integer(a.score, 0, 65535, a.id);
        motion(a.motion, a.id);
    }
    for (const b of game.bosses) {
        if (b.battle) {
            if (!["stage", "blank", "bg-bullets"].includes(b.battle.background)) err(b.id, "ボス背景モードが不正です");
            integer(b.battle.maxBullets, 1, 64, b.id);
            if (b.battle.returnX !== undefined) integer(b.battle.returnX, 16, 144, b.id);
            if (b.battle.returnY !== undefined) integer(b.battle.returnY, 24, 64, b.id);
        }
        uniqueIds(b.phases, b.id);
        integer(b.phases.length, 1, 8, b.id);
        if (b.phases.at(-1)?.hp && b.phases.at(-1)?.until === "time") err(b.id, "フェーズHPを使う最終フェーズは残HP条件にしてください");
        for (const p of b.phases) {
            if (p.hp !== undefined) integer(p.hp, 0, 255, b.id);
            if (p.hp && p.until === "hp" && p.threshold !== 0) err(b.id, "フェーズHPを指定した攻撃は、次フェーズの条件値を0にしてください");
            if (p.intro) {
                finite(p.intro.seconds, 0.1, 10, b.id);
                if (p.intro.enabled) {
                    if (!game.assets.some(a => a.id === p.intro!.background && a.kind === "screen" && a.width === 160 && a.height === 144)) err(b.id, "カットインは160x144の画面画像を指定してください");
                    if (!p.intro.spellName.trim() || [...p.intro.spellName.normalize("NFC")].length > 36 || /[\r\n]/.test(p.intro.spellName)) err(b.id, "弾幕名は1〜36文字で指定してください");
                }
            }
            attacks(p.attacks, b.id);
            if (!["time", "hp"].includes(p.until))
                err(b.id, "フェーズ条件が不正です");
            patternRef(p.pattern, b.id);
            motion(p.motion, b.id);
            integer(
                p.threshold,
                p.until === "hp" ? 0 : 1,
                p.until === "hp" ? b.hp : 65535,
                b.id,
            );
        }
    }
    assetRef(game.player.asset, "player");
    patternRef(game.player.weapon, "player");
    if (game.player.focusWeapon) patternRef(game.player.focusWeapon, "player");
    if (game.player.focusSpeed !== undefined) finite(game.player.focusSpeed, 0.0625, 8, "player");
    if (game.startup) {
        const p = game.startup;
        finite(p.fadeSeconds, 0.1, 3, "startup"); integer(p.slides.length, 0, 16, "startup"); uniqueIds(p.slides, "startup");
        for (const slide of p.slides) {
            finite(slide.seconds, 0.1, 60, "startup");
            if (!game.assets.some(a => a.id === slide.background && a.kind === "screen" && a.width === 160 && a.height === 144)) err("startup", "ロゴには160x144の画面画像を指定してください");
        }
    }
    if (game.ending) {
        integer(game.ending.seconds, 1, 60, "ending");
        if (game.ending.music !== undefined) integer(game.ending.music, 0, 34, "ending");
        const variants = game.ending.characterSlides ?? [], seen = new Set<string>();
        integer(variants.length, 0, 3, "ending"); uniqueIds(variants, "ending");
        for (const v of variants) {
            if (!game.player.characters?.some(c => c.id === v.character) || seen.has(v.character)) err("ending", "追加機体の指定が不正または重複しています");
            seen.add(v.character);
        }
        for (const slides of [game.ending.slides, ...variants.map(v => v.slides)]) {
            uniqueIds(slides, "ending");
            if (slides.length > 20) err("ending", "スライドは20枚までです");
            for (const slide of slides) if (!game.assets.some(a => a.id === slide.background && a.kind === "screen" && a.width === 160 && a.height === 144)) err("ending", "160x144の画面画像を指定してください");
        }
    }
    if (game.music) for (const track of Object.values(game.music)) integer(track, 0, 34, "music");
    if (game.bossCelebration && game.music?.victory !== undefined && ![0, 6, 7, 8, 14, 15, 29].includes(game.music.victory))
        err("music", "撃破ファンファーレはループしない曲または無音を選択してください");
    if (game.performance) {
        integer(game.performance.enemies, 1, 12, "performance");
        integer(game.performance.playerShots, 1, 6, "performance");
        integer(game.performance.enemyShots, 1, 32, "performance");
        integer(game.performance.effects, 1, 4, "performance");
    }
    if (!game.player.weapon) err("player", "自機の武器を選択してください");
    const characters = game.player.characters ?? [];
    integer(characters.length, 0, 3, "player"); uniqueIds(characters, "player");
    for(const c of characters){
        if(c.bombBackground && !game.assets.some(a=>a.id===c.bombBackground && a.kind==="screen"))err("player","機体のボム画像が不正です");
        if(c.bombStyle && !["orb","beam"].includes(c.bombStyle))err("player","ボムの演出方式が不正です");
    }
    for (const p of [game.player, ...characters]) {
        for (const key of ["selectionBackground", "gameoverBackground"] as const)
            if (p[key]) assetRef(p[key]!, "player", "screen");
        if (p.name !== undefined && (!/^[\u0020-\u007e\u3000-\u30ff\u3400-\u9fff]+$/u.test(p.name) || !p.name.trim() || p.name.length > 16)) err("player", "機体名は英数字・日本語で1〜16文字です");
        assetRef(p.asset, "player"); patternRef(p.weapon, "player");
        if (!p.weapon) err("player", "各機体の武器を選択してください");
        if (p.focusWeapon) patternRef(p.focusWeapon, "player");
        finite(p.speed, 0.0625, 8, "player");
        if (p.focusSpeed !== undefined) finite(p.focusSpeed, 0.0625, 8, "player");
        for (const id of [p.weapon, p.focusWeapon]) {
            const shot = game.patterns.find(s => s.id === id);
            if (shot && (shot.kind === "homing" || shot.launch && shot.launch.kind !== "actor")) err("player", "自機ショットは機体起点・誘導なしで設定してください");
        }
    }
    if (game.player.bomb) {
        const b = game.player.bomb;
        integer(b.stock, 1, 9, "player"); integer(b.damage, 1, 255, "player");
        integer(b.frames, 12, 120, "player"); integer(b.flashPeriod, 1, 8, "player");
        if (b.enabled && !game.assets.some(a => a.id === b.background && a.kind === "screen")) err("player", "ボムの背景画像を選択してください");
    }
    finite(game.player.speed, 0.0625, 8, "player");
    integer(game.player.lives, 1, 9, "player");
    integer(game.player.invulnerability, 0, 1024, "player");
    if (game.player.respawnDelay !== undefined) integer(game.player.respawnDelay, 0, 600, "player");
    integer(game.player.x, 0, 159, "player");
    integer(game.player.y, 16, 135, "player");
    for (const stage of game.stages) {
        uniqueIds(stage.events, stage.id);
        assetRef(stage.tileset, stage.id, "tileset");
        integer(stage.width, 20, 20, stage.id);
        integer(stage.height, 18, 512, stage.id);
        integer(stage.duration, 1, 600, stage.id);
        if (stage.music !== undefined) integer(stage.music, 0, 34, stage.id);
        if (stage.bossMusic !== undefined) integer(stage.bossMusic, 0, 34, stage.id);
        finite(stage.scrollSpeed, 0, 4, stage.id);
        const presentation = stage.presentation;
        if (presentation) {
            if (presentation.dialoguePortrait) assetRef(presentation.dialoguePortrait, stage.id, "screen");
            const variants = presentation.characterDialogues ?? [];
            integer(variants.length, 0, 3, stage.id); uniqueIds(variants, stage.id);
            const seenCharacters = new Set<string>();
            for (const variant of variants) {
                if (!characters.some(c => c.id === variant.character)) err(stage.id, "会話の対象機体が見つかりません");
                if (seenCharacters.has(variant.character)) err(stage.id, "同じ機体の会話が重複しています");
                seenCharacters.add(variant.character);
                for (const scene of [variant.before, variant.after]) {
                    if (scene.background) assetRef(scene.background, stage.id, "screen");
                    if (scene.portrait) assetRef(scene.portrait, stage.id, "screen");
                    if (scene.enabled && !scene.background) err(stage.id, "機体別会話の背景画像が必要です");
                    uniqueIds(scene.pages, stage.id); integer(scene.pages.length, scene.enabled ? 1 : 0, 8, stage.id);
                    for (const page of scene.pages) for (const key of ["speaker", "line1", "line2"] as const)
                        if (!supportedText(page[key]) || page[key].normalize("NFC").length > 18) err(stage.id, "機体別会話は対応文字で各行18文字以内です");
                }
            }
            if (presentation.clearWaitSeconds !== undefined) integer(presentation.clearWaitSeconds, 1, 10, stage.id);
            for (const key of ["dialogueBackground", "clearBackground"] as const)
                if (presentation[key]) assetRef(presentation[key], stage.id, "screen");
            if (presentation.enabled && !presentation.dialogueBackground) err(stage.id, "会話の背景画像が必要です");
            if (presentation.clearEnabled && !presentation.clearBackground) err(stage.id, "クリア計算の背景画像が必要です");
            integer(presentation.rightPalette, 0, game.palettes.length - 1, stage.id);
            uniqueIds(presentation.dialogue, stage.id);
            integer(presentation.dialogue.length, presentation.enabled ? 1 : 0, 8, stage.id);
            for (const page of presentation.dialogue) for (const key of ["speaker", "line1", "line2"] as const) {
                if (!supportedText(page[key]) || page[key].normalize("NFC").length > 18)
                    err(stage.id, "会話は対応文字で各行18文字以内です");
            }
            const victory = presentation.victoryDialogue;
            if (victory) {
                if (victory.portrait) assetRef(victory.portrait, stage.id, "screen");
                if (victory.background) assetRef(victory.background, stage.id, "screen");
                if (victory.enabled && !victory.background) err(stage.id, "撃破後会話の背景画像が必要です");
                uniqueIds(victory.pages, stage.id);
                integer(victory.pages.length, victory.enabled ? 1 : 0, 8, stage.id);
                for (const page of victory.pages) for (const key of ["speaker", "line1", "line2"] as const) {
                    if (!supportedText(page[key]) || page[key].normalize("NFC").length > 18) err(stage.id, "撃破後会話は対応文字で各行18文字以内です");
                }
            }
            for (const value of [presentation.baseBonus, presentation.lifeBonus, presentation.noMissBonus]) integer(value, 0, 6000, stage.id);
        }
        if (stage.parallax) {
            const p = stage.parallax;
            integer(p.firstTile, 0, 127, stage.id); integer(p.width, 1, 4, stage.id);
            integer(p.height, 1, 2, stage.id); integer(p.divisor, 2, 8, stage.id);
            const a = assets.get(stage.tileset);
            if (p.enabled && a && p.firstTile + p.width * p.height > a.width * a.height / 64)
                err(stage.id, "視差タイル範囲がタイルセットを超えます");
        }
        integer(stage.events.length, 0, 256, stage.id);
        const set = assets.get(stage.tileset),
            tileCount = set ? (set.width / 8) * (set.height / 8) : 0;
        if (
            stage.tiles.length !== stage.width * stage.height ||
            stage.walls.length !== stage.tiles.length
        )
            err(stage.id, "マップと地形の寸法が一致しません");
        if (
            stage.tiles.some(
                (t) => !Number.isInteger(t) || t < 0 || t >= tileCount,
            )
        )
            err(stage.id, "タイルセットに存在しないタイルがあります");
        if (stage.walls.some((t) => t !== 0 && t !== 1))
            err(stage.id, "地形は0または1で指定してください");
        let expandedEvents = 0;
        for (const e of stage.events) {
            // Tick zero is playable; tick duration * 60 has already finished.
            integer(e.frame, 0, game.timeLimit === false ? 65534 : stage.duration * 60 - 1, e.id);
            integer(e.x, -32, 192, stage.id);
            integer(e.y, -32, 176, stage.id);
            integer(e.count, 1, 8, stage.id);
            integer(e.spacing, -64, 64, stage.id);
            integer(e.interval, 0, 1024, stage.id);
            finite(e.value, 0, 4, stage.id);
            if (e.kind === "enemy" && !game.enemies.some((a) => a.id === e.ref))
                err(e.id, "参照先の敵がありません");
            if (e.kind === "boss" && !game.bosses.some((a) => a.id === e.ref))
                err(e.id, "参照先のボスがありません");
            if (!["enemy", "boss", "scroll", "end"].includes(e.kind))
                err(e.id, "イベント種別が不正です");
            const spawn = e.kind === "enemy" || e.kind === "boss";
            expandedEvents += spawn ? e.count : 1;
            if (
                spawn &&
                e.frame + (e.count - 1) * e.interval >= (game.timeLimit === false ? 65535 : stage.duration * 60)
            )
                err(e.id, "編隊の出現がステージ終了時刻以降になっています");
        }
        if (expandedEvents > 1024)
            err(
                stage.id,
                `編隊を展開したイベントは1024個までです（現在${expandedEvents}）`,
            );
    }
    if (!game.stages.some((s) => s.id === game.startStage))
        err("startStage", "開始ステージがありません");
    if (
        !game.stageOrder.length ||
        game.stageOrder.some((id) => !game.stages.some((s) => s.id === id)) ||
        new Set(game.stageOrder).size !== game.stageOrder.length
    )
        err("stageOrder", "ステージ順が不正です");
    for (const name of ["title", "gameover", "clear", "scores", "hud"])
        if (!game.screens.some((s) => s.id === name))
            err(name, "必須画面がありません");
    for (const screen of game.screens) {
        uniqueIds(screen.items, screen.id);
        if (
            !["title", "gameover", "clear", "scores", "hud"].includes(screen.id)
        )
            err(screen.id, "画面種別が不正です");
        if (!["top", "bottom"].includes(screen.dock))
            err(screen.id, "HUDの配置は上または下にしてください");
        if (screen.background) assetRef(screen.background, screen.id, "screen");
        if (screen.id === "hud" && screen.background)
            warn(screen.id, "HUDの背景素材はROMに使用されません");
        integer(screen.palette, 0, game.palettes.length - 1, screen.id);
        integer(screen.items.length, 0, 32, screen.id);
        if (screen.rows !== undefined) integer(screen.rows, 1, 2, screen.id);
        for (const text of screen.items) {
            integer(text.x, 0, 19, screen.id);
            integer(text.y, 0, screen.id === "hud" ? (screen.rows ?? 2) - 1 : 17, screen.id);
            if (text.digits !== undefined) integer(text.digits, 1, 5, text.id);
            integer(text.palette, 0, game.palettes.length - 1, screen.id);
            if (!supportedText(text.text))
                err(text.id, "英数字・ひらがな・カタカナのみ使用できます");
            const width =
                text.text.normalize("NFC").length +
                (text.binding === "highscores"
                    ? 9
                    : text.binding === "none"
                      ? 0
                      : (text.digits ?? 5));
            if (
                ![
                    "none",
                    "score",
                    "lives",
                    "time",
                    "boss",
                    "highscores",
                    "bombs",
                ].includes(text.binding)
            )
                err(text.id, "動的表示の種類が不正です");
            if (text.x + width > 20) err(text.id, "表示が画面の右端を超えます");
            if (
                text.binding === "highscores" &&
                (screen.id === "hud" || text.y + 9 > 18)
            )
                err(text.id, "スコア一覧の表示領域が足りません");
        }
    }
    const spriteTiles = spriteLayout(game).tiles;
    if (spriteTiles > 128)
        err(
            "assets",
            `スプライトは合計128タイルまでです（現在${spriteTiles}）`,
        );
    return d;
}

/** One boss can exist at a time. Exclusive boss art shares a reloadable VRAM slot. */
export function spriteLayout(game: Game) {
    const resident = new Set([game.player.asset, ...(game.player.characters ?? []).map(p => p.asset), ...game.enemies.map(a => a.asset), ...game.patterns.map(p => p.asset), game.effects.explosion]);
    const overlay = new Set(game.bosses.map(b => b.asset).filter(id => !resident.has(id)));
    const assets = game.assets.filter(a => a.kind === "sprite");
    let base = 0, size = 0;
    const offsets = new Map<string, number>();
    for (const a of assets) {
        const n = a.width * a.height / 64 * a.frames.length;
        if (overlay.has(a.id)) size = Math.max(size, n);
        else { offsets.set(a.id, base); base += n; }
    }
    for (const id of overlay) offsets.set(id, base);
    return {overlay, offsets, tiles: base + size, base};
}
