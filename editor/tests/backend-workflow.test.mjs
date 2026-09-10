import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { EventEmitter } from "node:events";

const require = createRequire(import.meta.url),
    lib = require("../build/library.cjs");
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
);

async function fixture(run) {
    fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
    const temp = fs.mkdtempSync(path.join(root, ".cache/backend-workflow-"));
    fs.mkdirSync(path.join(temp, "projects"));
    try {
        const game = lib.createProject(
            temp,
            "fixture",
            "FIXTURE",
            lib.readGame(root, "star-caravan"),
        );
        return await run(temp, game);
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

async function desktop(temp, options = {}) {
    const handlers = new Map(),
        events = new EventEmitter(),
        dialogs = [];
    let window;
    class MockWindow extends EventEmitter {
        constructor() {
            super();
            window = this;
            this.webContents = Object.assign(new EventEmitter(), {
                mainFrame: { url: "caravan://app/index.html" },
                setWindowOpenHandler() {},
                send() {},
                isDestroyed() {
                    return false;
                },
            });
        }
        loadURL() {}
        isDestroyed() {
            return false;
        }
    }
    const electron = {
        app: {
            setPath() {},
            setAppUserModelId() {},
            commandLine: { appendSwitch() {} },
            requestSingleInstanceLock: () => true,
            on() {},
            whenReady: () => Promise.resolve(),
            quit() {},
            exit() {},
        },
        BrowserWindow: MockWindow,
        ipcMain: {
            handle: (name, fn) => handlers.set(name, fn),
            on: events.on.bind(events),
        },
        protocol: { registerSchemesAsPrivileged() {}, handle() {} },
        Menu: { buildFromTemplate: (items) => items, setApplicationMenu() {} },
        dialog: {
            showOpenDialog: async () => options.selection ?? { canceled: true, filePaths: [] },
            showMessageBox: async () => ({ response: options.response ?? 0 }),
            showMessageBoxSync: (_window, options) => {
                dialogs.push(options);
                return 1;
            },
        },
        shell: { openPath: async (folder) => {
            options.opened?.push(folder);
            return options.shellError ?? "";
        } },
    };
    const context = {
        require: (name) => (name === "electron" ? electron : require(name)),
        module: { exports: {} },
        __dirname: path.join(temp, "editor/build"),
        process: { ...process, env: { ...process.env }, argv: [] },
        Buffer,
        console,
        structuredClone,
        URL,
        Response,
    };
    vm.runInNewContext(
        fs.readFileSync(path.join(root, "editor/build/main.cjs"), "utf8"),
        context,
    );
    await new Promise(setImmediate);
    const sender = {
        sender: window.webContents,
        senderFrame: window.webContents.mainFrame,
    };
    return {
        window,
        dialogs,
        events,
        sender,
        invoke: (name, ...args) => handlers.get(`ce:${name}`)(sender, ...args),
    };
}

test("project navigation supports late additions, cancellation, safe folders and shell errors", () =>
    fixture(async (temp, game) => {
        const options = { opened: [] };
        const app = await desktop(temp, options);
        assert.equal(await app.invoke("choose-project"), null);
        lib.createProject(temp, "added", "ADDED", game);
        options.selection = { canceled: false, filePaths: [path.join(temp, "projects/added")] };
        const selected = await app.invoke("choose-project");
        assert.equal(selected.name, "added");
        assert.ok(selected.projects.some(p => p.name === "added"));
        assert.equal((await app.invoke("open", selected.name)).game.name, "added");
        options.selection.filePaths = [path.join(temp, "elsewhere/added")];
        await assert.rejects(app.invoke("choose-project"), /projects/);
        await app.invoke("show-project-folder", "fixture");
        assert.deepEqual(options.opened, [path.join(temp, "projects/fixture")]);
        await assert.rejects(app.invoke("show-project-folder", "../outside"));
        options.shellError = "Explorer failed";
        await assert.rejects(app.invoke("show-project-folder", "fixture"), /Explorer failed/);
        assert.equal(await app.invoke("confirm", "Continue?"), false);
        options.response = 1;
        assert.equal(await app.invoke("confirm", "Continue?"), true);
    }));

function artifact(temp, revision = "snapshot-a", fill = 1) {
    const out = path.join(temp, "projects/fixture/build/Debug");
    const rom = Buffer.alloc(32768, fill);
    const result = {
        ok: true,
        configuration: "Debug",
        revision,
        size: rom.length,
        romHash: lib.hash(rom),
    };
    const outputs = new Map([
        [path.join(out, "fixture.gb"), rom],
        [path.join(out, "fixture.map"), Buffer.from(`map for ${revision}`)],
        [
            path.join(out, "caravan-build.json"),
            Buffer.from(JSON.stringify(result)),
        ],
    ]);
    return { out, outputs, rom, result };
}

test("save detects external PNG changes and keeps both disk and recovery drafts", () =>
    fixture((temp, game) => {
        const opened = lib.revision(game),
            draft = structuredClone(game);
        draft.player.speed = 2;
        lib.recoverGame(temp, "fixture", draft);
        const external = structuredClone(game);
        external.assets[0].frames[0].pixels[0] =
            (external.assets[0].frames[0].pixels[0] + 1) % 4;
        lib.saveGame(temp, "fixture", external);
        // Autosave continues after an external editor updated a PNG.
        lib.recoverGame(temp, "fixture", draft);
        assert.throws(
            () => lib.saveGame(temp, "fixture", draft, opened),
            /外部で変更/,
        );
        assert.deepEqual(lib.readGame(temp, "fixture"), external);
        assert.deepEqual(lib.recoverGame(temp, "fixture"), draft);
        const current = lib.revision(external);
        assert.equal(
            lib.saveGame(temp, "fixture", draft, current),
            lib.revision(draft),
        );
        assert.deepEqual(lib.readGame(temp, "fixture"), draft);
        assert.equal(lib.recoverGame(temp, "fixture"), null);
    }));

test("recovery checksums quarantine corruption without blocking the saved project", () =>
    fixture((temp, game) => {
        lib.recoverGame(temp, "fixture", game);
        const file = path.join(temp, ".cache/editor/recovery/fixture.json");
        const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
        envelope.game.title = "TAMPERED";
        fs.writeFileSync(file, JSON.stringify(envelope));
        const warnings = [];
        assert.equal(
            lib.recoverGame(temp, "fixture", undefined, (message) =>
                warnings.push(message),
            ),
            null,
        );
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], /チェックサム/);
        assert.equal(fs.existsSync(file), false);
        assert.equal(
            fs
                .readdirSync(path.dirname(file))
                .filter((name) => name.endsWith(".corrupt")).length,
            1,
        );
        assert.deepEqual(lib.readGame(temp, "fixture"), game);
        // Existing unwrapped recovery files remain readable, including unfinished references.
        const draft = structuredClone(game);
        draft.player.asset = "unfinished-asset";
        fs.writeFileSync(file, JSON.stringify(draft));
        assert.deepEqual(lib.recoverGame(temp, "fixture"), draft);
    }));

