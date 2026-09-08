# NOVA SPEAR: compact HUD and performance

## Changes

- One 8-pixel HUD row: `S00000  P5   TIME075`. Score is five digits, ships one digit and time three digits. The title and boss HP are removed from this HUD. The playfield grows from 128 to 136 pixels.
- Optional `Screen.rows` (default 2) and `TextItem.digits` (default 5) keep legacy projects compatible. The editor, compiler, simulator, window split, terrain lookup, scrolling bounds and player bounds agree on HUD height.
- HUD values are cached; unchanged numbers no longer trigger decimal conversion and VRAM writes. Cache invalidation occurs on screen/stage loading.
- Straight motion uses incremental fixed-point addition, preserving the original first tick, phase entry and age-wrap behavior. Enemy counts, HP, shot patterns and score rules are unchanged.
- Sprite drawing uses byte-sized OAM coordinates, one incrementing shadow-OAM pointer and a cached active tail. DMA is disabled only while constructing the sprite list so VBlank never uploads a partly constructed list.
- Four-update catch-up bursts are replaced with one visible update per iteration. An iteration that already crossed VBlank starts the next update without an unnecessary additional VBlank wait. No accumulating backlog is replayed after stalls or pause.
- CGB uses the pinned GBDK `cpu_fast()` API. Music still follows the real VBlank clock. The embedded emulator advances `70224 * multiplier()` CPU cycles per frame, including CGB double speed; the cycle budget stays bounded even with LCD disabled.

## Measurement

Baseline: upstream `a441473ebd9c7622e502bbf425db4022c93f93b7` (v2), unmodified Release ROM. Updated build: 131,072-byte Release ROM, SHA-256 `d4eb155b012f81bbaba4858f35a289ab8d225310f04549b5270ec55e949db4ff`.

Boytacean 0.13.2, DMG and CGB, ordinary START then continuous A fire at the initial position. No RAM edits, invincibility, time compression, enemy removal or emulator speed increase. Samples cover the same first-stage logical ticks 120–1799 (roughly the opening 2–30 seconds of game time), including the new weak-enemy flights. PPU frame counts provide elapsed hardware time at 59.7275 Hz; host execution time is not used.

`performance.mjs` reads published trace tick changes once per PPU frame as a presentation proxy, capped at one observation per display frame. It also measures logical updates separately. This is a reproducible engine-update metric, not a guarantee of full-game or physical-hardware FPS.

| Mode | Before: presentations/s | After: presentations/s | Before: updates/s | After: updates/s |
| --- | ---: | ---: | ---: | ---: |
| DMG | 9.66 | 33.76 | 38.62 | 33.76 |
| CGB | 9.59 | 54.36 | 38.36 | 57.11 |

Presentation ranges across the three sampled intervals: DMG 31.44–36.10/s; CGB 51.76–55.57/s. On DMG, drawing every update costs more than the previous four-tick batches, so logical progression is slightly slower even though presentation is much smoother. On CGB both metrics improve. Neither 60 FPS nor constant game speed is claimed for heavy scenes or bosses.

To repeat after a Release build:

```sh
node editor/tests/performance.mjs projects/nova-spear/build/Release/nova-spear.gb performance.json
```

Use the same command with the previous ROM and its matching `.map` file for comparison. The script never writes to emulated RAM. Keep generated measurement files and ROMs outside Git.

## Verification scope

TypeScript, ROM builds and regression tests cover the one-row HUD geometry, digit width limits, legacy two-row HUDs, CGB speed flag, emulator PPU progress, DMG/CGB gameplay, audio, terrain, boss phases, and runtime/simulator agreement. The runtime screen was visually inspected at native 160×144 resolution.

Windows command wrappers, BGB/Emulicious GUIs and physical GB/GBC cartridges cannot be exercised in this Linux environment. The updated unmodified full campaign has not been replayed to completion; the all-stage/all-phase regression uses an isolated shortened fixture. The original release's full-campaign results do not describe this revised ROM.
