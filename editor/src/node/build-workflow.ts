import fs from "node:fs";
import path from "node:path";
import type { BuildResult } from "../shared/model";
import type { ToolchainStatus } from "../shared/bridge";
import { atomicWrite, hash, projectDir, safePath } from "./project-store";

export function gbdkExecutable(
    root: string,
    name: "lcc" | "png2asset" | "romusage",
) {
    return safePath(
        root,
        ".tools/gbdk/bin",
        name + (process.platform === "win32" ? ".exe" : ""),
    );
}

export function toolchainStatus(root: string): ToolchainStatus {
    const lock = JSON.parse(
        fs.readFileSync(safePath(root, "config/tools.lock.json"), "utf8"),
    );
    const definitions: [string, string, string, boolean][] = [
        ...(process.platform === "win32"
            ? [
                  [
                      "node",
                      "Node.js",
                      safePath(root, ".tools/node/node.exe"),
                      true,
                  ] as [string, string, string, boolean],
              ]
            : []),
        ["gbdk", "GBDK Cコンパイラ", gbdkExecutable(root, "lcc"), true],
        ["gbdk", "PNG変換", gbdkExecutable(root, "png2asset"), true],
        ["gbdk", "ROM容量検査", gbdkExecutable(root, "romusage"), true],
        [
            "misaki",
            "日本語フォント",
            safePath(root, ".tools/misaki/misaki_gothic.bdf"),
            true,
        ],
        ["bgb", "BGB", safePath(root, ".tools/bgb/bgb64.exe"), false],
        [
            "emulicious",
            "Emulicious",
            safePath(root, ".tools/emulicious/Emulicious.exe"),
            false,
        ],
    ];
    const tools = definitions.map(([id, label, file, required]) => ({
        id,
        label,
        path: file,
        required,
        version: String(lock.tools?.[id]?.version ?? "unknown"),
        installed: fs.existsSync(file) && fs.statSync(file).isFile(),
    }));
    const ready = tools.every((tool) => !tool.required || tool.installed);
    return {
        ready,
        tools,
        hint: ready
            ? "ビルドに必要なツールを確認しました"
            : "不足しているツールは bootstrap.cmd でセットアップしてください",
    };
}

function buildDirectory(root: string, name: string, config: string) {
    if (!["Debug", "Release"].includes(config))
        throw new Error("不正なビルド構成です");
    return safePath(projectDir(root, name), "build", config);
}

type BuildJournal = { version: 1; files: [string, string | null][] };

// The journal survives a process crash during multi-file ROM/symbol promotion.
// Only the build directory's ordinary output files may be restored.
export function recoverBuild(root: string, name: string, config: string) {
    const out = buildDirectory(root, name, config);
    const journal = safePath(out, "promotion.json");
    if (!fs.existsSync(journal)) return;
    const data: BuildJournal = JSON.parse(fs.readFileSync(journal, "utf8"));
    if (data.version !== 1 || !Array.isArray(data.files))
        throw new Error("ビルド復旧記録が不正です");
    const seen = new Set<string>();
    for (const entry of data.files) {
        if (
            !Array.isArray(entry) ||
            entry.length !== 2 ||
            typeof entry[0] !== "string" ||
            !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(entry[0]) ||
            entry[0] === "promotion.json" ||
            seen.has(entry[0]) ||
            (entry[1] !== null &&
                (typeof entry[1] !== "string" ||
                    Buffer.from(entry[1], "base64").toString("base64") !==
                        entry[1]))
        )
            throw new Error("ビルド復旧記録のファイルが不正です");
        safePath(out, entry[0]);
        seen.add(entry[0]);
    }
    for (const [file, old] of [...data.files].reverse()) {
        const target = safePath(out, file);
        if (old !== null) atomicWrite(target, Buffer.from(old, "base64"));
        else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.unlinkSync(journal);
}

export function promoteBuild(
    root: string,
    name: string,
    config: string,
    outputs: Map<string, Buffer>,
) {
    const out = buildDirectory(root, name, config);
    recoverBuild(root, name, config);
    const entries: BuildJournal["files"] = [];
    for (const [file] of outputs) {
        if (
            path.dirname(file) !== out ||
            !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(path.basename(file)) ||
            path.basename(file) === "promotion.json"
        )
            throw new Error("ビルド出力先が不正です");
        safePath(out, path.basename(file));
        entries.push([
            path.basename(file),
            fs.existsSync(file)
                ? fs.readFileSync(file).toString("base64")
                : null,
        ]);
    }
    const journal = safePath(out, "promotion.json");
    atomicWrite(journal, JSON.stringify({ version: 1, files: entries }));
    try {
        for (const [file, bytes] of outputs) atomicWrite(file, bytes);
        fs.unlinkSync(journal);
    } catch (error) {
        recoverBuild(root, name, config);
        throw error;
    }
}

export function readBuiltRom(
    root: string,
    name: string,
    config: string,
    expectedRevision?: string,
) {
    const out = buildDirectory(root, name, config);
    // A concurrent compiler owns promotion. Never expose partially promoted files.
    if (fs.existsSync(safePath(out, "promotion.json")))
        throw new Error(
            "ROMの更新が完了していません。ビルドを再実行してください",
        );
    const manifest = safePath(out, "caravan-build.json");
    if (!fs.existsSync(manifest))
        throw new Error("確認済みのROMがありません。先にビルドしてください");
    const result: BuildResult = JSON.parse(fs.readFileSync(manifest, "utf8"));
    if (
        !result.ok ||
        result.configuration !== config ||
        typeof result.revision !== "string" ||
        (expectedRevision !== undefined && result.revision !== expectedRevision)
    )
        throw new Error(
            "ROMが選択したビルドと一致しません。再ビルドしてください",
        );
    if (!result.romHash)
        throw new Error(
            "旧形式のビルドです。再ビルドしてROMの整合性を確認してください",
        );
    const file = safePath(out, `${name}.gb`),
        bytes = fs.readFileSync(file);
    if (bytes.length !== result.size || hash(bytes) !== result.romHash)
        throw new Error("ROMの整合性検査に失敗しました。再ビルドしてください");
    return { result: { ...result, romPath: file }, bytes };
}

export function cancellationFile(root: string, token: string) {
    if (!/^[0-9a-f-]{36}$/.test(token)) throw new Error("不正なビルドIDです");
    return safePath(root, ".cache/editor/cancel", `${token}.cancel`);
}
