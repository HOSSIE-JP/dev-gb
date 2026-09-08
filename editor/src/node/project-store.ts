import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PNG } from "pngjs";
import {
    type Game,
    type Asset,
    type Frame,
    type ProjectInfo,
    validate,
} from "../shared/model";

export function safePath(root: string, ...parts: string[]) {
    root = path.resolve(root);
    const target = path.resolve(root, ...parts),
        relative = path.relative(root, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("リポジトリ外のパスです");
    let current = root;
    for (const part of relative.split(path.sep)) {
        current = path.join(current, part);
        if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
            throw new Error("シンボリックリンク／junctionは使用できません");
    }
    return target;
}
export function projectDir(root: string, name: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(name))
        throw new Error(
            "作品IDは英数字・ハイフン・アンダースコア（48文字以内）です",
        );
    return safePath(root, "projects", name);
}
export const hash = (data: string | Buffer) =>
    crypto.createHash("sha256").update(data).digest("hex");
export const revision = (game: Game) => hash(JSON.stringify(game));
export function encodePng(
    width: number,
    height: number,
    pixels: number[],
    transparent: boolean,
) {
    const png = new PNG({ width, height });
    for (let i = 0; i < pixels.length; i++) {
        const value = 255 - pixels[i] * 85;
        png.data[i * 4] = value;
        png.data[i * 4 + 1] = value;
        png.data[i * 4 + 2] = value;
        png.data[i * 4 + 3] = transparent && !pixels[i] ? 0 : 255;
    }
    return PNG.sync.write(png, { colorType: 6 });
}
export function decodeIndexedPng(
    bytes: Buffer,
    width: number,
    height: number,
): number[] {
    const p = PNG.sync.read(bytes);
    if (p.width !== width || p.height !== height)
        throw new Error(
            `画像サイズが一致しません: ${p.width}×${p.height} / ${width}×${height}`,
        );
    const pixels: number[] = [];
    for (let i = 0; i < p.width * p.height; i++) {
        const k = i * 4,
            r = p.data[k],
            alpha = p.data[k + 3];
        if (alpha === 0) {
            pixels.push(0);
            continue;
        }
        if (
            alpha !== 255 ||
            r !== p.data[k + 1] ||
            r !== p.data[k + 2] ||
            r % 85 !== 0
        )
            throw new Error(
                "元画像は4階調PNGです。カラー画像はエディタの「PNG取込」で減色してください",
            );
        pixels.push(3 - r / 85);
    }
    return pixels;
}
export function atomicWrite(target: string, data: string | Buffer) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temp, data);
        fs.renameSync(temp, target);
    } finally {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
}
export function rollbackInterruptedSave(root: string, name: string) {
    const dir = projectDir(root, name),
        journal = safePath(root, ".cache/editor/transactions", `${name}.json`);
    if (!fs.existsSync(journal)) return;
    const entries: [string, string | null][] = JSON.parse(
        fs.readFileSync(journal, "utf8"),
    );
    for (const [relative, old] of entries.reverse()) {
        if (
            !/^assets-src\/(game\.json|images\/[A-Za-z0-9._-]+\.png)$/.test(
                relative,
            )
        )
            throw new Error("保存復旧ジャーナルのパスが不正です");
        const target = safePath(dir, relative);
        if (old !== null) atomicWrite(target, Buffer.from(old, "base64"));
        else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.unlinkSync(journal);
}
export function readGame(root: string, name: string): Game {
    rollbackInterruptedSave(root, name);
    const dir = projectDir(root, name);
    const definition = JSON.parse(
        fs.readFileSync(safePath(dir, "project.json"), "utf8"),
    );
    if (
        definition.editor?.type !== "caravan" ||
        definition.editor.source !== "assets-src/game.json"
    )
        throw new Error("Caravan Editor形式の作品ではありません");
    const game: Game = JSON.parse(
        fs.readFileSync(safePath(dir, "assets-src/game.json"), "utf8"),
    );
    for (const actor of [...game.enemies, ...game.bosses]) actor.attacks ??= [];
    for (const boss of game.bosses)
        for (const phase of boss.phases) phase.attacks ??= [];
    for (const asset of game.assets)
        for (const frame of asset.frames) {
            if (!/^images\/[A-Za-z0-9._-]+\.png$/.test(frame.image))
                throw new Error("画像パスが不正です");
            const p = safePath(dir, "assets-src", frame.image);
            frame.pixels = decodeIndexedPng(
                fs.readFileSync(p),
                asset.width,
                asset.height,
            );
        }
    return game;
}
export function saveGame(root: string, name: string, game: Game) {
    rollbackInterruptedSave(root, name);
    const dir = projectDir(root, name),
        errors = validate(game).filter((d) => d.severity === "error");
    if (errors.length)
        throw new Error(
            errors
                .slice(0, 8)
                .map((d) => `${d.target}: ${d.message}`)
                .join("\n"),
        );
    const files = new Map<string, Buffer>();
    const clean: Game = structuredClone(game);
    clean.name = name;
    for (const a of clean.assets)
        for (const f of a.frames) {
            const target = safePath(dir, "assets-src", f.image);
            const bytes = encodePng(
                a.width,
                a.height,
                f.pixels,
                a.kind === "sprite",
            );
            if (files.has(target) && !files.get(target)!.equals(bytes))
                throw new Error("複数フレームが同じ画像パスを参照しています");
            files.set(target, bytes);
            delete (f as Partial<Frame>).pixels;
        }
    files.set(
        safePath(dir, "assets-src/game.json"),
        Buffer.from(JSON.stringify(clean, null, 2) + "\n"),
    );
    const backups = new Map<string, Buffer | null>();
    const written: string[] = [];
    for (const [target, bytes] of files) {
        const old = fs.existsSync(target) ? fs.readFileSync(target) : null;
        if (!old?.equals(bytes)) backups.set(target, old);
    }
    const journal = safePath(
        root,
        ".cache/editor/transactions",
        `${name}.json`,
    );
    if (backups.size)
        atomicWrite(
            journal,
            JSON.stringify(
                [...backups].map(([target, old]) => [
                    path.relative(dir, target).replaceAll("\\", "/"),
                    old?.toString("base64") ?? null,
                ]),
            ),
        );
    try {
        for (const [target, bytes] of files) {
            const old = fs.existsSync(target) ? fs.readFileSync(target) : null;
            if (old?.equals(bytes)) continue;
            backups.set(target, old);
            atomicWrite(target, bytes);
            written.push(target);
        }
    } catch (error) {
        for (const target of written.reverse()) {
            const backup = backups.get(target);
            if (backup) atomicWrite(target, backup);
            else if (fs.existsSync(target)) fs.unlinkSync(target);
        }
        if (fs.existsSync(journal)) fs.unlinkSync(journal);
        throw error;
    }
    if (fs.existsSync(journal)) fs.unlinkSync(journal);
    const recovery = safePath(root, ".cache/editor/recovery", `${name}.json`);
    if (fs.existsSync(recovery)) fs.unlinkSync(recovery);
    return revision(game);
}
export function recoverGame(root: string, name: string, game?: Game) {
    projectDir(root, name);
    const target = safePath(root, ".cache/editor/recovery", `${name}.json`);
    if (game) {
        atomicWrite(target, JSON.stringify(game));
        return null;
    }
    return fs.existsSync(target)
        ? (JSON.parse(fs.readFileSync(target, "utf8")) as Game)
        : null;
}
export function listProjects(root: string): ProjectInfo[] {
    const result: ProjectInfo[] = [];
    for (const entry of fs.readdirSync(safePath(root, "projects"), {
        withFileTypes: true,
    })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        try {
            const p = JSON.parse(
                fs.readFileSync(
                    safePath(root, "projects", entry.name, "project.json"),
                    "utf8",
                ),
            );
            if (p.editor?.type === "caravan")
                result.push({ name: p.name, title: p.title ?? p.name });
        } catch {
            /* An unrelated non-editor project can coexist. */
        }
    }
    return result;
}
export function createProject(
    root: string,
    name: string,
    title: string,
    game: Game,
) {
    const dir = projectDir(root, name);
    if (fs.existsSync(dir)) throw new Error("同じIDの作品がすでにあります");
    const copy = structuredClone(game);
    copy.name = name;
    copy.title = title;
    const t = copy.screens
        .find((s) => s.id === "title")
        ?.items.find((x) => x.id === "title-name");
    if (t) t.text = title.slice(0, 18);
    if (validate(copy).some((d) => d.severity === "error"))
        throw new Error(
            "作品設定にエラーがあります。作品名は英数字・かなで18文字以内にしてください",
        );
    fs.mkdirSync(dir);
    try {
        saveGame(root, name, copy);
        atomicWrite(
            safePath(dir, "project.json"),
            JSON.stringify(
                {
                    schemaVersion: 1,
                    name,
                    title,
                    target: "gb",
                    cgbCompatibility: "dual",
                    toolchain: "gbdk",
                    output: `${name}.gb`,
                    sources: ["generated/caravan_main.c"],
                    lccFlags: ["-Wm-yc"],
                    editor: { type: "caravan", source: "assets-src/game.json" },
                },
                null,
                2,
            ) + "\n",
        );
        atomicWrite(safePath(dir, "generated/.gitkeep"), "");
    } catch (error) {
        // Only this freshly created, validated project is rolled back.
        fs.rmSync(dir, { recursive: true, force: true });
        throw error;
    }
    return copy;
}
export function importPng(
    bytes: Buffer,
    asset: Asset,
    colors: string[],
    transparentColor = -1,
) {
    const png = PNG.sync.read(bytes);
    if (png.width > 1024 || png.height > 1024)
        throw new Error("PNGは1024×1024までです");
    const palette = colors.map((c) => [
        parseInt(c.slice(1, 3), 16),
        parseInt(c.slice(3, 5), 16),
        parseInt(c.slice(5, 7), 16),
    ]);
    const pixels = Array(asset.width * asset.height).fill(0);
    let reduced = 0;
    const unique = new Set<string>();
    for (let y = 0; y < asset.height; y++)
        for (let x = 0; x < asset.width; x++) {
            if (x >= png.width || y >= png.height) continue;
            const i = (y * png.width + x) * 4,
                rgba = [...png.data.subarray(i, i + 4)];
            unique.add(rgba.join(","));
            if (
                rgba[3] < 128 ||
                (transparentColor >= 0 &&
                    ((rgba[0] << 16) | (rgba[1] << 8) | rgba[2]) ===
                        transparentColor)
            )
                continue;
            const distances = palette.map((c) =>
                c.reduce((n, v, k) => n + (v - rgba[k]) ** 2, 0),
            );
            if (asset.kind === "sprite") distances[0] = Infinity;
            const color = distances.indexOf(Math.min(...distances));
            if (distances[color] !== 0) reduced++;
            pixels[y * asset.width + x] = color;
        }
    return {
        pixels,
        sourceWidth: png.width,
        sourceHeight: png.height,
        uniqueColors: unique.size,
        reduced,
        cropped: png.width > asset.width || png.height > asset.height,
    };
}
