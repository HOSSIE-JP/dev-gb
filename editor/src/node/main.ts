import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { type Game, type Asset, validate } from "../shared/model";
import {
    projectDir,
    safePath,
    readGame,
    saveGame,
    recoverGame,
    revision,
    listProjects,
    createProject,
    importPng,
    encodePng,
    atomicWrite,
} from "./project-store";
import { readFont } from "./compiler";
import {
    cancellationFile,
    readBuiltRom,
    toolchainStatus,
} from "./build-workflow";
const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    protocol,
    Menu,
} = require("electron");
const root = path.resolve(__dirname, "../..");
for (const name of ["userData", "sessionData", "crashDumps"]) {
    const dir = safePath(root, ".cache/editor", name);
    fs.mkdirSync(dir, { recursive: true });
    app.setPath(name, dir);
}
const temp = safePath(root, ".cache/editor/tmp");
fs.mkdirSync(temp, { recursive: true });
process.env.TEMP = process.env.TMP = temp;
app.commandLine.appendSwitch(
    "disk-cache-dir",
    safePath(root, ".cache/editor/chromium-cache"),
);
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => {
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});
protocol.registerSchemesAsPrivileged([
    {
        scheme: "caravan",
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
        },
    },
]);
let win: any,
    dirty = false,
    building = false;
