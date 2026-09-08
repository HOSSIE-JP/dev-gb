import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const editor = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(editor, "..");
const binary =
    process.platform === "win32"
        ? "electron.exe"
        : process.platform === "darwin"
          ? "Electron.app/Contents/MacOS/Electron"
          : "electron";
const executable = path.join(root, ".tools/electron", binary);
if (!fs.existsSync(executable)) {
    console.error(
        "Portable Electron is missing. On Windows, run bootstrap.cmd from the repository root first. The supported portable environment is Windows x64.",
    );
    process.exitCode = 1;
} else {
    const child = spawn(executable, [editor, ...process.argv.slice(2)], {
        cwd: root,
        stdio: "inherit",
    });
    child.on("error", (error) => {
        console.error(`Could not start Caravan Editor: ${error.message}`);
        process.exitCode = 1;
    });
    child.on("exit", (code, signal) => {
        process.exitCode = code ?? (signal ? 1 : 0);
    });
}
