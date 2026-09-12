import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "../.."),
    started = Date.now();
const result = spawnSync(
    path.join(
        root,
        ".tools/electron",
        process.platform === "win32" ? "electron.exe" : "electron",
    ),
    [path.join(root, "editor/tests/horizontal-ui.acceptance.cjs")],
    { cwd: root, stdio: "inherit", windowsHide: true, timeout: 130000 },
);
const report = path.join(root, ".cache/horizontal-ui-result.json");
let passed = false;
if (fs.existsSync(report) && fs.statSync(report).mtimeMs >= started) {
    const data = JSON.parse(fs.readFileSync(report, "utf8"));
    passed = data.checks.at(-1) === "PASS";
    console.log(JSON.stringify(data, null, 2));
}
if (result.error) console.error(result.error.message);
process.exitCode = result.status === 0 && passed ? 0 : 1;
