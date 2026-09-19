import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../..");
const executable = path.join(root, ".tools/electron", process.platform === "win32" ? "electron.exe" : "electron");
const result = spawnSync(executable, [path.join(directory, "music-ui.acceptance.cjs")], {
    cwd: root, stdio: "inherit", windowsHide: true, timeout: 150000,
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