test("a malformed later save-journal entry cannot partially roll back source files", () =>
    fixture((temp, game) => {
        const file = path.join(
            temp,
            "projects/fixture/assets-src",
            game.assets[0].frames[0].image,
        );
        const before = fs.readFileSync(file);
        lib.atomicWrite(
            path.join(temp, ".cache/editor/transactions/fixture.json"),
            JSON.stringify([
                [
                    "assets-src/" + game.assets[0].frames[0].image,
                    Buffer.from("wrong backup").toString("base64"),
                ],
                ["../outside", null],
            ]),
        );
        assert.throws(
            () => lib.rollbackInterruptedSave(temp, "fixture"),
            /不正/,
        );
        assert.deepEqual(fs.readFileSync(file), before);
    }));

test("ROM reads reject stale revisions, damaged bytes and an interrupted promotion", () =>
    fixture((temp) => {
        const build = artifact(temp);
        lib.promoteBuild(temp, "fixture", "Debug", build.outputs);
        assert.deepEqual(
            lib.readBuiltRom(temp, "fixture", "Debug", "snapshot-a").bytes,
            build.rom,
        );
        assert.throws(
            () => lib.readBuiltRom(temp, "fixture", "Debug", "snapshot-b"),
            /一致しません/,
        );
        const romFile = path.join(build.out, "fixture.gb");
        fs.writeFileSync(romFile, Buffer.alloc(32768, 2));
        assert.throws(
            () => lib.readBuiltRom(temp, "fixture", "Debug"),
            /整合性/,
        );
        lib.atomicWrite(
            path.join(build.out, "promotion.json"),
            JSON.stringify({
                version: 1,
                files: [
                    ["fixture.gb", build.rom.toString("base64")],
                    [
                        "fixture.map",
                        Buffer.from("original symbols").toString("base64"),
                    ],
                    ["new-file.rel", null],
                ],
            }),
        );
        fs.writeFileSync(
            path.join(build.out, "new-file.rel"),
            "partial output",
        );
        assert.throws(
            () => lib.readBuiltRom(temp, "fixture", "Debug"),
            /更新が完了/,
        );
        lib.recoverBuild(temp, "fixture", "Debug");
        assert.deepEqual(
            lib.readBuiltRom(temp, "fixture", "Debug").bytes,
            build.rom,
        );
        assert.equal(
            fs.readFileSync(path.join(build.out, "fixture.map"), "utf8"),
            "original symbols",
        );
        assert.equal(
            fs.existsSync(path.join(build.out, "new-file.rel")),
            false,
        );
    }));

