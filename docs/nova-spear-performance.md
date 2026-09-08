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

## v5: profiling and additional trials

A disposable v4-engine ROM was instrumented with phase IDs and sampled every 4096 CPU cycles over logical ticks 120–719, using ordinary START/A input. IDs cover idle, player, events, entities, collisions, sprites, map, HUD, trace and audio. Instrumentation and sampling can perturb timings; interrupts are charged to the active phase. The instrumented ROM is not shipped. `editor/tests/profile-runtime.mjs` consumes this diagnostic symbol.

| Phase | DMG samples | CGB samples |
| --- | ---: | ---: |
| Sprite preparation / OAM | 40.65% | 36.15% |
| Entity updates | 35.02% | 29.23% |
| Collisions | 13.70% | 11.47% |
| Player / shooting | 3.09% | 2.81% |
| Stage events | 1.09% | 0.99% |
| Map updates | 0.75% | 1.07% |
| HUD | 1.85% | 1.71% |
| Trace | 1.64% | 1.34% |
| Audio | 0.74% | 0.63% |
| Idle / remainder | 1.48% | 14.60% |

20,046 DMG and 21,458 CGB samples show that sprite construction and entity updates dominate; allocation is not the sole cause. Enemy attack schedules now cache the next firing age for each of up to four layers, avoiding per-update 16-bit remainder calculations. Phase entry and 16-bit age wrap restart the same schedule. Sprite scratch variables use static storage to reduce stack-relative access; interrupts never call this non-reentrant routine. A signed-coordinate shift rewrite was tried and discarded because it did not improve the comparison.

A separate discontinuity existed at looping map boundaries: camera wrap entered the full 32-row reload path and disabled the LCD. Maps whose heights are multiples of the 32-row hardware ring now wrap with a one-row update. Other map sizes retain the safe reload path. This is a boundary fix, not an explanation of every ordinary spawn hitch; the normal opening benchmark does not cross this boundary. The editor also reuses ImageData instead of allocating a new 160×144 buffer each paint. This host allocation reduction is not included in ROM-cycle measurements.

### Controlled v4 / v5 comparison

The sampler now holds A together with START, so title/fade duration cannot change the initial shooting phase. Both simulations use the same 180-update respawn for this comparison; v5's shipping 90-update wait is disabled in the fixture. Ticks 120–1799, ordinary emulator speed, unchanged waves and patterns. This protocol differs from the historical v4 experiment above. Units are PPU display frames per published update, lower is better.

| Mode / lifecycle | v4 mean gap | v5 mean gap |
| --- | ---: | ---: |
| DMG / none | 1.699 | 1.658 |
| DMG / create | 2.072 | 2.026 |
| DMG / destroy | 1.617 | 1.551 |
| DMG / both | 2.276 | 2.224 |
| CGB / none | 1.043 | 1.030 |
| CGB / create | 1.195 | 1.179 |
| CGB / destroy | 1.056 | 1.037 |
| CGB / both | 1.208 | 1.163 |

Weighted mean gaps: DMG 1.745→1.700 (about 2.5% shorter), CGB 1.064→1.048 (about 1.4% shorter). DMG uses 1680 samples on both sides with no multi-update exclusions. CGB uses 1583/1593 samples with 48/43 exclusions. Worst observed gaps still reach four display frames on DMG and two on CGB. These are limited opening-section observations, not guaranteed full-game FPS or complete elimination of stutter.

v5 also halves the authored respawn delay to 90 updates, adds a short boss-impact noise-channel sound with a four-VBlank retrigger limit, and persists rankings to battery SRAM. Saving occurs after the run, so it does not add writes to the gameplay loop. BGM pulse/wave channels are preserved.

To build a disposable instrumented copy of the current engine, run `node editor/tests/profile-build.cjs` after building the editor. Pass its printed ROM path to `node editor/tests/profile-runtime.mjs ROM_PATH profile.json`. The copy lives under `.cache/profile-fixture-*`; delete that copy after measurement. Instrumentation changes timings and must not be used as the distributed game.

## v6: display every completed gameplay pose

The game logic was C compiled by GBDK/SDCC to SM83 machine code, with the SDK's low-level routines handling DMA and interrupts. It did not previously contain a handwritten sprite emitter. v6 adds a small bank-local inline SM83 assembly routine for the per-tile OAM loop. It explicitly preserves BC/DE/HL, uses dedicated static scratch storage, and is never called from an interrupt. Tile order, clipping, animation selection and DMG/CGB attributes retain their previous behavior.

A synchronization gap was more relevant to perceived skipping than the allocator: rendering disabled automatic OAM DMA while constructing a pose, then re-enabled it without waiting for transfer. Another update could reach the next construction pass before that pose was transferred. A published logic tick therefore did not guarantee a displayed pose. The ROM now waits for VBlank after completing HUD and shadow OAM work, then updates SCY in the same VBlank. The next gameplay update cannot overwrite that completed pose before DMA. CPU overload intentionally slows game progression and repeats the previous display; no backlog of gameplay steps is replayed. Title/stage fades and pause remain deliberate presentation states.

