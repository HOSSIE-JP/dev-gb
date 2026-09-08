# NOVA SPEAR: compact HUD and performance

## Changes

- One 8-pixel HUD row: `S00000  P5   TIME075`. Score is five digits, ships one digit and time three digits. The title and boss HP are removed from this HUD. The playfield grows from 128 to 136 pixels.
- Optional `Screen.rows` (default 2) and `TextItem.digits` (default 5) keep legacy projects compatible. The editor, compiler, simulator, window split, terrain lookup, scrolling bounds and player bounds agree on HUD height.
- HUD values are cached; unchanged numbers no longer trigger decimal conversion and VRAM writes. Cache invalidation occurs on screen/stage loading.
- Straight motion uses incremental fixed-point addition, preserving the original first tick, phase entry and age-wrap behavior. Enemy counts, HP, shot patterns and score rules are unchanged.
- Sprite drawing uses byte-sized OAM coordinates, one incrementing shadow-OAM pointer and a cached active tail. DMA is disabled only while constructing the sprite list so VBlank never uploads a partly constructed list.
- Four-update catch-up bursts are replaced with one visible update per iteration. An iteration that already crossed VBlank starts the next update without an unnecessary additional VBlank wait. No accumulating backlog is replayed after stalls or pause.
- CGB uses the pinned GBDK `cpu_fast()` API. Music still follows the real VBlank clock. The embedded emulator advances `70224 * multiplier()` CPU cycles per frame, including CGB double speed; the cycle budget stays bounded even with LCD disabled.

## v3 measurement

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

## v3 verification scope

TypeScript, ROM builds and regression tests cover the one-row HUD geometry, digit width limits, legacy two-row HUDs, CGB speed flag, emulator PPU progress, DMG/CGB gameplay, audio, terrain, boss phases, and runtime/simulator agreement. The runtime screen was visually inspected at native 160×144 resolution.

Windows command wrappers, BGB/Emulicious GUIs and physical GB/GBC cartridges cannot be exercised in this Linux environment. The updated unmodified full campaign has not been replayed to completion; the all-stage/all-phase regression uses an isolated shortened fixture. The original release's full-campaign results do not describe this revised ROM.

## v4: lifecycle investigation and transitions

Objects use a fixed 31-entry entity array. There is no malloc/free or garbage collector in the ROM; sprite patterns are uploaded on stage loading, not each spawn. The previous allocator nevertheless rescanned all live entities for every shot to recount type limits and OAM occupancy. Destruction/creation also coincide with collision checks, explosions, score/HUD updates and rendering more sprites. These overlapping workloads can exceed one VBlank budget; the investigation does not attribute every spike to allocation alone.

The allocator now maintains type/OAM counts and a four-byte free-slot bitmap, preserving lowest-slot allocation order. The compiler shares precomputed velocity tables by bullet speed. Aimed shots compare five mirrored quadrant candidates using shift/add arithmetic instead of 16 two-product dot scores, preserving tie order. Redundant initial collision-box work is removed where the same update immediately computes it again. No enemies or shot patterns were removed to obtain these changes.

`spawn-performance.mjs` samples published update gaps in PPU frames over logical ticks 120–1799. Lifecycle labels come from the matching deterministic simulator: this is correlation at display-frame resolution, not a CPU function profiler. Multi-update samples are excluded. Compare with identical rules: the optimization fixture retains v3 immediate respawn and disables fades, so the new absence of the player does not artificially reduce benchmark load.

Before optimization, DMG mean gaps were 1.754 display frames without lifecycle changes, 1.723 for creation, 1.803 for destruction, and 2.204 when both occurred. The worst observed gap was four display frames (about 67 ms). Allocation/velocity changes alone barely moved these figures (1.731 / 1.750 / 1.787 / 2.222). This rules out claiming a large win from pool management alone.

Respawn now waits 180 logical updates while enemies, background and the deadline continue; player movement, firing and collisions are suspended, and existing friendly shots are removed. The legacy default delay is zero. The authored NOVA SPEAR opts into 180; immunity starts on return. Logical durations stretch during slowdown.

Stage fades default on, using 24 VBlanks out and 24 in, plus black loading time. Palette changes affect both background and sprites on DMG/CGB. LCD stays enabled while black to avoid a DMG white flash; safe GBDK VRAM writes load the next stage. Music tracks VBlank time while gameplay and respawn clocks pause for the transition. The lightweight logic preview omits this presentation-only wait; use the ROM preview to inspect fades.

The title stage/lives banner is removed. A separate compiler reporting fix deduplicates paginated map area headers so WRAM is not counted twice.

Final same-rule fixture (Release, respawn=0, fades=false):

| Mode / lifecycle | v3 mean gap | v4 mean gap | v3 / v4 p95 | v3 / v4 max |
| --- | ---: | ---: | --- | --- |
| DMG / none | 1.754 | 1.736 | 3 / 3 | 4 / 4 |
| DMG / create | 1.723 | 1.762 | 3 / 3 | 4 / 4 |
| DMG / destroy | 1.803 | 1.747 | 3 / 3 | 3 / 3 |
| DMG / both | 2.204 | 2.296 | 3 / 4 | 4 / 4 |
| CGB / none | 1.067 | 1.061 | 2 / 2 | 2 / 3 |
| CGB / create | 1.090 | 1.077 | 2 / 2 | 2 / 2 |
| CGB / destroy | 1.049 | 1.061 | 1 / 2 | 2 / 2 |
| CGB / both | 1.186 | 1.167 | 2 / 2 | 2 / 2 |

Units are display frames (lower is better). Sample-weighted mean gaps change only from 1.771 to 1.758 on DMG and 1.071 to 1.066 on CGB, below 1%. Worst-case spikes are not improved; some categories are worse at this quantized resolution. This is a small reduction in bookkeeping, not a demonstrated cure for spawn stutter. DMG samples: 1678 before / 1680 after, multi-update exclusions 1 / 0. CGB samples: 1536 / 1592, exclusions 72 / 44. These differences also limit direct percentile comparisons. Further substantial improvement would require cycle-level profiling of collision/render/map/HUD work, rather than assuming a heap or buffer allocation problem.

The shipping ROM includes delayed respawn and fades, so its workload is deliberately different from this controlled fixture. NOVA SPEAR and STAR CARAVAN Debug/Release builds succeed. The shipping 128 KiB ROM uses 1665 bytes of static WRAM plus shadow OAM combined, with the compiler stack reserve intact. SHA-256: `4afc2f9dbcbe6f9d21fad4ab71de3cafd7d0cb3936283370f000275a53e7522d`.