test("failed ROM promotion restores ROM, symbols and manifest as one revision", () =>
    fixture((temp) => {
        const baseline = artifact(temp);
        lib.promoteBuild(temp, "fixture", "Debug", baseline.outputs);
        const next = artifact(temp, "snapshot-b", 2),
            original = fs.renameSync;
        let injected = false;
        fs.renameSync = (source, target) => {
            if (
                !injected &&
                target === path.join(next.out, "caravan-build.json")
            ) {
                injected = true;
                throw new Error("simulated disk failure");
            }
            return original(source, target);
        };
        try {
            assert.throws(
                () => lib.promoteBuild(temp, "fixture", "Debug", next.outputs),
                /disk failure/,
            );
        } finally {
            fs.renameSync = original;
        }
        assert.ok(injected);
        for (const [file, bytes] of baseline.outputs)
            assert.deepEqual(fs.readFileSync(file), bytes);
        assert.equal(
            fs.existsSync(path.join(next.out, "promotion.json")),
            false,
        );
        assert.equal(
            lib.readBuiltRom(temp, "fixture", "Debug").result.revision,
            "snapshot-a",
        );
    }));

test("compiler rejects an obsolete snapshot or cancellation before invoking any tool", () =>
    fixture((temp) => {
        assert.throws(
            () =>
                lib.compile(temp, "fixture", "Debug", () => {}, {
                    expectedRevision: "obsolete",
                }),
            /開始前に作品が変更/,
        );
        const cancellationToken = "12345678-1234-1234-1234-123456789abc";
        lib.atomicWrite(
            lib.cancellationFile(temp, cancellationToken),
            "cancel",
        );
        assert.throws(
            () =>
                lib.compile(temp, "fixture", "Debug", () => {}, {
                    cancellationToken,
                }),
            /中止しました/,
        );
        assert.equal(
            fs.existsSync(
                path.join(temp, "projects/fixture/build/.caravan-build.lock"),
            ),
            false,
        );
    }));

