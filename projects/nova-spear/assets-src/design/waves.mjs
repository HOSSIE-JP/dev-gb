/**
 * NOVA SPEAR authored combat data. Reusable by the project generator; the editor
 * owns game.json after generation. Coordinates are actor origins in screen px;
 * event and motion times are 60 Hz frames, stage durations are seconds.
 *
 * All ships use one muzzle. The player's primary fan emits three shots per volley.
 * Boss phase motion
 * is relative to the previous phase's last position, so the horizontal motion
 * amplitudes across ALL combat phases sum to <= 40 px. No combat phase has net
 * vertical travel. Enemy waves end before the large bosses reserve 16 OAM slots.
 */

const motion = (values = {}) => ({
    kind: "straight", vx: 0, vy: 0, amplitude: 0, period: 128,
    loop: false, points: [{ x: 0, y: 0, frame: 0 }, { x: 0, y: 0, frame: 128 }],
    ...values,
});
const path = (points, loop = false) => motion({
    kind: "path", loop, points: points.map(([frame, x, y]) => ({ frame, x, y })),
});
const pattern = (id, name, values = {}) => ({
    id, name, asset: "enemy-bullet", kind: "straight", speed: 1.25,
    angle: 180, count: 1, spread: 0, interval: 112, rotation: 0,
    repeats: 0, delay: 48, lifetime: 128, damage: 1, ...values,
});

export const patterns = [
    // One muzzle x three shots; two volleys coexist (six bullet slots).
    pattern("tri-pulse", "TRI PULSE / A rapid spread", {
        asset: "player-bullet", kind: "fan", count: 3, spread: 45,
        angle: 0, speed: 5, interval: 14, delay: 0, lifetime: 28,
    }),
    pattern("focus-lance", "FOCUS LANCE / B precision fire", {
        asset: "player-lance", angle: 0, speed: 6, interval: 8,
        delay: 0, lifetime: 28, damage: 2,
    }),
    pattern("scout-lock", "SCOUT / one aimed shot", {
        kind: "aimed", angle: 0, speed: 1, interval: 128,
        delay: 64, repeats: 1, lifetime: 144,
    }),
    pattern("scout-drop", "WEAVER / two downward shots", {
        speed: 1.125, interval: 96, delay: 56, repeats: 2,
    }),
    pattern("interceptor-lock", "INTERCEPTOR / delayed aimed shot", {
        kind: "aimed", angle: 0, speed: 1.375, interval: 128,
        delay: 72, repeats: 1, lifetime: 112,
    }),
    pattern("turret-lock", "TURRET / measured aimed pair", {
        kind: "aimed", angle: 0, speed: 1.375, interval: 112,
        delay: 64, repeats: 2, lifetime: 112,
    }),
    pattern("turret-spread", "TURRET / wide three-way", {
        kind: "fan", count: 3, spread: 90, speed: 1.25,
        interval: 128, delay: 72, repeats: 2, lifetime: 112,
    }),
    pattern("armor-split", "BULWARK / narrow three-way", {
        kind: "fan", count: 3, spread: 45, speed: 1.25,
        interval: 112, delay: 80, repeats: 2, lifetime: 112,
    }),
    pattern("trident-fan", "TRIDENT / opening fan", {
        kind: "fan", count: 3, spread: 90, speed: 1.25,
        interval: 88, delay: 40, lifetime: 128,
    }),
    pattern("trident-aim", "TRIDENT / offset lock", {
        kind: "aimed", angle: 0, speed: 1.5,
        interval: 112, delay: 88, lifetime: 96,
    }),
    pattern("trident-pinch", "TRIDENT / closing fan", {
        kind: "fan", count: 3, spread: 45, speed: 1.5,
        interval: 80, delay: 64, lifetime: 104,
    }),
    pattern("bastion-fan", "BASTION / five-way battery", {
        kind: "fan", count: 5, spread: 180, speed: 1.375,
        interval: 120, delay: 48, lifetime: 112,
    }),
    pattern("bastion-lock", "BASTION / alternating lock", {
        kind: "aimed", angle: 0, speed: 1.625,
        interval: 96, delay: 96, lifetime: 96,
    }),
    pattern("bastion-cross", "BASTION / cross battery", {
        kind: "fan", count: 3, spread: 90, speed: 1.5,
        interval: 88, delay: 64, lifetime: 104,
    }),
    pattern("bastion-last", "BASTION / breach salvo", {
        kind: "fan", count: 5, spread: 90, speed: 1.625,
        interval: 104, delay: 64, lifetime: 96,
    }),
    pattern("helix-ring", "HELIX / eight-point corona", {
        kind: "ring", angle: 0, count: 8, spread: 360, speed: 1.25,
        interval: 144, delay: 48, lifetime: 104,
    }),
    pattern("helix-spiral", "HELIX / rotating triple", {
        kind: "spiral", angle: 157.5, count: 3, spread: 90,
        rotation: 22.5, speed: 1.5, interval: 56, delay: 64, lifetime: 104,
    }),
    pattern("helix-lock", "HELIX / delayed core lock", {
        kind: "aimed", angle: 0, speed: 1.75,
        interval: 112, delay: 112, lifetime: 88,
    }),
    pattern("helix-collapse", "HELIX / five-way collapse", {
        kind: "fan", count: 5, spread: 135, speed: 1.75,
        interval: 88, delay: 80, lifetime: 88,
    }),
];

