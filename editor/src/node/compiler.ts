import fs from "node:fs";
import { numericGlyphs } from "../shared/numeric-font";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
    type Game,
    type Motion,
    type Screen,
    type Diagnostic,
    validate,
    spriteLayout,
    q4,
} from "../shared/model";
import { angleStep, shotAngles, SIN, COS } from "../shared/simulation";
import {
    safePath,
    projectDir,
    readGame,
    atomicWrite,
    revision,
    hash,
} from "./project-store";
import {
    cancellationFile,
    gbdkExecutable,
    promoteBuild,
    recoverBuild,
} from "./build-workflow";

const bytes = (data: number[] | Uint8Array) => Array.from(data).join(",");
function crc32(data: Buffer) {
    let crc = -1;
    for (const b of data) {
        crc ^= b;
        for (let n = 0; n < 8; n++)
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
}
function chunk(type: string, data: Buffer) {
    const name = Buffer.from(type),
        out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length);
    name.copy(out, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([name, data])), out.length - 4);
    return out;
}
export function indexedPng(
    width: number,
    height: number,
    pixels: number[],
    transparent: boolean,
) {
    const head = Buffer.alloc(13);
    head.writeUInt32BE(width);
    head.writeUInt32BE(height, 4);
    head[8] = 8;
    head[9] = 3;
    const rows = Buffer.alloc((width + 1) * height);
    for (let y = 0; y < height; y++)
        Buffer.from(pixels.slice(y * width, (y + 1) * width)).copy(
            rows,
            y * (width + 1) + 1,
        );
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", head),
        chunk(
            "PLTE",
            Buffer.from([255, 255, 255, 170, 170, 170, 85, 85, 85, 0, 0, 0]),
        ),
        ...(transparent
            ? [chunk("tRNS", Buffer.from([0, 255, 255, 255]))]
            : []),
        chunk("IDAT", zlib.deflateSync(rows)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}
export function packTiles(width: number, height: number, pixels: number[]) {
    const out: number[] = [];
    for (let ty = 0; ty < height; ty += 8)
        for (let tx = 0; tx < width; tx += 8)
            for (let y = 0; y < 8; y++) {
                let a = 0,
                    b = 0;
                for (let x = 0; x < 8; x++) {
                    const p = pixels[(ty + y) * width + tx + x];
                    a |= (p & 1) << (7 - x);
                    b |= (p >> 1) << (7 - x);
                }
                out.push(a, b);
            }
    return out;
}
export function readFont(root: string) {
    const source = fs.readFileSync(
            safePath(root, ".tools/misaki/misaki_gothic.bdf"),
            "utf8",
        ),
        glyphs: Record<string, number[]> = {};
    for (const match of source.matchAll(
        /STARTCHAR[^\r\n]*\r?\n([\s\S]*?)ENDCHAR/g,
    )) {
        const block = match[1],
            code = Number(block.match(/ENCODING (\d+)/)?.[1]);
        const box = block.match(/BBX (\d+) (\d+) (-?\d+) (-?\d+)/);
        if (!box) continue;
        const [w, h, xoff, yoff] = box.slice(1).map(Number),
            rows =
                block
                    .split(/BITMAP\r?\n/)[1]
                    ?.trim()
                    .split(/\r?\n/) ?? [],
            pixels = Array(64).fill(0);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const py = 6 - h - yoff + y,
                    px = xoff + x;
                if (
                    py >= 0 &&
                    py < 8 &&
                    px >= 0 &&
                    px < 8 &&
                    (parseInt(rows[y], 16) >> (7 - x)) & 1
                )
                    pixels[py * 8 + px] = 3;
            }
        glyphs[String.fromCodePoint(code)] = pixels;
    }
    return { ...glyphs, ...numericGlyphs };
}
// makebin can report a destructive bank overlap and still return success.
// Reject its specific diagnostics before a ROM can replace the last good build.
export function verifyGbdkOutput(output: string) {
    if (/Warning:\s*(Multiple write|Possible overflow from Bank)/i.test(output))
        throw new Error(`GBDKのROMバンク重複・容量超過を検出しました。\n${output}`);
}
function run(
    exe: string,
    args: string[],
    cwd: string,
    log: (s: string) => void,
) {
    const result = spawnSync(exe, args, {
        cwd,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        // lcc forwards temporary paths without quotes. A relative temp directory
        // keeps every intermediate local and works when the repository has spaces.
        env: { ...process.env, TEMP: ".", TMP: "." },
    });
    if (result.stdout) log(result.stdout);
    if (result.stderr) log(result.stderr);
    verifyGbdkOutput(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
    if (result.error || result.status !== 0)
        throw new Error(
            result.error?.message ??
                `${path.basename(exe)} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
        );
    return result.stdout;
}
export function generate(
    root: string,
    game: Game,
    target: string,
    log: (s: string) => void = console.log,
    checkpoint: () => void = () => {},
) {
    const diagnostics = validate(game);
    if (diagnostics.some((d) => d.severity === "error"))
        throw new Error(
            diagnostics.map((d) => `${d.target}: ${d.message}`).join("\n"),
        );
    fs.mkdirSync(target, { recursive: true });
    const sources: string[] = [],
        decls: string[] = [],
        config: string[] = ['#include "caravan.h"'];
    const png2asset = gbdkExecutable(root, "png2asset");
    let serial = 0;
    function blob(data: number[] | Uint8Array) {
        const name = `ce_blob_${serial++}`,
            values = data.length ? Array.from(data) : [0],
            file = `${name}.c`;
        atomicWrite(
            path.join(target, file),
            `#pragma bank 255\n#include <gb/gb.h>\n#include <stdint.h>\nBANKREF(${name})\nconst uint8_t ${name}[] = {${bytes(values)}};\n`,
        );
        sources.push(file);
        decls.push(`BANKREF_EXTERN(${name})\nextern const uint8_t ${name}[];`);
        return `{BANK(${name}),${name},${values.length}}`;
    }
    function pages(data: number[], name: string) {
        const refs = [];
        for (let i = 0; i < data.length; i += 4096)
            refs.push(blob(data.slice(i, i + 4096)));
        config.push(`static const CE_Data ${name}[] = {${refs.join(",")}};`);
        return name;
    }
    const converted = new Map<string, number[]>();
    for (const asset of game.assets)
        for (const frame of asset.frames) {
            checkpoint();
            const stem = `image_${converted.size}`;
            // Full screens contain 360 raw tiles before our later deduplication.
            // Keep png2asset's intermediate maps within its 256-tile limit by
            // converting complete tile rows, then rejoin the row-major bytes.
            const bandHeight = Math.floor(256 / (asset.width / 8)) * 8;
            const bands: Buffer[] = [];
            for (let y = 0; y < asset.height; y += bandHeight) {
                checkpoint();
                const height = Math.min(bandHeight, asset.height - y);
                const band = asset.height > bandHeight
                    ? `${stem}_part${y / bandHeight}`
                    : stem;
                const input = path.join(target, `${band}.png`);
                const output = path.join(target, `${band}.bin`);
                atomicWrite(
                    input,
                    indexedPng(
                        asset.width,
                        height,
                        frame.pixels.slice(y * asset.width, (y + height) * asset.width),
                        asset.kind === "sprite",
                    ),
                );
                run(
                    png2asset,
                    [
                        path.basename(input),
                        "-o",
                        path.basename(output),
                        "-map",
                        "-bpp",
                        "2",
                        "-noflip",
                        "-keep_duplicate_tiles",
                        "-tiles_only",
                        "-no_palettes",
                        "-keep_palette_order",
                        "-bin",
                    ],
                    target,
                    log,
                );
                bands.push(fs.readFileSync(path.join(target, `${band}_tiles.bin`)));
            }
            const data = Buffer.concat(bands);
            const expected = Buffer.from(
                packTiles(asset.width, asset.height, frame.pixels),
            );
            if (!data.equals(expected))
                throw new Error(
                    `${asset.name}: png2assetのインデックス順序が元画像と一致しません`,
                );
            converted.set(frame.image, Array.from(data));
        }
    const spriteAssets = game.assets.filter((a) => a.kind === "sprite"),
        assetId = (id: string) => {
            const index = spriteAssets.findIndex((a) => a.id === id);
            if (index < 0) throw new Error(`Sprite missing: ${id}`);
            return index;
        };
    const patternId = (id: string) =>
        id ? game.patterns.findIndex((p) => p.id === id) : 255;
    const layout = spriteLayout(game);
    const spriteTiles = layout.tiles;
    const spriteData: number[] = Array(spriteTiles * 16).fill(0), bossGraphics: string[] = [],
        assetRows: string[] = [];
    spriteAssets.forEach((a, i) => {
        const first = 128 + layout.offsets.get(a.id)!,
            tileCount = (a.width * a.height) / 64;
        config.push(
            `static const uint8_t asset_${i}_durations[] = {${a.frames.map((f) => f.duration)}};`,
        );
        const emitters = a.emitters.length ? a.emitters : [a.origin];
        const duration = a.frames.reduce((sum, f) => sum + f.duration, 0);
        const frameTime = a.frames[0].duration;
        const powerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;
        const animationShift = powerOfTwo(a.frames.length) && powerOfTwo(frameTime) &&
            a.frames.every(f => f.duration === frameTime) ? Math.log2(frameTime) : 255;
        config.push(
            `static const int8_t asset_${i}_emitters[] = {${emitters.flatMap((e) => [e.x - a.origin.x, e.y - a.origin.y])}};`,
        );
        assetRows.push(
            `{${[a.width, a.height, a.origin.x, a.origin.y, a.palette, first, tileCount, a.frames.length, duration, animationShift]},asset_${i}_durations,${emitters.length},asset_${i}_emitters}`,
        );
        const data = a.frames.flatMap(f => converted.get(f.image)!);
        if (layout.overlay.has(a.id)) bossGraphics.push(blob(data));
        else { spriteData.splice((first - 128) * 16, data.length, ...data); bossGraphics.push("{0,0,0}"); }
    });
    config.push(
        `const CE_Asset ce_assets[] = {${assetRows}};`,
        `const CE_Hitbox ce_hitboxes[]={${spriteAssets.map((a) => `{${a.hitbox.x - a.origin.x},${a.hitbox.y - a.origin.y},${a.hitbox.w},${a.hitbox.h}}`)}};`,
        `const uint8_t ce_asset_count=${spriteAssets.length}, ce_sprite_tiles=${spriteTiles};`,
        `const CE_Data ce_sprite_data=${blob(spriteData)};`,
        `const CE_Data ce_boss_graphics[]={${bossGraphics}};`,
    );
    const speeds = [...new Set(game.patterns.map(p => q4(p.speed)))];
    for (const speed of speeds) config.push(`static const int16_t velocity_${speed}[]={${SIN.flatMap((s, i) => [Math.trunc(s * speed / 16), Math.trunc(-COS[i] * speed / 16)])}};`);
    const patternRows = game.patterns.map((p, i) => {
        const offsets = shotAngles(
            { ...p, angle: 0, kind: p.kind === "spiral" ? "fan" : p.kind },
            0,
            0,
            -1,
        );
        config.push(
            `static const int8_t pattern_${i}_angles[] = {${offsets}};`,
        );
        return `{${[assetId(p.asset), ["straight", "aimed", "fan", "ring", "spiral"].indexOf(p.kind), q4(p.speed), angleStep(p.angle), offsets.length, angleStep(p.rotation), p.repeats, p.interval, p.delay, p.lifetime, p.damage]},pattern_${i}_angles,velocity_${q4(p.speed)}}`;
    });
    config.push(
        `const CE_Pattern ce_patterns[]={${patternRows}};`,
        `const uint8_t ce_pattern_count=${game.patterns.length};`,
    );
    let motionSerial = 0;
    const motionCache = new Map<string, string>();
    function motion(m: Motion) {
        const key = JSON.stringify(m);
        const cached = motionCache.get(key);
        if (cached) return cached;
        const name = `motion_${motionSerial++}`;
        const points = m.points.map((p, i) => {
            const next = m.points[i + 1] ?? p,
                dt = Math.max(1, next.frame - p.frame);
            return `{${p.frame},${q4(p.x)},${q4(p.y)},${Math.trunc(q4(next.x - p.x) / dt)},${Math.trunc(q4(next.y - p.y) / dt)}}`;
        });
        config.push(
            `static const CE_Point ${name}_points[]={${points}};`,
            `static const CE_Motion ${name}={${["straight", "bounce", "wave", "path"].indexOf(m.kind)},${q4(m.vx)},${q4(m.vy)},${m.amplitude},${m.period},${+m.loop},${points.length},${name}_points};`,
        );
        const pointer = `&${name}`;
        motionCache.set(key, pointer);
        return pointer;
    }
    let attackSerial = 0;
    const attackList = (items: { pattern: string }[] = []) => {
        if (!items.length) return "0,0";
        const name = `attack_layers_${attackSerial++}`;
        config.push(
            `static const uint8_t ${name}[]={${items.map((p) => patternId(p.pattern))}};`,
        );
        return `${items.length},${name}`;
    };
    const intros = game.bosses.flatMap(b => b.phases.filter(p => p.intro?.enabled));
    const introFirst = 5 + game.stages.reduce((n,stage) => { const p = stage.presentation; return n + (p?.enabled ? p.dialogue.length : 0) + (p?.clearEnabled ? 1 : 0); }, 0) + (game.ending?.slides.length ?? 0);
    const enemies = game.enemies.map(
        (a) =>
            `{${assetId(a.asset)},${a.hp},${a.score},${patternId(a.pattern)},${motion(a.motion)},0,0,${attackList(a.attacks)},0,0}`,
    );
    const bosses = game.bosses.map((a, i) => {
        const phases = a.phases.map(
            (p) =>
                `{${p.until === "hp" ? 1 : 0},${p.threshold},${patternId(p.pattern)},${motion(p.motion)},${attackList(p.attacks)},${p.intro?.enabled ? introFirst + intros.indexOf(p) : 255},${p.intro?.enabled ? Math.round(p.intro.seconds * 60) : 0}}`,
        );
        config.push(`static const CE_Phase boss_${i}_phases[]={${phases}};`);
        return `{${assetId(a.asset)},${a.hp},${a.score},${patternId(a.pattern)},${motion(a.motion)},${phases.length},boss_${i}_phases,${attackList(a.attacks)},${["stage", "blank", "bg-bullets"].indexOf(a.battle?.background ?? "stage")},${a.battle?.maxBullets ?? 64}}`;
    });
    config.push(
        `const CE_Actor ce_enemies[]={${enemies}};`,
        `const CE_Actor ce_bosses[]={${bosses}};`,
        `const uint8_t ce_enemy_count=${enemies.length},ce_boss_count=${bosses.length};`,
    );
    const glyphs = readFont(root),
        screenRows: string[] = [], sceneConfig: string[] = [];
    let hudTileCount = 0;
    function compileScreen(s: Screen, index: number, rightPalette?: number, sharedChars = "") {
        const width = 20,
            height = s.id === "hud" ? (s.rows ?? 2) : 18,
            tileBytes = Array(16).fill(0),
            tileMap = Array(width * height).fill(0),
            attrs = tileMap.map(() => s.palette),
            dictionary = new Map<string, number>([
                [Array(16).fill(0).join(","), 0],
            ]);
        const addTile = (tile: number[]) => {
            const key = tile.join(",");
            if (dictionary.has(key)) return dictionary.get(key)!;
            const id = tileBytes.length / 16;
            dictionary.set(key, id);
            tileBytes.push(...tile);
            return id;
        };
        if (s.background && s.id !== "hud") {
            const a = game.assets.find((a) => a.id === s.background)!,
                data = converted.get(a.frames[0].image)!;
            for (let i = 0; i < tileMap.length; i++) {
                tileMap[i] = addTile(data.slice(i * 16, i * 16 + 16));
                attrs[i] = rightPalette !== undefined && i % 20 >= 10 ? rightPalette : a.palette;
            }
        }
        const chars: Record<string, number> = {};
        const charTile = (char: string) => {
            if (chars[char] !== undefined) return chars[char];
            const pixels = glyphs[char];
            if (!pixels) throw new Error(`${s.name}: 未対応文字「${char}」`);
            return (chars[char] = addTile(packTiles(8, 8, pixels)));
        };
        for (const char of sharedChars) charTile(char);
        const bindings: string[] = [];
        for (const item of s.items) {
            const labelLength = item.text.normalize("NFC").length;
            [...item.text.normalize("NFC")].forEach((char, n) => {
                tileMap[item.y * width + item.x + n] = charTile(char);
                attrs[item.y * width + item.x + n] = item.palette;
            });
            if (item.binding !== "none") {
                bindings.push(
                    `{${["none", "score", "lives", "time", "boss", "highscores"].indexOf(item.binding)},${item.x + labelLength},${item.y},${item.digits ?? 5}}`,
                );
                const count = item.binding === "highscores" ? 9 : (item.digits ?? 5);
                for (let n = 0; n < count; n++)
                    if (item.x + labelLength + n < 20)
                        for (
                            let row = 0;
                            row < (item.binding === "highscores" ? 5 : 1);
                            row++
                        )
                            attrs[
                                (item.y + row * 2) * width +
                                    item.x +
                                    labelLength +
                                    n
                            ] = item.palette;
            }
        }
        const digits = bindings.length
            ? [..."0123456789"].map(charTile)
            : Array(10).fill(0);
        if (bindings.length) charTile(" ");
        const count = tileBytes.length / 16;
        // Full-screen scenes hide sprites and reload their tiles on stage entry.
        // They may use both halves of the BG tile area; gameplay/HUD still share
        // the original 128-tile budget with sprites. 255 fits CE_Screen.tile_count.
        const tileLimit = s.id === "hud" ? 128 : 255;
        if (count > tileLimit)
            throw new Error(
                `${s.name}: 背景と文字が${count}タイルあります（上限${tileLimit}）`,
            );
        if (s.id === "hud") hudTileCount = count;
        sceneConfig.push(
            `static const uint8_t screen_${index}_digits[]={${digits}};`,
            `static const CE_Binding screen_${index}_bindings[]={${bindings.length ? bindings.join(",") : "{0,0,0,5}"}};`,
        );
        screenRows.push(
            `{${blob(tileBytes)},${blob(tileMap)},${blob(attrs)},${count},${s.palette},${bindings.length},screen_${index}_bindings,screen_${index}_digits}`,
        );
    }
    ["title", "gameover", "clear", "scores", "hud"].forEach((id, i) =>
        compileScreen(
            game.screens.find((s) => s.id === id)!,
            i,
        ),
    );

    const ordered = game.stageOrder.map((id) =>
        game.stages.find((s) => s.id === id)!,
    );
    // Unordered stages remain selectable in caravan mode and by the preview.
    for (const stage of game.stages)
        if (!ordered.includes(stage)) ordered.push(stage);
    const presentationRows: string[] = [], parallaxRows: string[] = [];
    for (const stage of ordered) {
        const p = stage.presentation;
        const first = screenRows.length;
        const dialogueChars = p?.enabled ? [...new Set(p.dialogue.map(page => page.speaker + page.line1 + page.line2).join("") + "A:つぎ START:スキップ")].join("") : "";
        if (p?.enabled) for (const page of p.dialogue) {
            compileScreen({id: "clear", name: `${stage.name} ${page.speaker}`, background: p.dialogueBackground, palette: 0, dock: "top", items: [
                {id: "name", text: page.speaker, x: 1, y: 12, palette: 0, binding: "none"},
                {id: "line1", text: page.line1, x: 1, y: 14, palette: 0, binding: "none"},
                {id: "line2", text: page.line2, x: 1, y: 15, palette: 0, binding: "none"},
                {id: "next", text: "A:つぎ START:スキップ", x: 1, y: 17, palette: 0, binding: "none"}
            ]}, screenRows.length, p.rightPalette, dialogueChars);
        }
        const clear = screenRows.length;
        if (p?.clearEnabled) compileScreen({id: "clear", name: `${stage.name} BONUS`, background: p.clearBackground, palette: 0, dock: "top", items: [
            {id: "heading", text: "STAGE CLEAR", x: 4, y: 0, palette: 0, binding: "none"},
            {id: "base", text: "ステージ     ", x: 1, y: 12, palette: 0, binding: "score"},
            {id: "lives", text: "のこり      ", x: 1, y: 13, palette: 0, binding: "score"},
            {id: "miss", text: "ノーミス     ", x: 1, y: 14, palette: 0, binding: "score"},
            {id: "total", text: "ごうけい     ", x: 1, y: 15, palette: 0, binding: "score"},
            {id: "next", text: "A:つぎへ", x: 10, y: 17, palette: 0, binding: "none"}
        ]}, screenRows.length, p.rightPalette);
        presentationRows.push(`{${first},${p?.enabled ? p.dialogue.length : 0},${p?.clearEnabled ? clear : 255},${p?.baseBonus ?? game.clearBonus},${p?.lifeBonus ?? 0},${p?.noMissBonus ?? 0},${(p?.clearWaitSeconds ?? 2) * 60}}`);
        const par = stage.parallax;
        if (par?.enabled) {
            const asset = game.assets.find(a => a.id === stage.tileset)!;
            const tileData = converted.get(asset.frames[0].image)!;
            const source = tileData.slice(par.firstTile * 16, (par.firstTile + par.width * par.height) * 16);
            const phases: number[] = [];
            for (let shift = 0; shift < par.height * 8; shift++) {
                for (let tile = 0; tile < par.width * par.height; tile++) {
                    for (let line = 0; line < 8; line++) {
                        const y = (Math.floor(tile / par.width) * 8 + line + shift) % (par.height * 8);
                        const src = (Math.floor(y / 8) * par.width + tile % par.width) * 16 + (y % 8) * 2;
                        phases.push(source[src], source[src + 1]);
                    }
                }
            }
            parallaxRows.push(`{${par.firstTile},${par.width * par.height},${par.height * 8},${par.divisor},${blob(phases)}}`);
        } else parallaxRows.push("{0,0,1,2,{0,0,0}}");
    }
    const endingFirst = screenRows.length;
    for (const slide of game.ending?.slides ?? []) compileScreen({id: "clear", name: "Ending", background: slide.background, palette: 0, dock: "top", items: []}, screenRows.length);
    config.push(`const uint8_t ce_ending_first=${endingFirst},ce_ending_count=${game.ending?.slides.length ?? 0};`, `const uint16_t ce_ending_frames=${(game.ending?.seconds ?? 6) * 60};`);
    if (screenRows.length !== introFirst) throw new Error("Cut-in screen index mismatch");
    for (const phase of intros) {
        const intro = phase.intro!, name = [...intro.spellName.normalize("NFC")];
        compileScreen({id: "clear", name: phase.name, background: intro.background, palette: 0, dock: "top", items: [
            {id: "spell-1", text: name.slice(0,18).join(""), x: 1, y: 14, palette: 0, binding: "none"},
            {id: "spell-2", text: name.slice(18).join(""), x: 1, y: 16, palette: 0, binding: "none"},
        ]}, screenRows.length);
    }
    if (screenRows.length > 255) throw new Error("会話を含む画面は255枚までです");
    sceneConfig.push(`const CE_Screen ce_screens[]={${screenRows}};`,
        `const CE_Presentation ce_presentations[]={${presentationRows}};`,
        `const CE_Parallax ce_parallaxes[]={${parallaxRows}};`);
    const stageRows = ordered.map((s, i) => {
        const tileAsset = game.assets.find((a) => a.id === s.tileset)!,
            tiles = converted.get(tileAsset.frames[0].image)!,
            tileCount = tiles.length / 16;
        if (hudTileCount + tileCount > 128)
            throw new Error(
                `${s.name}: HUDと背景タイルの合計${hudTileCount + tileCount}が128を超えます`,
            );
        const eventData: number[] = [];
        const events = s.events
            .flatMap((e) =>
                Array.from(
                    {
                        length:
                            e.kind === "enemy" || e.kind === "boss"
                                ? e.count
                                : 1,
                    },
                    (_, n) => ({
                        ...e,
                        frame: e.frame + n * e.interval,
                        x: e.x + n * e.spacing,
                    }),
                ),
            )
            .sort((a, b) => a.frame - b.frame);
        const word = (n: number) => [n & 255, (n >> 8) & 255];
        for (const e of events)
            eventData.push(
                ...word(e.frame),
                ["enemy", "boss", "scroll", "end"].indexOf(e.kind) + 1,
                e.kind === "enemy"
                    ? game.enemies.findIndex((a) => a.id === e.ref)
                    : e.kind === "boss"
                      ? game.bosses.findIndex((a) => a.id === e.ref)
                      : 0,
                ...word(e.x),
                ...word(e.y),
                q4(e.value),
            );
        if (events.length > 1024)
            throw new Error(`${s.name}: 展開後のイベントは1024個までです`);
        const map = pages(s.tiles, `stage_${i}_map`),
            walls = pages(s.walls, `stage_${i}_walls`);
        return `{${s.height},${s.duration * 60},${events.length},${q4(s.scrollSpeed)},${+s.loopMap},${+s.clearOnBoss},${+s.walls.some(Boolean)},${blob(tiles)},${tileCount},${tileAsset.palette},${map},${walls},${blob(eventData)},${+(s.requireBoss ?? false)},${s.music ?? 0},${+(s.scrollDown ?? false)},${s.bossMusic ?? 0}}`;
    });
    config.push(
        `const CE_Stage ce_stages[]={${stageRows}};`,
        `const uint8_t ce_stage_count=${game.mode === "campaign" ? game.stageOrder.length : ordered.length};`,
    );
    const color = (hex: string) => {
        const v = parseInt(hex.slice(1), 16);
        return (
            Math.round((((v >> 16) & 255) * 31) / 255) |
            (Math.round((((v >> 8) & 255) * 31) / 255) << 5) |
            (Math.round(((v & 255) * 31) / 255) << 10)
        );
    };
    config.push(
        `const palette_color_t ce_palettes[]={${game.palettes.flatMap((p) => p.colors.map(color))}};`,
        `const uint8_t ce_palette_count=${game.palettes.length};`,
        `const uint8_t ce_dmg_palette=${game.dmgPalette ?? 0xe4};`,
        `const int8_t ce_sin[16]={${SIN}},ce_cos[16]={${COS}};`,
    );
    config.push(
        `const uint8_t ce_campaign=${+(game.mode === "campaign")},ce_start_stage=${Math.max(
            0,
            ordered.findIndex((s) => s.id === game.startStage),
        )},ce_hud_bottom=${+(game.screens.find((s) => s.id === "hud")!.dock === "bottom")},ce_hud_height=${(game.screens.find((s) => s.id === "hud")!.rows ?? 2) * 8};`,
    );
    config.push(
        `const uint8_t ce_player_asset=${assetId(game.player.asset)},ce_player_weapon=${patternId(game.player.weapon)},ce_player_speed=${q4(game.player.speed)},ce_player_lives=${game.player.lives};`,
        `const uint8_t ce_player_focus_weapon=${game.player.focusWeapon ? patternId(game.player.focusWeapon) : 255},ce_player_focus_speed=${q4(game.player.focusSpeed ?? game.player.speed)};`,
        `const uint8_t ce_music_title=${game.music?.title ?? 0},ce_music_boss=${game.music?.boss ?? 0},ce_music_clear=${game.music?.clear ?? 0},ce_music_gameover=${game.music?.gameover ?? 0},ce_music_victory=${game.music?.victory ?? 8};`,
        `const uint8_t ce_entity_limits[6]={0,${game.performance?.enemies ?? 12},1,${game.performance?.playerShots ?? 6},${game.performance?.enemyShots ?? 32},${game.performance?.effects ?? 4}};`,
    );
    config.push(
        `const uint16_t ce_player_invulnerability=${game.player.invulnerability},ce_clear_bonus=${game.clearBonus},ce_player_respawn_delay=${game.player.respawnDelay ?? 0};`,
        `const uint8_t ce_save_id[]={${Array.from(Buffer.from(game.name)).reduce((h, b) => Math.imul(h ^ b, 16777619) >>> 0, 2166136261).toString(16).padStart(8,"0").match(/../g)!.map(b => parseInt(b,16))}};`,
        `const uint8_t ce_stage_fade=${+(game.stageFade ?? true)},ce_time_limit=${+(game.timeLimit ?? true)},ce_boss_celebration=${+(game.bossCelebration ?? false)};`,
        `const int16_t ce_player_start_x=${q4(game.player.x)},ce_player_start_y=${q4(game.player.y)};`,
        `const uint8_t ce_explosion_asset=${game.effects.explosion ? assetId(game.effects.explosion) : 255},ce_explosion_duration=${game.effects.duration};`,
    );
    atomicWrite(path.join(target, "caravan_scenes.c"),
        ['#pragma bank 1', '#include "caravan.h"', ...decls, ...sceneConfig].join("\n") + "\n");
    sources.push("caravan_scenes.c");
    atomicWrite(
        path.join(target, "caravan_data.c"),
        [config[0], ...decls, ...config.slice(1)].join("\n") + "\n",
    );
    atomicWrite(
        path.join(target, "caravan_main.c"),
        '#include "caravan.h"\nvoid main(void) { ce_run(); }\n',
    );
    sources.push("caravan_data.c", "caravan_main.c");
    const report = {
        revision: revision(game),
        spriteTiles,
        hudTileCount,
        dataBanks: serial,
        diagnostics,
        sourceFiles: sources,
        stageIds: ordered.map((s) => s.id),
    };
    atomicWrite(
        path.join(target, "manifest.json"),
        JSON.stringify(report, null, 2) + "\n",
    );
    return report;
}

