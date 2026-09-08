/** Manual initial-authoring helper; ordinary builds and editor saves never run it. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { patterns, enemies, bosses, stageBlueprints, balance } from "./waves.mjs";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const destination = path.join(project, "assets-src/game.json");
if (fs.existsSync(destination) && !process.argv.includes("--overwrite")) {
    throw new Error("game.json already exists. Use --overwrite only to replace editor changes with the initial authored design.");
}
const manifest = JSON.parse(fs.readFileSync(path.join(project, "assets-src/art/manifest.json"), "utf8"));
const palette = (id, name, colors) => ({ id, name, colors });
const palettes = [
    palette("ice", "自機 / ICE BLUE", ["#030713", "#174385", "#37caf2", "#f3ffff"]),
    palette("gold", "弾・ビーコン / GOLD", ["#090611", "#8f3717", "#ffb838", "#fffbd4"]),
    palette("rose", "敵機 / HOT ROSE", ["#080611", "#622654", "#ee4b83", "#ffe4f4"]),
    palette("mint", "装甲 / MINT STEEL", ["#030d11", "#185060", "#59bea5", "#e2ffdf"]),
    palette("ember", "ボス / EMBER", ["#100511", "#6d223e", "#f17840", "#fff0ad"]),
    palette("orbital", "軌道・画面 / ORBITAL NAVY", ["#020510", "#102542", "#396f94", "#dbf7ff"]),
    palette("carrier", "戦艦 / BRONZE DECK", ["#07080f", "#282635", "#716178", "#edd5a5"]),
    palette("reactor", "炉心 / REACTOR VIOLET", ["#060312", "#241d4b", "#7759aa", "#ddedff"]),
];
const rolePalette = {
    player: 0, shot: 1, bonus: 1, enemy: 2, armor: 3, boss: 4,
    finalBoss: 7, space: 5, carrier: 6, reactor: 7, title: 5, clear: 5, gameover: 5,
};
const assets = manifest.assets.map(({ paletteRole, ...asset }) => ({
    ...asset,
    palette: rolePalette[paletteRole],
    origin: asset.kind === "sprite" ? { x: asset.width / 2, y: asset.height / 2 } : asset.origin,
    ...(asset.id === "player-lance" ? { name: "集中弾 / FOCUS LANCE" } : {}),
}));

function stageMap(index) {
    const width = 20, height = 256, tiles = Array(width * height).fill(0);
    const role = manifest.tilesetRoles[stageBlueprints[index].tileset];
    const put = (x, y, tile) => {
        if (x >= 0 && x < width && y >= 0 && y < height) tiles[y * width + x] = tile;
    };
    const block = (x, y, rows) => rows.forEach((row, dy) => row.forEach((tile, dx) => put(x + dx, y + dy, tile)));
    const noise = (x, y) => ((x * 47 + y * 83 + x * y * 7 + 73) >>> 0) % 97;
    if (index === 0) {
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const n = noise(x, y);
            if (n < 16) put(x, y, role.space[n % role.space.length]);
            if (n === 61 && (x < 4 || x > 15)) put(x, y, role.brightStar);
        }
        for (let y = 7; y < height; y += 24) {
            block(0, y, role.ruinModule);
            block(16, y + 11, role.ruinModule);
            block(0, y + 5, role.ruinBridge);
            block(16, y + 16, role.ruinBridge);
            for (let d = 0; d < 7; d++) {
                put(1, y + 7 + d, role.verticalRail[0]);
                put(18, y + 18 + d, role.verticalRail[1]);
            }
            put(4, y + 3, role.debris[(y >> 3) % role.debris.length]);
            put(15, y + 15, role.debris[(y >> 4) % role.debris.length]);
        }
    } else if (index === 1) {
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            if (x === 0 || x === 19) put(x, y, noise(x, y) < 18 ? role.space[(x + y) % role.space.length] : 0);
            else if (x <= 5 || x >= 14) put(x, y, y % 16 === 0 ? role.topSeam : role.deck);
            else if (x === 6 || x === 13) put(x, y, y % 8 === 0 ? role.railLamp : role.verticalRail);
        }
        for (let y = 5; y < height; y += 24) {
            block(1, y, role.ventModule);
            block(15, y + 12, role.ventModule);
            block(1, y + 6, role.hazardBand);
            block(15, y + 18, role.hazardBand);
            put(5, y + 2, role.leftSeam);
            put(14, y + 14, role.leftSeam);
        }
    } else {
        for (let y = 0; y < height; y++) {
            for (const x of [0, 1, 2, 3, 16, 17, 18, 19]) put(x, y, role.wall);
            for (const x of [4, 15]) put(x, y, y % 16 === 0 ? role.conduitJoint : y % 16 === 8 ? role.conduitPulse : role.verticalConduit);
            if (y % 32 === 7) { put(3, y, role.energyCell); put(16, y + 16, role.energyCell); }
        }
        for (let y = 4; y < height; y += 24) {
            block(0, y, role.reactorModule);
            block(16, y + 12, role.reactorModule);
            block(0, y + 7, role.ribBand);
            block(16, y + 19, role.ribBand);
        }
    }
    // Structures are scenery below the ships, not impassable walls.
    return { width, height, tiles, walls: Array(width * height).fill(0) };
}

const item = (id, text, x, y, binding = "none", palette = 5) => ({ id, text, x, y, palette, binding });
const screen = (id, name, background, items) => ({ id, name, background, palette: 5, dock: "top", items });
const screens = [
    screen("title", "タイトル / NOVA SPEAR", "title-art", [
        item("title-mode", "3 STAGES / 5 LIVES", 1, 7),
        item("title-start", "START MISSION", 3, 13),
        item("title-controls", "A WIDE / B FOCUS", 2, 15),
        item("title-scores", "SELECT SCORES", 3, 17),
    ]),
    screen("gameover", "通信途絶", "gameover-art", [
        item("over-heading", "SIGNAL LOST", 4, 1),
        item("over-score", "SCORE ", 3, 12, "score"),
        item("over-retry", "RETRY THE MISSION", 1, 14),
        item("over-title", "START : TITLE", 3, 16),
    ]),
    screen("clear", "全作戦完了", "clear-art", [
        item("clear-heading", "MISSION CLEAR", 3, 1),
        item("clear-score", "SCORE ", 3, 12, "score"),
        item("clear-ships", "SHIPS ", 3, 13, "lives"),
        item("clear-title", "START : TITLE", 3, 15),
    ]),
    screen("scores", "ハイスコア", "", [
        item("scores-title", "NOVA SPEAR", 5, 1),
        item("scores-label", "FLIGHT RECORDS", 3, 3),
        item("scores-list", "", 5, 5, "highscores"),
        item("scores-back", "A : TITLE", 5, 16),
    ]),
    screen("hud", "スコア・残機・制限時間・ボスHP", "", [
        item("hud-score", "S", 0, 0, "score"),
        item("hud-mark", "NOVA", 6, 0),
        item("hud-time", "TIME", 11, 0, "time"),
        item("hud-lives", "LIFE ", 0, 1, "lives"),
        item("hud-boss", "BOSS", 11, 1, "boss"),
    ]),
];

const game = {
    schemaVersion: 1, name: "nova-spear", title: "NOVA SPEAR", mode: "campaign",
    seed: 73, dmgPalette: 27,
    startStage: stageBlueprints[0].id, stageOrder: stageBlueprints.map((s) => s.id),
    palettes, assets, patterns, enemies, bosses,
    stages: stageBlueprints.map((stage, i) => ({ ...stage, ...stageMap(i), music: i + 2 })),
    screens, player: balance.recommendedPlayer, clearBonus: balance.clearBonus,
    effects: { explosion: "explosion", duration: 15 },
    music: { title: 1, boss: 5, clear: 6, gameover: 7 },
    provenance: {
        author: "HOSSIE-JP / NOVA SPEAR project",
        license: "Original project design and music; native pixel artwork CC0-1.0",
        source: "Original vertical shooting game; authored sprites, maps, choreography and score routes. No third-party game assets.",
    },
};
fs.writeFileSync(destination, `${JSON.stringify(game, null, 2)}\n`);
console.log(`Authored ${path.relative(process.cwd(), destination)} (${game.stages.length} stages).`);
