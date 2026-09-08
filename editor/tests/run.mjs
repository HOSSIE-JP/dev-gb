import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const suite = process.argv[2] ?? "auto";
const romSuites = ["rom.test.mjs", "integration.test.mjs"];
const specialized = new Set([...romSuites, "bgb.test.mjs"]);

try {
    if (!["auto", "core", "rom", "bgb"].includes(suite))
        throw new Error("Unknown suite. Use auto, core, rom, or bgb.");
    const required = [
        "editor/build/library.cjs",
        ".tools/misaki/misaki_gothic.bdf",
    ];
    const suffix = process.platform === "win32" ? ".exe" : "";
    const compilerTools = ["lcc", "png2asset", "romusage"].map(
        (name) => `.tools/gbdk/bin/${name}${suffix}`,
    );
    const missingCompilerTools = compilerTools.filter(
        (name) => !fs.existsSync(path.join(root, name)),
    );
    const bgbAvailable =
        process.platform === "win32" &&
        fs.existsSync(path.join(root, ".tools/bgb/bgb64.exe"));
    const runRom =
        suite === "rom" ||
        suite === "bgb" ||
        (suite === "auto" && !missingCompilerTools.length);
    const runBgb =
        suite === "bgb" || (suite === "auto" && runRom && bgbAvailable);
    if (runRom) required.push(...compilerTools);
    if (suite === "bgb") {
        if (process.platform !== "win32")
            throw new Error(
                "The BGB suite requires the locked Windows x64 environment. Use npm run test:rom for the DMG/CGB WASM emulator suite on other hosts.",
            );
        required.push(".tools/bgb/bgb64.exe");
    }
    const missing = required.filter(
        (name) => !fs.existsSync(path.join(root, name)),
    );
    if (missing.length)
        throw new Error(
            `Missing test prerequisites: ${missing.join(", ")}. Run bootstrap.cmd and npm run build first.`,
        );
    fs.mkdirSync(path.join(root, ".cache"), { recursive: true });
    if (suite === "auto" && !runRom)
        console.log(
            `[SKIP] ROM/integration suites: missing ${missingCompilerTools.join(", ")}. Run bootstrap.cmd, then npm run test:rom.`,
        );
    if (suite === "auto" && !runBgb)
        console.log(
            `[SKIP] BGB suite: ${process.platform !== "win32" ? "requires Windows x64" : !bgbAvailable ? "locked BGB is missing" : "GBDK is missing"}. Run npm run test:bgb in the complete Windows environment.`,
        );
    if (runRom) {
        const lib = createRequire(import.meta.url)("../build/library.cjs");
        lib.compile(root, "star-caravan", "Debug");
    }
    const coreFiles = fs
        .readdirSync(directory)
        .filter((name) => name.endsWith(".test.mjs") && !specialized.has(name))
        .sort();
    const files =
        suite === "auto"
            ? [
                  ...coreFiles,
                  ...(runRom ? romSuites : []),
                  ...(runBgb ? ["bgb.test.mjs"] : []),
              ]
            : suite === "core"
              ? coreFiles
              : suite === "rom"
                ? romSuites
                : ["bgb.test.mjs"];
    if (!files.length) throw new Error("No tests found for this suite.");
    const result = spawnSync(
        process.execPath,
        ["--test", ...files.map((name) => path.join(directory, name))],
        {
            cwd: root,
            stdio: "inherit",
        },
    );
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
