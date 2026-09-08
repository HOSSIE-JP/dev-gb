import fs from "node:fs";
import path from "node:path";
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
    return {
        game,
        recovery: recoverGame(root, name),
        revision: revision(game),
    };
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
    return { projects, name, ...read(name), glyphs: readFont(root) };
});
handle("open", read);
handle("save", (name: string, game: Game) => {
    if (building)
        throw new Error("ビルドの保存処理中です。終了後に保存してください");
    return saveGame(root, name, payload(game));
});
handle("recover", (name: string, game: Game) => {
    recoverGame(root, name, payload(game));
});
handle("create", (name: string, title: string, game: Game) => {
    const created = createProject(root, name, title, payload(game));
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
handle("build", async (name: string, game: Game, config: string) => {
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
    const rev = revision(game);
    try {
        saveGame(root, name, game);
        // The compiler reads synchronously at startup. UI edits stay in memory and do
        // not mutate this on-disk snapshot until the build finishes.
        const code = await new Promise<number>((resolve, reject) => {
            const child = spawn(
                safePath(root, ".tools/node/node.exe"),
                [path.join(__dirname, "compiler.cjs"), root, name, config],
                { cwd: root, windowsHide: true },
            );
            child.stdout.on("data", (b) =>
                win?.webContents.send("ce:log", String(b)),
            );
            child.stderr.on("data", (b) =>
                win?.webContents.send("ce:log", String(b)),
            );
            child.on("error", reject);
            child.on("close", (code) => resolve(code ?? 1));
        });
        if (code)
            return {
                ok: false,
                revision: rev,
                configuration: config,
                error: `ビルドに失敗しました (${code})。最後の正常なROMは保持されています。`,
            };
        return JSON.parse(
            fs.readFileSync(
                safePath(
                    projectDir(root, name),
                    "build",
                    config,
                    "caravan-build.json",
                ),
                "utf8",
            ),
        );
    } finally {
        building = false;
    }
});
handle(
    "rom",
    (name: string, config: string) =>
        new Uint8Array(
            fs.readFileSync(
                safePath(
                    projectDir(root, name),
                    "build",
                    configName(config),
                    `${name}.gb`,
                ),
            ),
        ),
);
handle("external", (name: string, config: string, emulator: string) => {
    configName(config);
    projectDir(root, name);
    if (!["bgb", "emulicious"].includes(emulator))
        throw new Error("エミュレータが不正です");
    const child = spawn(
        "powershell.exe",
        [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            safePath(root, "scripts/run.ps1"),
            name,
            "-Configuration",
            config,
            "-Emulator",
            emulator,
        ],
        { cwd: root, windowsHide: true, stdio: "ignore" },
    );
    child.on("error", (error: Error) =>
        win?.webContents.send("ce:log", error.message),
    );
});
ipcMain.on("ce:dirty", (event: any, value: boolean) => {
    if (event.sender === win.webContents) dirty = value === true;
});
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
        )
            event.preventDefault();
    });
    win.loadURL("caravan://app/index.html");
});
app.on("window-all-closed", () => app.quit());
