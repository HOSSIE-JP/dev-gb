# Editor third-party components

Exact versions and integrity: `editor/package-lock.json`. Tool archives: `config/tools.lock.json`. These downloaded packages are not committed.

The build writes `editor/build/THIRD-PARTY-LICENSES.txt` with the installed npm runtime dependencies' full license texts and the replacement boot ROM notices. Include it with any application bundle. Retain Electron's `LICENSE` and `LICENSES.chromium.html` and Node.js's `LICENSE` if those runtimes are distributed. This collection is not a complete redistribution clearance for the WASM binary or its Rust dependencies.

Boytacean 0.13.2 is Apache-2.0. Its CGB replacement bootstrap is derived from SameBoy (Expat); Bootix is CC0-1.0. Although the player selects replacement bootstraps, the pinned npm WASM also contains the original DMG bootstrap byte sequence. Do not distribute this WASM in HTML or application bundles until the embedded data and all binary dependencies are cleared or replaced. See [distribution conditions](../docs/licensing.md).

## Misaki Font

Copyright(C) 2002-2021 Num Kadoma. 2021-05-05 edition.

These fonts are free softwares.
Unlimited permission is granted to use, copy, and distribute it, with or without modification, either commercially and noncommercially.
THESE FONTS ARE PROVIDED "AS IS" WITHOUT WARRANTY.

Source: https://littlelimit.net/misaki.htm

The compiler subsets Misaki Gothic BDF glyphs into ROM screen tiles. This display permission does not license the project's own code or assets.