export function verifyRom(rom: Buffer) {
    if (rom.length < 32768 || (rom.length & (rom.length - 1)) !== 0)
        throw new Error("ROM容量が不正です");
    if (rom[0x143] !== 0x80) throw new Error("DMG/CGB共通ROMではありません");
    let checksum = 0;
    for (let i = 0x134; i <= 0x14c; i++)
        checksum = (checksum - rom[i] - 1) & 255;
    if (checksum !== rom[0x14d])
        throw new Error("ROMヘッダチェックサムが不正です");
}
export function compile(
    root: string,
    name: string,
    configuration = "Debug",
    log: (s: string) => void = console.log,
    options: { expectedRevision?: string; cancellationToken?: string } = {},
) {
    if (!["Debug", "Release"].includes(configuration))
        throw new Error("構成はDebugまたはReleaseです");
    const started = Date.now();
    const checkpoint = () => {
        if (
            options.cancellationToken &&
            fs.existsSync(cancellationFile(root, options.cancellationToken))
        )
            throw new Error(
                "ビルドを中止しました。最後の正常なROMは保持されています。",
            );
    };
    checkpoint();
    const dir = projectDir(root, name),
        game = readGame(root, name),
        lockfile = safePath(dir, "build/.caravan-build.lock");
    if (options.expectedRevision && revision(game) !== options.expectedRevision)
        throw new Error(
            "ビルド開始前に作品が変更されました。保存状態を確認して再実行してください",
        );
    fs.mkdirSync(path.dirname(lockfile), { recursive: true });
    if (fs.existsSync(lockfile)) {
        const pid = Number(fs.readFileSync(lockfile, "utf8").trim());
        let alive = true;
        if (Number.isInteger(pid) && pid > 0)
            try {
                process.kill(pid, 0);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ESRCH")
                    alive = false;
            }
        if (alive) throw new Error("同じ作品のビルドが実行中です");
        fs.unlinkSync(lockfile);
    }
    const fd = fs.openSync(lockfile, "wx");
    const work = safePath(dir, "build", `work-${crypto.randomUUID()}`);
    try {
        fs.writeSync(fd, `${process.pid}\n`);
        fs.mkdirSync(work);
        recoverBuild(root, name, configuration);
        const generated = path.join(work, "generated"),
            report = generate(root, game, generated, log, checkpoint);
        const engine = safePath(root, "engine/caravan"),
            lcc = gbdkExecutable(root, "lcc");
        const relative = (p: string) =>
            path.relative(work, p).replaceAll("\\", "/");
        const inputs = ["runtime.c", "mainloop.c", "flow.c", "bg-bullets.c", "render.c", "music.c", "save.c"]
            .map((f) => path.join(engine, f))
            .concat(report.sourceFiles.map((f) => path.join(generated, f)));
        const args = [
            "-Wm-yc",
            "-Wf--opt-code-speed",
            "-Wf--max-allocs-per-node50000",
            "-Wl-yt0x1B",
            "-Wl-ya1",
            "-Wm-yoA",
            "-autobank",
            "-Wb-ext=.rel",
            "-Wl-j",
            "-Wl-w",
            `-I${relative(engine)}`,
            ...(configuration === "Debug" ? ["-debug"] : []),
            "-o",
            `${name}.gb`,
            ...inputs.map(relative),
        ];
        log(`[INFO] Building ${name} (${configuration})\n`);
        checkpoint();
        run(lcc, args, work, log);
        checkpoint();
        const romPath = path.join(work, `${name}.gb`),
            rom = fs.readFileSync(romPath);
        verifyRom(rom);
        // Battery-backed rankings require MBC5 + RAM even for a 32 KiB ROM.
        run(gbdkExecutable(root, "romusage"), [romPath], work, log);
        const mapText = fs.readFileSync(path.join(work, `${name}.map`), "utf8");
        // Release uses compact symbol columns. Area rows are stable in both modes.
        const areas = [
            ...mapText.matchAll(
                /^(_DATA|_INITIALIZED|_BSS)\s+[\da-fA-F]+\s+([\da-fA-F]+)\s*=/gm,
            ),
        ];
        if (!areas.some((m) => m[1] === "_DATA"))
            throw new Error("リンクマップからWRAM容量を取得できません");
        // Long debug symbol tables repeat area headers on subsequent map pages.
        const uniqueAreas = [...new Map(areas.map(m => [m[0].replace(/\s+/g, " "), m])).values()];
        const ram = uniqueAreas.reduce((n, m) => n + parseInt(m[2], 16), 0);
        if (ram + 160 > 7168)
            throw new Error(
                `WRAM予算超過: ${ram + 160} bytes / 7168（スタック用1024 bytesを確保）`,
            );
        log(
            `[INFO] WRAM static + shadow OAM: ${ram + 160} / 8192 bytes; stack reserve >= 1024 bytes\n`,
        );
        const out = safePath(dir, "build", configuration);
        fs.mkdirSync(out, { recursive: true });
        const outputs = new Map<string, Buffer>();
        for (const f of fs.readdirSync(work))
            if (
                f.startsWith(`${name}.`) &&
                fs.statSync(path.join(work, f)).isFile()
            )
                outputs.set(
                    path.join(out, f),
                    fs.readFileSync(path.join(work, f)),
                );
        const sourceOut = safePath(dir, "generated");
        fs.mkdirSync(sourceOut, { recursive: true });
        for (const f of fs.readdirSync(generated))
            atomicWrite(
                path.join(sourceOut, f),
                fs.readFileSync(path.join(generated, f)),
            );
        const finalPath = path.join(out, `${name}.gb`),
            size = rom.length;
        const result = {
            ok: true,
            revision: report.revision,
            configuration,
            romPath: finalPath,
            size,
            ramBytes: ram + 160,
            spriteTiles: report.spriteTiles,
            diagnostics: report.diagnostics,
            romHash: hash(rom),
            builtAt: new Date().toISOString(),
            durationMs: Date.now() - started,
        };
        outputs.set(
            path.join(out, "caravan-build.json"),
            Buffer.from(JSON.stringify(result, null, 2) + "\n"),
        );
        checkpoint();
        promoteBuild(root, name, configuration, outputs);
        log(`[OK] Build succeeded: ${finalPath} (${size} bytes)\n`);
        return result;
    } finally {
        try {
            fs.closeSync(fd);
        } finally {
            try {
                if (fs.existsSync(lockfile)) fs.unlinkSync(lockfile);
            } finally {
                fs.rmSync(work, { recursive: true, force: true });
            }
        }
    }
}
if (require.main === module) {
    const [root, name, config, expectedRevision, cancellationToken] =
        process.argv.slice(2);
    try {
        compile(path.resolve(root), name, config, console.log, {
            expectedRevision,
            cancellationToken,
        });
    } catch (error) {
        console.error("[FAIL]", (error as Error).message);
        process.exitCode = 1;
    }
}