const enemy = (id, name, asset, hp, score, movement, attack = "") => ({
    id, name, asset, hp, score, motion: movement, pattern: attack,
});

export const enemies = [
    enemy("dart", "DART / formation scout", "scout", 1, 100,
        motion({ vy: 1.5 }), "scout-lock"),
    enemy("weaver", "WEAVER / sine formation", "scout", 2, 140,
        motion({ kind: "wave", vy: 1.125, amplitude: 16, period: 128 }), "scout-drop"),
    enemy("diver", "NEEDLE / fast assault", "interceptor", 2, 180,
        motion({ vy: 2 }), "scout-lock"),
    enemy("sweep-left", "RAVEN / left-to-right attack", "interceptor", 3, 240,
        path([[0, 0, 0], [64, 64, 24], [128, 128, 24], [192, 208, 120]]),
        "interceptor-lock"),
    enemy("sweep-right", "RAVEN / right-to-left attack", "interceptor", 3, 240,
        path([[0, 0, 0], [64, -64, 24], [128, -128, 24], [192, -208, 120]]),
        "interceptor-lock"),
    enemy("gun-tower", "SENTRY / aimed deck turret", "turret", 5, 300,
        motion({ vy: 0.5625 }), "turret-lock"),
    enemy("cross-tower", "SENTRY II / spread deck turret", "turret", 6, 360,
        motion({ vy: 0.625 }), "turret-spread"),
    enemy("bulwark", "BULWARK / armored gunship", "armored", 8, 500,
        motion({ kind: "bounce", vy: 0.75, amplitude: 8, period: 128 }), "armor-split"),
    enemy("beacon", "NOVA BEACON / 800 point route target", "score-beacon", 5, 800,
        motion({ vy: 0.625 })),
];

const phase = (id, name, until, threshold, attack, movement, layer = "") => ({
    id, name, until, threshold, pattern: attack, motion: movement,
    ...(layer ? { attacks: [{ id: `${id}-lock`, pattern: layer }] } : {}),
});
const entry = (boss) => phase(`${boss}-entry`, "APPROACH / weapons silent", "time", 64,
    "", motion({ vy: 0.75 }));
const patrol = (amplitude, period) => motion({ kind: "bounce", amplitude, period });
export const bosses = [
    {
        id: "trident", name: "TRIDENT / orbital interceptor", asset: "boss-trident",
        hp: 90, score: 2200, pattern: "", motion: motion(),
        phases: [
            entry("trident"),
            phase("trident-open", "WING BATTERIES", "hp", 55,
                "trident-fan", patrol(24, 192), "trident-aim"),
            phase("trident-close", "CORE OVERDRIVE", "hp", 0,
                "trident-pinch", patrol(16, 128), "trident-aim"),
        ],
    },
    {
        id: "bastion", name: "BASTION / dreadnought command ship", asset: "boss-bastion",
        hp: 140, score: 3200, pattern: "", motion: motion(),
        phases: [
            entry("bastion"),
            phase("bastion-battery", "DECK BATTERY", "hp", 92,
                "bastion-fan", patrol(20, 192)),
            phase("bastion-crossfire", "CROSS FIRE", "hp", 42,
                "bastion-cross", patrol(12, 128), "bastion-lock"),
            phase("bastion-breach", "HULL BREACH", "hp", 0,
                "bastion-last", patrol(8, 96), "bastion-lock"),
        ],
    },
    {
        id: "helix", name: "HELIX / autonomous nova reactor", asset: "boss-helix",
        hp: 200, score: 5200, pattern: "", motion: motion(),
        phases: [
            entry("helix"),
            phase("helix-corona", "CORONA FIELD", "hp", 140,
                "helix-ring", patrol(16, 192)),
            phase("helix-rotation", "HELIX ROTATION", "hp", 64,
                "helix-spiral", patrol(16, 128), "helix-lock"),
            phase("helix-collapse", "NOVA COLLAPSE", "hp", 0,
                "helix-collapse", patrol(8, 96), "helix-lock"),
        ],
    },
];