let activeBuild: { token: string } | null = null;
let latestDraft: { name: string; game: Game } | null = null;
const openedRevisions = new Map<string, string>();
const log = (message: string) => {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed())
        win.webContents.send("ce:log", message);
};
const configName = (config: string) => {
    if (!["Debug", "Release"].includes(config))
        throw new Error("不正なビルド構成");
    return config;
};
const payload = (game: Game) => {
    if (JSON.stringify(game).length > 20 * 1024 * 1024)
        throw new Error("作品データが大きすぎます");
    return game;
};
const read = (name: string) => {
    const game = readGame(root, name);
    const warnings: string[] = [];
    const recovery = recoverGame(root, name, undefined, (message) =>
        warnings.push(message),
    );
    openedRevisions.set(name, revision(game));
    return {
        game,
        recovery,
        revision: revision(game),
        warnings,
    };
};
const save = (name: string, game: Game, expectedRevision?: string) => {
    const expected = expectedRevision ?? openedRevisions.get(name);
    if (!expected) throw new Error("作品を開いてから保存してください");
    const next = saveGame(root, name, payload(game), expected);
    openedRevisions.set(name, next);
    return next;
};
function handle(channel: string, fn: (...args: any[]) => unknown) {
    ipcMain.handle(`ce:${channel}`, (event: any, ...args: any[]) => {
        if (
            event.sender !== win.webContents ||
            event.senderFrame !== win.webContents.mainFrame ||
            !event.senderFrame.url.startsWith("caravan://app/")
        )
            throw new Error("IPCの送信元が不正です");
        return fn(...args);
    });
}
handle("init", () => {
    const projects = listProjects(root),
        name =
            process.argv.find((a) => projects.some((p) => p.name === a)) ??
            projects[0]?.name;
    if (!name) throw new Error("編集可能な作品がありません");
    const data = read(name);
    let glyphs = {};
    try {
        glyphs = readFont(root);
    } catch (error) {
        data.warnings.push(
            `日本語フォントを読み込めません。bootstrap.cmd でセットアップしてください: ${(error as Error).message}`,
        );
    }
    return { projects, name, ...data, glyphs };
});
handle("open", read);
handle("save", (name: string, game: Game, expectedRevision?: string) => {
    if (building)
        throw new Error("ビルドの保存処理中です。終了後に保存してください");
    return save(name, game, expectedRevision);
});
handle("recover", (name: string, game: Game) => {
    recoverGame(root, name, payload(game));
});
handle("create", (name: string, title: string, game: Game) => {
    const created = createProject(root, name, title, payload(game));
    openedRevisions.set(name, revision(created));
    return {
        game: created,
        projects: listProjects(root),
        revision: revision(created),
    };
});
handle(
    "import",
    async (asset: Asset, colors: string[], transparent: number) => {
        const result = await dialog.showOpenDialog(win, {
            title: "PNG画像を取り込む",
            properties: ["openFile"],
            filters: [{ name: "PNG", extensions: ["png"] }],
        });
        if (result.canceled) return null;
        const file = result.filePaths[0];
        if (fs.statSync(file).size > 16 * 1024 * 1024)
            throw new Error("PNGは16MiBまでです");
        return importPng(fs.readFileSync(file), asset, colors, transparent);
    },
);
handle("export", async (asset: Asset, frame: number) => {
    if (!asset.frames[frame]) throw new Error("フレームがありません");
    const result = await dialog.showSaveDialog(win, {
        title: "4階調PNGを書き出す",
        defaultPath: safePath(root, ".cache/editor", `${asset.id}.png`),
        filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (result.canceled) return false;
    // The user explicitly selects the export destination in a native Save dialog.
    atomicWrite(
        result.filePath,
        encodePng(
            asset.width,
            asset.height,
            asset.frames[frame].pixels,
            asset.kind === "sprite",
        ),
    );
    return true;
});
handle("toolchain", () => toolchainStatus(root));
handle("cancel-build", () => {
    if (!activeBuild) return false;
    atomicWrite(cancellationFile(root, activeBuild.token), "cancel\n");
    log(
        "[INFO] 中止を要求しました。実行中の変換・コンパイル処理が終了するまでお待ちください。\n",
    );
    return true;
});
handle(
    "build",
    async (
        name: string,
        game: Game,
        config: string,
        expectedRevision?: string,
    ) => {
        configName(config);
        if (building) throw new Error("ビルド中です");
        payload(game);
        const diagnostics = validate(game);
        if (diagnostics.some((d) => d.severity === "error"))
            return {
                ok: false,
                revision: revision(game),
                configuration: config,
                error: "作品定義にエラーがあります",
                diagnostics,
            };
        building = true;
        activeBuild = { token: crypto.randomUUID() };
        const cancelPath = cancellationFile(root, activeBuild.token);
        const rev = revision(game);
        try {
            const status = toolchainStatus(root);
            if (!status.ready)
                throw new Error(
                    `${status.hint}\n${status.tools
                        .filter((t) => t.required && !t.installed)
                        .map((t) => `${t.label}: ${t.path}`)
                        .join("\n")}`,
                );
            save(name, game, expectedRevision);
            // The compiler reads synchronously at startup. UI edits stay in memory and do
            // not mutate this on-disk snapshot until the build finishes.
            let output = "";
            const code = await new Promise<number>((resolve, reject) => {
                const child = spawn(
                    process.platform === "win32"
                        ? safePath(root, ".tools/node/node.exe")
                        : process.execPath,
                    [
                        path.join(__dirname, "compiler.cjs"),
                        root,
                        name,
                        config,
                        rev,
                        activeBuild!.token,
                    ],
                    {
                        cwd: root,
                        windowsHide: true,
                        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
                    },
                );
                const receive = (b: Buffer) => {
                    const text = String(b);
                    output = (output + text).slice(-8000);
                    log(text);
                };
                child.stdout.on("data", receive);
                child.stderr.on("data", receive);
                child.on("error", reject);
                child.on("close", (code) => resolve(code ?? 1));
            });
            if (code)
                return {
                    ok: false,
                    revision: rev,
                    configuration: config,
                    error: fs.existsSync(cancelPath)
                        ? "ビルドを中止しました。最後の正常なROMは保持されています。"
                        : `ビルドに失敗しました (${code})。最後の正常なROMは保持されています。\n${output.trim()}`,
                };
            return readBuiltRom(root, name, config, rev).result;
        } finally {
            if (fs.existsSync(cancelPath)) fs.unlinkSync(cancelPath);
            activeBuild = null;
            building = false;
        }
    },
);
handle(
    "rom",
    (name: string, config: string, expectedRevision?: string) =>
        new Uint8Array(
            readBuiltRom(root, name, config, expectedRevision).bytes,
        ),
);
handle(
    "export-rom",
    async (name: string, config: string, expectedRevision?: string) => {
        const artifact = readBuiltRom(root, name, config, expectedRevision);
        const result = await dialog.showSaveDialog(win, {
            title: "検証済みROMを書き出す",
            defaultPath: safePath(
                root,
                ".cache/editor",
                `${name}-${config}.gb`,
            ),
            filters: [{ name: "Game Boy ROM", extensions: ["gb"] }],
        });
        if (result.canceled || !result.filePath) return false;
        atomicWrite(result.filePath, artifact.bytes);
        return true;
    },
);
handle(
    "external",
    async (
        name: string,
        config: string,
        emulator: string,
        expectedRevision?: string,
    ) => {
        configName(config);
        projectDir(root, name);
        if (!["bgb", "emulicious"].includes(emulator))
            throw new Error("エミュレータが不正です");
        const artifact = readBuiltRom(root, name, config, expectedRevision);
        if (process.platform !== "win32")
            throw new Error("外部エミュレータの起動はWindowsで利用できます");
        const executable = safePath(
            root,
            ".tools",
            emulator,
            emulator === "bgb" ? "bgb64.exe" : "Emulicious.exe",
        );
        if (!fs.existsSync(executable))
            throw new Error(
                `${emulator} がありません。setup.cmd で ${emulator} を選択するか、bootstrap.cmd -OptionalTools ${emulator} を実行してください`,
            );
        const cwd = safePath(root, ".cache/emulator", emulator);
        fs.mkdirSync(cwd, { recursive: true });
        const child = spawn(
            executable,
            [
                ...(emulator === "bgb"
                    ? ["-ini", safePath(cwd, "bgb.ini")]
                    : []),
                artifact.result.romPath!,
            ],
            { cwd, windowsHide: true, stdio: "ignore" },
        );
        await new Promise<void>((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", reject);
        });
        child.unref();
    },
);
ipcMain.on(
    "ce:dirty",
    (event: any, value: boolean, name?: string, game?: Game) => {
        if (
            event.sender !== win.webContents ||
            event.senderFrame !== win.webContents.mainFrame ||
            !event.senderFrame.url.startsWith("caravan://app/")
        )
            return;
        dirty = value === true;
        if (!dirty) latestDraft = null;
        else if (name && game) {
            try {
                projectDir(root, name);
                if (game.name !== name)
                    throw new Error("復旧コピーの作品IDが一致しません");
                latestDraft = { name, game: payload(game) };
            } catch (error) {
                log(`[FAIL] ${(error as Error).message}\n`);
            }
        }
    },
);
app.whenReady().then(() => {
    protocol.handle("caravan", (request: Request) => {
        const url = new URL(request.url),
            file = url.pathname.slice(1) || "index.html";
        if (
            url.hostname !== "app" ||
            ![
                "index.html",
                "renderer.js",
                "renderer.css",
                "boytacean_bg.wasm",
            ].includes(file)
        )
            return new Response("Not found", { status: 404 });
        const mime = file.endsWith(".wasm")
            ? "application/wasm"
            : file.endsWith(".js")
              ? "text/javascript"
              : file.endsWith(".css")
                ? "text/css"
                : "text/html";
        return new Response(fs.readFileSync(path.join(__dirname, file)), {
            headers: {
                "Content-Type": mime,
                "Content-Security-Policy":
                    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'",
            },
        });
    });
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
        width: 1540,
        height: 980,
        minWidth: 1150,
        minHeight: 760,
        backgroundColor: "#10161e",
        title: "Caravan Editor",
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: false,
        },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e: any) => e.preventDefault());
    win.on("close", (event: any) => {
        if (
            (dirty || building) &&
            dialog.showMessageBoxSync(win, {
                type: "warning",
                buttons: ["編集を続ける", "閉じる"],
                defaultId: 0,
                cancelId: 0,
                message: building
                    ? "ビルド中です。終了してよいですか？"
                    : "未保存の変更があります。自動復旧コピーを残して終了しますか？",
            }) === 0
        ) {
            event.preventDefault();
            return;
        }
        if (dirty && latestDraft) {
            try {
                recoverGame(root, latestDraft.name, latestDraft.game);
            } catch (error) {
                event.preventDefault();
                dialog.showMessageBoxSync(win, {
                    type: "error",
                    buttons: ["編集に戻る"],
                    message:
                        "復旧コピーを保存できないため終了を中止しました。作品を保存してから閉じてください。",
                    detail: (error as Error).message,
                });
            }
        }
    });
    win.loadURL("caravan://app/index.html");
});
app.on("window-all-closed", () => app.quit());
