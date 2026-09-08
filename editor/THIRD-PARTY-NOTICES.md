# Third-party components

Archive versions and SHA-256: `config/tools.lock.json`. Npm versions, official registry URLs and integrity: `editor/package-lock.json`. These downloaded components are not committed. Retain their bundled licenses when distributing a portable copy.

| Component | Source | Local license after setup |
| --- | --- | --- |
| Node.js | https://nodejs.org/ | `.tools/node/LICENSE` |
| Electron | https://github.com/electron/electron | `.tools/electron/LICENSE`, `LICENSES.chromium.html` |
| React / React DOM | https://github.com/facebook/react | Their `node_modules` LICENSE files (MIT) |
| Boytacean 0.13.2 | https://github.com/joamag/boytacean/releases/tag/0.13.2 | `editor/node_modules/boytacean/LICENSE` (Apache-2.0) |
| pngjs | https://github.com/pngjs/pngjs | `editor/node_modules/pngjs/LICENSE` (MIT) |
| TypeScript / esbuild / Prettier | Official npm packages in lockfile | Their `node_modules` license files; build tools only |
| GBDK / SDCC / png2asset | https://github.com/gbdk-2020/gbdk-2020 | `.tools/gbdk/licenses/` |
| Misaki Gothic | https://littlelimit.net/misaki.htm | `.tools/misaki/misaki.txt` |

The Boytacean release browser ZIP is a complete demonstration website, not an importable library. The editor uses the **same author's official npm package at the same 0.13.2 version**, including WASM, pinned by package-lock integrity. No demonstration game ROM is bundled. Bootix and Boytacean boot ROMs provided by that package are used; no proprietary Nintendo boot ROM is supplied.

## Misaki Font

Copyright(C) 2002-2021 Num Kadoma. 2021-05-05 edition.

These fonts are free softwares.
Unlimited permission is granted to use, copy, and distribute it, with or without modification, either commercially and noncommercially.
THESE FONTS ARE PROVIDED "AS IS" WITHOUT WARRANTY.

Misaki Gothic BDF glyphs are subset per ROM screen. The compiler supports ASCII, hiragana, katakana and selected punctuation, excluding kanji in this edition.