function choreography(id) {
    const events = [];
    const put = (seconds, label, kind, ref = "", x = 0, y = 0,
        count = 1, spacing = 0, interval = 0, value = 0) => {
        events.push({ id: `${id}-${label}`, frame: Math.round(seconds * 60),
            kind, ref, x, y, count, spacing, interval, value });
    };
    return {
        wave: (s, label, ref, x, count = 1, spacing = 0, interval = 0, y = -8) =>
            put(s, label, "enemy", ref, x, y, count, spacing, interval),
        scroll: (s, label, speed) => put(s, label, "scroll", "", 0, 0, 1, 0, 0, speed),
        boss: (s, ref) => put(s, "boss", "boss", ref, 80, -12),
        done: () => events.sort((a, b) => a.frame - b.frame || a.id.localeCompare(b.id)),
    };
}

function orbitalEvents() {
    const c = choreography("orbital");
    c.wave(1.2, "first-contact", "dart", 80, 3, 0, 20);
    c.wave(4.5, "wide-formation", "dart", 40, 3, 40, 12);
    c.wave(7.8, "weavers", "weaver", 48, 3, 32, 20);
    c.wave(11, "left-raven", "sweep-left", -8, 1, 0, 0, 24);
    c.wave(12.1, "right-raven", "sweep-right", 168, 1, 0, 0, 24);
    c.wave(14, "beacon-east", "beacon", 120);
    c.wave(14.8, "beacon-escorts", "dart", 48, 3, 24, 18);
    c.wave(18, "port-sentry", "gun-tower", 40);
    c.wave(18, "starboard-sentry", "gun-tower", 120);
    c.wave(20.8, "inner-lanes", "dart", 64, 2, 32, 36);
    c.wave(24.5, "first-dive", "diver", 40, 3, 40, 22);
    c.wave(27.8, "armored-check", "bulwark", 80);
    c.wave(29, "beacon-west", "beacon", 24);
    c.wave(32, "left-flight", "sweep-left", -8, 2, 0, 48, 24);
    c.wave(35.5, "right-flight", "sweep-right", 168, 2, 0, 48, 24);
    c.wave(39, "beacon-final", "beacon", 132);
    c.wave(39.3, "final-escort", "dart", 36, 3, 32, 24);
    c.wave(42.5, "last-assault", "diver", 32, 4, 32, 16);
    c.scroll(46, "boss-warning", 0.125);
    c.boss(50, "trident");
    return c.done();
}

function dreadnoughtEvents() {
    const c = choreography("dreadnought");
    c.wave(1.5, "deck-patrol", "dart", 32, 3, 48, 16);
    c.wave(4.7, "forward-port-sentry", "gun-tower", 40);
    c.wave(4.7, "forward-starboard-sentry", "gun-tower", 120);
    c.wave(6.5, "port-raven", "sweep-left", -8, 1, 0, 0, 24);
    c.wave(9, "beacon-starboard", "beacon", 136);
    c.wave(9.2, "screen-flight", "dart", 72, 2, 32, 16);
    c.wave(12, "deck-divers", "diver", 40, 3, 40, 20);
    c.scroll(14, "enter-battery", 0.625);
    c.wave(15, "cross-batteries", "cross-tower", 56, 2, 48, 0);
    c.wave(17.8, "central-bulwark", "bulwark", 80);
    c.wave(22, "beacon-port", "beacon", 24);
    c.wave(22.3, "port-screen", "sweep-right", 168, 1, 0, 0, 24);
    c.wave(25, "wide-weavers", "weaver", 32, 3, 48, 18);
    c.wave(28, "armored-pair", "bulwark", 56, 2, 48, 0);
    c.wave(31.8, "armor-escorts", "diver", 40, 3, 40, 16);
    c.wave(35, "port-squadron", "sweep-left", -8, 3, 0, 32, 24);
    c.wave(38.5, "beacon-bridge", "beacon", 132);
    c.wave(38.5, "bridge-sentry", "gun-tower", 48);
    c.wave(42, "bridge-divers", "diver", 28, 4, 32, 16);
    c.wave(45.5, "starboard-squadron", "sweep-right", 168, 3, 0, 32, 24);
    c.wave(49.5, "last-bulwark", "bulwark", 80);
    c.wave(50.5, "beacon-command", "beacon", 24);
    c.wave(53, "last-patrol", "dart", 40, 3, 40, 18);
    c.scroll(57, "boss-warning", 0.125);
    c.boss(60, "bastion");
    return c.done();
}

