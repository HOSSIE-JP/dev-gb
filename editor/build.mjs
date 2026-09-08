import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const options = {
    bundle: true,
    platform: "node",
    target: "node24",
    format: "cjs",
    logLevel: "info",
};
fs.mkdirSync(path.join(root, "build"), { recursive: true });
for (const [name, source] of [
    ["compiler", "src/node/compiler.ts"],
    ["main", "src/node/main.ts"],
    ["preload", "src/node/preload.ts"],
    ["library", "src/node/library.ts"],
]) {
    if (fs.existsSync(path.join(root, source)))
        await build({
            ...options,
            entryPoints: [path.join(root, source)],
            outfile: path.join(root, `build/${name}.cjs`),
            external: name === "main" || name === "preload" ? ["electron"] : [],
        });
}
if (fs.existsSync(path.join(root, "src/renderer/index.tsx"))) {
    await build({
        bundle: true,
        platform: "browser",
        target: "chrome130",
        format: "esm",
        entryPoints: [path.join(root, "src/renderer/index.tsx")],
        outfile: path.join(root, "build/renderer.js"),
        logLevel: "info",
    });
    fs.copyFileSync(
        path.join(root, "src/renderer/index.html"),
        path.join(root, "build/index.html"),
    );
}
fs.copyFileSync(
    path.join(root, "node_modules/boytacean/boytacean_bg.wasm"),
    path.join(root, "build/boytacean_bg.wasm"),
);
