# GitHub Copilot instructions

## Repository intent

This repository is a portable Windows development environment for Game Boy Homebrew without GB Studio. GBDK-2020 C is the primary path. RGBDS is a separate path for pure assembly and low-level experiments. DMG compatibility is the baseline; GBC enhancements must preserve the DMG experience.

Read `/AGENTS.md` and the relevant file under `/docs` before proposing code. Exact tool versions, URLs, hashes, and install paths come only from `/config/tools.lock.json`; do not invent or duplicate version numbers.

## Portability and safety

- Keep all normal changes inside this repository.
- Never require administrator rights, an installer, Registry edits, global Git settings, permanent `PATH`, or permanent user/system environment variables.
- Resolve paths from the script location, quote paths, and support repository paths containing spaces.
- Use executables under `/.tools` through the repository wrappers. Do not depend on a globally installed GBDK, RGBDS, emulator, Java, or VS Code.
- Do not edit or commit `/.tools`, `/.downloads`, `/.cache`, ROMs, build outputs, emulator saves/states, or generated assets.
- Do not update locked tools during ordinary bootstrap or feature work. Lock updates must be explicit and use official stable distributions with verified SHA-256 values.
- Preserve unrelated user changes. Do not suggest destructive Git cleanup or history rewriting as a routine fix.

## C code generation

Generate code for the GBDK/SDCC target, not generic desktop C.

- Use only language and library features supported by the locked GBDK/SDCC toolchain.
- Prefer explicit 8-bit and 16-bit integer types. Review signedness, integer promotion, overflow, and array bounds.
- Avoid floating point, dynamic allocation, recursion, large stack locals, deep call chains, and unnecessary 32-bit arithmetic.
- Keep `printf` to diagnostics and minimal samples; games should render text with controlled tile data.
- Keep interrupt handlers short. Mark genuinely shared state `volatile` and define synchronization for multi-byte values.
- Do not hide compiler or linker warnings.
- Verify unfamiliar GBDK APIs and flags against the locked release's official documentation, installed headers, or bundled examples.

## Game Boy hardware rules

- Update VRAM and OAM only during legal periods or through confirmed safe GBDK APIs.
- Synchronize the main loop to VBlank and keep VBlank work bounded.
- Respect 40 total OAM entries, the per-scanline sprite limit, VRAM/tile capacity, and OBJ 8x8/8x16 rules.
- Poll the joypad once per frame and derive pressed/released edges from current and previous state.
- Keep DMG and CGB paths explicit. Color must enhance the presentation, never carry information unavailable in DMG's four shades.
- Prefer an unbanked ROM while it fits. When banking is needed, localize bank switching and audit pointers, callbacks, interrupts, and data lifetimes.
- Do not add SRAM use without defining cartridge headers, enable/disable behavior, format versioning, validation, and power-loss handling.
- Validate behavior in both BGB and Emulicious and, where possible, on hardware.

## Toolchain separation

GBDK's SDCC/SDAS assembly path and RGBDS use different syntax and toolchain assumptions. Do not emit RGBASM source where SDAS source is expected. Do not link RGBDS objects into a GBDK project without verified object-format and ABI compatibility. Prefer an independent RGBDS project or an explicit generated-data boundary.

## Assets

- Put editable source assets in `projects/<name>/assets-src`.
- Put reproducible converter outputs in `projects/<name>/generated`; never hand-edit generated C, headers, or binary data.
- Prefer the locked GBDK `png2asset` and record exact conversion commands and options.
- Design for 2bpp, 8x8 tiles, OBJ transparency, palette-index stability, tile reuse, and sprite budgets.
- Record author, source, license, attribution, and modifications for external assets. Do not suggest assets of uncertain redistribution status.
- Do not make a music editor mandatory for bootstrap. Any later audio tool must be portable, officially sourced, licensed, locked, and scripted.

## `star-caravan` contract

`projects/star-caravan` is a single-stage, two-minute caravan shooter in one DMG/GBC-compatible ROM. Preserve title, gameplay, pause, game-over, clear, and top-five scoreboard scenes; directional movement; A/B fire; START pause; three lives; enemy waves; a late boss; scoring; and clear on timeout or boss defeat. Top-five scores use MBC5 battery-backed SRAM with versioned, checksummed, power-loss-tolerant storage.

Keep gameplay results identical in DMG and CGB modes. CGB-only code may set color palettes but must not alter rules or make the DMG display unreadable.

## Standard validation

After relevant changes, run the repository wrappers rather than ad hoc global commands:

```bat
doctor.cmd
clean.cmd star-caravan
build.cmd star-caravan -Configuration Debug
build.cmd star-caravan -Configuration Release
test.cmd
```

For gameplay, rendering, input, or timing changes, also run:

```bat
run.cmd star-caravan -Emulator BGB
run.cmd star-caravan -Emulator Emulicious
```

Report any command that could not be run, why it was skipped, and the remaining risk. Never claim emulator GUI or hardware behavior was verified when only compilation succeeded.