test("revision is stable across optional attack migration, object-key order and save/reload", () =>
    fixture((temp, game) => {
        const legacy = structuredClone(game);
        for (const actor of [...legacy.enemies, ...legacy.bosses])
            delete actor.attacks;
        for (const boss of legacy.bosses)
            for (const phase of boss.phases) delete phase.attacks;
        const reverse = (value) =>
            Array.isArray(value)
                ? value.map(reverse)
                : value && typeof value === "object"
                  ? Object.fromEntries(
                        Object.entries(value)
                            .reverse()
                            .map(([key, child]) => [key, reverse(child)]),
                    )
                  : value;
        const reordered = reverse(legacy);
        assert.equal(lib.revision(reordered), lib.revision(legacy));
        const saved = lib.saveGame(temp, "fixture", reordered);
        assert.equal(lib.revision(lib.readGame(temp, "fixture")), saved);
        reordered.title = "SECOND SAVE";
        assert.doesNotThrow(() =>
            lib.saveGame(temp, "fixture", reordered, saved),
        );
    }));

test("failure creating compiler work directory releases the process lock", () =>
    fixture((temp) => {
        const original = fs.mkdirSync;
        fs.mkdirSync = (file, options) => {
            if (String(file).includes(`${path.sep}work-`))
                throw new Error("simulated full disk");
            return original(file, options);
        };
        try {
            assert.throws(
                () => lib.compile(temp, "fixture", "Debug", () => {}),
                /full disk/,
            );
        } finally {
            fs.mkdirSync = original;
        }
        assert.equal(
            fs.existsSync(
                path.join(temp, "projects/fixture/build/.caravan-build.lock"),
            ),
            false,
        );
    }));

test("toolchain diagnosis identifies missing required components using pinned versions", () =>
    fixture((temp) => {
        lib.atomicWrite(
            path.join(temp, "config/tools.lock.json"),
            fs.readFileSync(path.join(root, "config/tools.lock.json")),
        );
        const missing = lib.toolchainStatus(temp);
        assert.equal(missing.ready, false);
        assert.equal(
            missing.tools.filter((tool) => tool.required && !tool.installed)
                .length,
            process.platform === "win32" ? 5 : 4,
        );
        assert.match(missing.hint, /セットアップ/);
        for (const tool of missing.tools.filter((tool) => tool.required))
            lib.atomicWrite(tool.path, "fixture");
        const present = lib.toolchainStatus(temp);
        assert.equal(present.ready, true);
        assert.equal(
            present.tools.find((tool) => tool.id === "gbdk").version,
            "4.5.0",
        );
        assert.equal(
            present.tools.find((tool) => tool.id === "bgb").installed,
            false,
        );
    }));

test("desktop opens without font tools and protects external edits through IPC session revisions", () =>
    fixture(async (temp, game) => {
        const app = await desktop(temp);
        const initial = app.invoke("init");
        assert.equal(Object.keys(initial.glyphs).length, 0);
        assert.ok(
            initial.warnings.some((message) =>
                message.includes("セットアップ"),
            ),
        );
        const external = structuredClone(game);
        external.title = "EXTERNAL";
        lib.saveGame(temp, "fixture", external);
        assert.throws(() => app.invoke("save", "fixture", game), /外部で変更/);
        assert.equal(lib.readGame(temp, "fixture").title, "EXTERNAL");
        assert.equal(app.invoke("cancel-build"), false);
    }));

test("immediate desktop close flushes the latest draft and refuses to close if that write fails", () =>
    fixture(async (temp, game) => {
        const app = await desktop(temp),
            draft = structuredClone(game);
        draft.title = "LAST EDIT";
        app.events.emit("ce:dirty", app.sender, true, "fixture", draft);
        let prevented = false;
        app.window.emit("close", {
            preventDefault() {
                prevented = true;
            },
        });
        assert.equal(prevented, false);
        assert.deepEqual(lib.recoverGame(temp, "fixture"), draft);
        const original = fs.renameSync;
        fs.renameSync = (source, target) => {
            if (String(target).includes(`${path.sep}recovery${path.sep}`))
                throw new Error("simulated read-only disk");
            return original(source, target);
        };
        try {
            app.window.emit("close", {
                preventDefault() {
                    prevented = true;
                },
            });
        } finally {
            fs.renameSync = original;
        }
        assert.equal(prevented, true);
        assert.equal(app.dialogs.at(-1).type, "error");
        assert.match(app.dialogs.at(-1).message, /終了を中止/);
    }));