`publication-probe.mjs` compares physical OAM with shadow OAM at coherent gameplay publications, during ordinary START+A play. This checks readiness at publication, not the percentage of visually skipped frames. Sampling skips busy snapshots and has different observation counts in each build.

| Mode | v5 OAM not ready / observations | v6 OAM not ready / observations |
| --- | ---: | ---: |
| DMG | 982 / 1052 | 0 / 835 |
| CGB | 908 / 990 | 0 / 821 |

The regression suite now checks physical OAM against both shadow OAM and an independent tile-by-tile reconstruction from the authored assets and entity state, including clipping, hidden tails and palette attributes. It also checks the committed scroll register. Original gameplay and the shortened all-stage/all-boss-phase DMG/CGB fixtures pass these checks.

The host player had an additional catch-up loop: a late animation callback could advance several emulated frames and paint only the last. At normal speed v6 permits only one emulated display frame per paint and discards overdue wall-clock time. Explicit fast debug playback may advance more. A Chromium test inserted five 100 ms main-thread stalls and observed at most one emulated frame in each normal-speed callback. The SRAM earn/save/reload/scoreboard regression also passed.

### Assembly comparison with the same synchronization policy

A disposable C-emitter build used the same VBlank wait and camera commit as v6. Both used the same authored game, normal START+A input, and logical ticks 120–1799. Each mode contributed 1680 single-update samples with zero multi-update exclusions.

| Mode | C emitter + wait: mean display frames/update | ASM emitter + wait | Reduction |
| --- | ---: | ---: | ---: |
| DMG | 2.234 | 2.190 | 1.9% |
| CGB | 1.226 | 1.189 | 3.0% |

The ASM improvement is modest; synchronization is the main behavior change. Waiting for actual display lowers logical progression relative to v5's unacknowledged publications. A separate ordinary-play sampler observed approximately 26–29 updates/s on DMG and 46–55 on CGB across opening intervals. It is incorrect to present the new wait as a general FPS increase. Busy intervals still repeat frames, and the hardware ten-sprites-per-scanline limit can still hide sprite tiles.

Release: 131072 bytes, static WRAM plus shadow OAM 1956 bytes; SHA-256 `287292bba30b7149f487cc273a7c9a8dff1d89dee1e58d7ce2864dfc413876a6`. No instrumented diagnostic ROM is distributed. Windows GUIs and physical hardware remain untested.

## v7: middle-stage investigation and rejected optimization

The v6 engine was sampled over logical ticks 1200–1799 using a disposable instrumented ROM and ordinary START/A input. The profiler now labels the mandatory VBlank wait as idle instead of accidentally charging it to HUD work. Phase sampling is approximate, includes interrupts, and perturbs timing; these percentages are not frame rates or precise exclusive CPU times.

| Phase | DMG | CGB |
| --- | ---: | ---: |
| Sprite preparation / OAM | 27.78% | 26.25% |
| Entity updates | 26.62% | 25.60% |
| Collision | 10.20% | 9.43% |
| Stage events | 1.05% | 0.92% |
| Map | 1.20% | 1.55% |
| HUD | 1.36% | 1.35% |
| Idle / display wait / remainder | 26.70% | 30.26% |

21,384 DMG and 22,379 CGB samples locate the largest active costs in sprite construction and actor updates. The entity pool remains fixed; no gameplay heap allocation, free, or SRAM write was introduced. VBlank synchronization quantizes completed updates into whole display intervals: a small CPU reduction may still miss the same display boundary. These observations do not rule out every rare spike or describe stages 2–3.

A trial replaced wave/bounce modulo and division with deduplicated fixed-point offset tables in banked ROM and a per-entity cursor. It preserved integer motion semantics, but added 62 bytes of cursor RAM and extra ROM/table access. Identical v6 HUD, timer, waves, input and disabled victory presentation were used for the controlled comparison at ticks 1200–2399. Each mode/build supplied 1200 single-update observations, with no multi-update exclusions.

| Mode | v6 mean display frames/update | Table trial | Maximum before / after |
| --- | ---: | ---: | ---: |
| DMG | 2.247 | 2.248 | 4 / 4 |
| CGB | 1.240 | 1.240 | 2 / 2 |

The trial did not produce a useful observed improvement and was removed before release. It is not included in v7. We do not claim a frame-rate increase or that mid-stage stutter is solved. v7 removes the unused TIME field and its display work, keeps v6's no-catch-up display policy and handwritten SM83 OAM emitter, and adds presentation outside the combat loop. Boss victory clears combat entities, uses the existing bounded effect pool, and does not run actor AI or collisions during the sequence.

To reproduce a selected range, `spawn-performance.mjs ROM.gb game.json result.json FROM_TICK TO_TICK` and `profile-runtime.mjs ROM.gb result.json FROM_TICK TO_TICK` accept optional bounds. The latter requires a disposable instrumented ROM. The diagnostic ROM and rejected trial are not distributed.

Shipping v7 Release: 131072 bytes, static WRAM plus shadow OAM 1962 bytes; SHA-256 `9bc31873d687ab29f6a074cb67c2764f97e2579e56ec67006a69eb0801c99eaf`. Music resides in bank 2 to leave room for the bank-1 renderer. The table trial's 2024-byte RAM footprint is not shipped.
