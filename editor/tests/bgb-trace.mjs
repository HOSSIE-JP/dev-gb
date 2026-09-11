// Native, read-only corroboration. ROM and RAM are never patched.
// node editor/tests/bgb-trace.mjs ROM.gb OUTDIR FRAMES direct|menu|idle|focus [--breakpoint SPEC] [--watchpoint SPEC]
// SPEC uses BGB's documented -br/-wp syntax; logging expressions use hex.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../..", import.meta.url));
const [romArg, outArg, countArg = "1200", recipe = "direct", ...options] =
    process.argv.slice(2);
const rom = path.resolve(romArg),
    out = path.resolve(outArg),
    count = Number(countArg);
assert.ok(Number.isInteger(count) && count > 0 && count <= 120000);
assert.ok(["direct", "menu", "idle", "focus"].includes(recipe));
fs.mkdirSync(out, { recursive: true });
const executable = path.join(out, "bgb64.exe");
fs.copyFileSync(path.join(root, ".tools/bgb/bgb64.exe"), executable);
const prefix =
    recipe === "idle"
        ? Buffer.alloc(0)
        : Buffer.concat([
              Buffer.alloc(600),
              Buffer.alloc(8, 8),
              ...(recipe === "menu"
                  ? [Buffer.alloc(120), Buffer.alloc(8, 1), Buffer.alloc(8)]
                  : []),
          ]);
const demo = Buffer.concat([
    prefix,
    Buffer.alloc(count, recipe === "idle" ? 0 : recipe === "focus" ? 2 : 1),
]);
fs.writeFileSync(path.join(out, "input.dem"), demo);
const args = [
    "-hf",
    "-nobatt",
    "-nowriteini",
    "-ini",
    path.join(out, "bgb.ini"),
    "-set",
    "DebugMsgFile=1",
    "-set",
    "DebugMsgFileTS=0",
    "-rom",
    rom,
    "-demoplay",
    path.join(out, "input.dem"),
    "-screenonexit",
    path.join(out, "screen.bmp"),
];
for (let i = 0; i < options.length; i += 2) {
    assert.ok(
        ["--breakpoint", "--watchpoint"].includes(options[i]) && options[i + 1],
    );
    args.push(options[i] === "--breakpoint" ? "-br" : "-wp", options[i + 1]);
}
const result = spawnSync(executable, args, {
    cwd: out,
    windowsHide: true,
    timeout: Math.max(120000, demo.length * 15),
});
if (result.error) throw result.error;
assert.equal(result.status, 0, "native BGB execution");
fs.writeFileSync(
    path.join(out, "run.json"),
    JSON.stringify(
        {
            rom,
            romSha256: crypto
                .createHash("sha256")
                .update(fs.readFileSync(rom))
                .digest("hex"),
            emulator: "BGB 1.6.6",
            args,
            demoBytes: demo.length,
            recipe,
            exitCode: result.status,
        },
        null,
        2,
    ) + "\n",
);
console.log(path.join(out, "run.json"));