function reactorEvents() {
    const c = choreography("reactor");
    c.wave(1, "reactor-guard", "weaver", 32, 3, 48, 18);
    c.wave(4, "inbound-ravens", "sweep-left", -8, 2, 0, 36, 24);
    c.wave(7, "outer-port-battery", "cross-tower", 32);
    c.wave(7, "outer-starboard-battery", "cross-tower", 128);
    c.wave(9.5, "inner-guard", "dart", 64, 2, 32, 20);
    c.wave(13.2, "beacon-outer", "beacon", 120);
    c.wave(13.2, "outer-bulwark", "bulwark", 48);
    c.wave(17, "reactor-raven", "sweep-left", -8, 1, 0, 0, 24);
    c.wave(20, "crossing-port", "sweep-left", -8, 1, 0, 0, 24);
    c.wave(20.75, "crossing-starboard", "sweep-right", 168, 1, 0, 0, 24);
    c.scroll(22, "core-approach", 0.75);
    c.wave(23, "inner-port-battery", "gun-tower", 40);
    c.wave(23, "inner-starboard-battery", "gun-tower", 120);
    c.wave(26.2, "beacon-inner", "beacon", 24);
    c.wave(26.5, "inner-screen", "dart", 56, 3, 32, 16);
    c.wave(30, "core-bulwarks", "bulwark", 56, 2, 48, 0);
    c.wave(33.5, "core-raven", "sweep-right", 168, 1, 0, 0, 24);
    c.wave(37, "core-weavers", "weaver", 32, 4, 32, 18);
    c.wave(40.5, "beacon-lock", "beacon", 136);
    c.wave(40.5, "lock-sentry", "cross-tower", 48);
    c.wave(43.3, "last-ravens", "sweep-left", -8, 2, 0, 36, 24);
    c.wave(47.8, "reactor-shield", "bulwark", 80);
    c.wave(50, "twin-beacon-route", "beacon", 48, 2, 64, 0);
    c.wave(51, "shield-escort", "dart", 32, 3, 48, 16);
    c.wave(54.2, "final-dive", "diver", 20, 4, 40, 12);
    c.scroll(57, "boss-warning", 0.125);
    c.boss(60, "helix");
    return c.done();
}

// Supply width/height/tiles/walls from the map generator before validation.
export const stageBlueprints = [
    { id: "orbital-front", name: "01 ORBITAL FRONT", tileset: "orbital-tiles",
        scrollSpeed: 0.5, loopMap: true, duration: 75, clearOnBoss: true, requireBoss: true,
        events: orbitalEvents() },
    { id: "iron-dreadnought", name: "02 IRON DREADNOUGHT", tileset: "carrier-tiles",
        scrollSpeed: 0.5, loopMap: true, duration: 90, clearOnBoss: true, requireBoss: true,
        events: dreadnoughtEvents() },
    { id: "nova-reactor", name: "03 NOVA REACTOR", tileset: "reactor-tiles",
        scrollSpeed: 0.625, loopMap: true, duration: 90, clearOnBoss: true, requireBoss: true,
        events: reactorEvents() },
];

export const balance = {
    recommendedPlayer: { speed: 2.5, focusSpeed: 1.5, lives: 5,
        invulnerability: 150, weapon: "tri-pulse", focusWeapon: "focus-lance",
        asset: "player-ship", x: 80, y: 124 },
    clearBonus: 1500,
    // These values are descriptive targets, not extra scoring rules.
    scoreRoutes: [
        { stage: "orbital-front", beacons: 3, targetScore: 11000 },
        { stage: "iron-dreadnought", beacons: 4, targetScore: 27000 },
        { stage: "nova-reactor", beacons: 5, targetScore: 45000 },
    ],
    scoring: "Enemy destruction + 800 per beacon + boss score + 1500 per stage clear.",
    fairness: "Five lives for the full campaign; 150 invulnerable frames after damage. No contact damage from decorative backgrounds. Learnable entry gaps and silent boss approach.",
};

export function scoreCeiling() {
    const enemyScores = new Map(enemies.map((e) => [e.id, e.score]));
    const bossScores = new Map(bosses.map((b) => [b.id, b.score]));
    return stageBlueprints.map((stage) => ({
        stage: stage.id,
        enemies: stage.events.filter((e) => e.kind === "enemy").reduce((n, e) => n + e.count, 0),
        maximum: stage.events.reduce((n, e) => n +
            (e.kind === "enemy" ? enemyScores.get(e.ref) * e.count :
                e.kind === "boss" ? bossScores.get(e.ref) : 0), balance.clearBonus),
    }));
}
