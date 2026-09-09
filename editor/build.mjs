import { writeRuntimeNotices } from './scripts/third-party-notices.mjs';
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.argv.includes("--production");
const options = {
    bundle: true,
    platform: "node",
    target: "node24",
    format: "cjs",
    logLevel: "info",
    sourcemap: !production,
};
fs.mkdirSync(path.join(root, "build"), { recursive: true });
for (const [name, source] of [
    ["compiler", "src/node/compiler.ts"],
    ["main", "src/node/main.ts"],
    ["preload", "src/node/preload.ts"],
    ["library", "src/node/library.ts"],
]) {
    await build({
        ...options,
        entryPoints: [path.join(root, source)],
        outfile: path.join(root, `build/${name}.cjs`),
        external: name === "main" || name === "preload" ? ["electron", "./html-export.cjs"] : [],
    });
}
await build({
    bundle: true,
    platform: "browser",
    target: "chrome130",
    format: "esm",
    entryPoints: [path.join(root, "src/renderer/index.tsx")],
    outfile: path.join(root, "build/renderer.js"),
    logLevel: "info",
    define: {
        "process.env.NODE_ENV": JSON.stringify(
            production ? "production" : "development",
        ),
    },
    minify: production,
    sourcemap: !production,
});
fs.copyFileSync(
    path.join(root, "src/renderer/index.html"),
    path.join(root, "build/index.html"),
);
fs.copyFileSync(
    path.join(root, "node_modules/boytacean/boytacean_bg.wasm"),
    path.join(root, "build/boytacean_bg.wasm"),
);

writeRuntimeNotices();

await build({bundle:true, platform:"browser", format:"iife", minify:true,
    entryPoints:[path.join(root,"../.codex/skills/build-gbdk-stg/assets/player.js")],
    alias:{boytacean:path.join(root,"node_modules/boytacean/boytacean.js")},
    outfile:path.join(root,"build/player.js")});
fs.copyFileSync(path.join(root,"scripts/html-export.cjs"),path.join(root,"build/html-export.cjs"));

for (const file of ["caravan-editor.png", "caravan-editor.ico"]) fs.copyFileSync(path.join(root,"assets",file),path.join(root,"build",file));
