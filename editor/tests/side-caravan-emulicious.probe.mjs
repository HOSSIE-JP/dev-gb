// Native Emulicious: start an unchanged ROM directly, then attach using DAP.
// The official extension's attach transport and bundled Expressions.txt are used.
// No writes to ROM/RAM or .tools; all emulator settings live in an isolated copy.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
const root = path.resolve(import.meta.dirname, "../.."),
    file = path.resolve(
        process.argv[2] ??
            path.join(
                root,
                "projects/side-caravan/build/Debug/side-caravan.gb",
            ),
    );
const out = path.resolve(
    process.argv[3] ?? path.join(root, ".cache/side-native/emulicious"),
);
fs.mkdirSync(out, { recursive: true });
const run = fs.mkdtempSync(path.join(out, "direct-")),
    runtime = path.join(root, ".tools/emulicious");
for (const name of [
    "Emulicious.jar",
    "lib",
    "Highlighters",
    "KeyPresets",
    "GameBoy.ports",
    "GameBoyColor.ports",
])
    fs.cpSync(path.join(runtime, name), path.join(run, name), {
        recursive: true,
    });
const rom = fs.readFileSync(file),
    romPath = path.join(run, "side-caravan.gb");
fs.writeFileSync(romPath, rom);
const map = fs.readFileSync(file.replace(/\.gb$/, ".map"), "utf8"),
    symbols = Object.fromEntries(
        [...map.matchAll(/\b([\da-fA-F]{8})\s+(_ce_\w+|_sys_time)\b/g)].map(
            (m) => [m[2], parseInt(m[1], 16)],
        ),
    );
const server = net.createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
await new Promise((r) => server.close(r));
const log = {
    rom: file,
    sha256: crypto.createHash("sha256").update(rom).digest("hex"),
    emulator: "Emulicious 2026-03-27",
    method: "Unchanged isolated ROM CLI startup; DAP attach, numeric-address reads only",
    run,
    steps: [],
    stderr: "",
    bootExecutionVerified: false,
    gameplayVerified: false,
};
const save = () =>
    fs.writeFileSync(
        path.join(out, "results.json"),
        JSON.stringify(log, null, 2),
    );
const args = [
    "-Duser.home=" + run,
    "-Dsun.java2d.d3d=false",
    "-jar",
    path.join(run, "Emulicious.jar"),
    "-remotedebug",
    String(port),
    "-muted",
    romPath,
];
log.command = { executable: path.join(runtime, "java/bin/java.exe"), args };
const proc = spawn(log.command.executable, args, {
    cwd: run,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
});
proc.stdout.on("data", (d) => {
    log.steps.push({ stdout: d.toString() });
    save();
});
proc.stderr.on("data", (d) => {
    log.stderr += d.toString();
    save();
});
proc.on("error", (e) => {
    log.steps.push({ processError: e.message });
    save();
});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let socket,
    buffer = Buffer.alloc(0),
    seq = 1;
const pending = new Map(),
    events = [];
const request = (command, args = {}, timeout = 10000) =>
    new Promise((resolve, reject) => {
        const id = seq++,
            body = JSON.stringify({
                seq: id,
                type: "request",
                command,
                arguments: args,
            });
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(Error("timeout " + command));
        }, timeout);
        pending.set(id, (m) => {
            clearTimeout(timer);
            log.steps.push({ command, response: m });
            save();
            resolve(m);
        });
        socket.write(
            `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
        );
    });
try {
    for (let n = 0; n < 100; n++) {
        try {
            socket = await new Promise((resolve, reject) => {
                const s = net.connect(port, "127.0.0.1");
                s.once("connect", () => resolve(s));
                s.once("error", (e) => {
                    s.destroy();
                    reject(e);
                });
            });
            break;
        } catch {
            await delay(100);
        }
    }
    if (!socket) throw Error("No DAP listener");
    socket.on("data", (data) => {
        buffer = Buffer.concat([buffer, data]);
        for (;;) {
            const end = buffer.indexOf("\r\n\r\n");
            if (end < 0) return;
            const length = Number(
                buffer
                    .toString("ascii", 0, end)
                    .match(/Content-Length:\s*(\d+)/i)[1],
            );
            if (buffer.length < end + 4 + length) return;
            const message = JSON.parse(
                buffer.toString("utf8", end + 4, end + 4 + length),
            );
            buffer = buffer.subarray(end + 4 + length);
            if (message.type === "response") {
                const handler = pending.get(message.request_seq);
                pending.delete(message.request_seq);
                handler?.(message);
            } else {
                events.push(message);
                log.steps.push({ event: message });
                save();
            }
        }
    });
    await delay(3000);
    const init = await request("initialize", {
        adapterID: "emulicious-debugger",
        clientID: "codex-native-probe",
        linesStartAt1: true,
        columnsStartAt1: true,
        pathFormat: "path",
        supportsMemoryReferences: true,
    });
    if (!init.success) throw Error("DAP initialize failed");
    const attached = request(
        "attach",
        { type: "emulicious-debugger", name: "SIDE CARAVAN native", port },
        15000,
    );
    // A DAP session must finish configuration; awaiting attach before this can deadlock.
    for (
        let n = 0;
        n < 30 && !events.some((e) => e.event === "initialized");
        n++
    )
        await delay(100);
    if (init.body?.supportsConfigurationDoneRequest)
        await request("configurationDone");
    const attach = await attached;
    if (!attach.success) throw Error("DAP attach failed");
    const threads = await request("threads"),
        threadId = threads.body?.threads?.[0]?.id ?? 1;
    const snapshot = async () => {
        await request("pause", { threadId });
        await delay(150);
        const data = {};
        for (const [name, expression] of [
            ["pc", "pc"],
            ["frame", `word@@$${symbols._sys_time.toString(16)}`],
            ["scene", `@$${symbols._ce_scene.toString(16)}`],
            ["cgb", `@$${symbols._ce_is_cgb.toString(16)}`],
        ]) {
            const response = await request("evaluate", {
                expression,
                context: "watch",
            });
            data[name] = response;
        }
        return data;
    };
    const first = await snapshot();
    await request("continue", { threadId });
    await delay(1500);
    const second = await snapshot();
    log.snapshots = [first, second];
    const parse = (r) =>
        r.success && typeof r.body?.result === "string"
            ? Number(r.body.result.replace(/^\$/, "0x"))
            : NaN;
    log.bootExecutionVerified =
        Number.isFinite(parse(first.frame)) &&
        Number.isFinite(parse(second.frame)) &&
        parse(first.frame) !== parse(second.frame) &&
        parse(second.scene) === 0;
    log.gameplayVerified = false;
    if (!log.bootExecutionVerified)
        log.limitation =
            "Connection alone is not execution evidence; inspect response errors.";
} catch (error) {
    log.error = error.message;
} finally {
    save();
    socket?.destroy();
    proc.kill();
    await delay(100);
}
console.log(JSON.stringify(log, null, 2));
process.exitCode = log.bootExecutionVerified ? 0 : 1;
