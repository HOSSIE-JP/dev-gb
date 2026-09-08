# Repository integration

Use the current checkout of HOSSIE-JP/dev-gb and record its commit. The source APIs and lockfiles are authoritative.

## Setup and source ownership

- Read root AGENTS.md, README and config/tools.lock.json. Windows portable entrypoints: bootstrap.cmd, doctor.cmd, editor.cmd PROJECT, build.cmd PROJECT -Configuration Debug/Release, test.cmd.
- On Linux/cloud hosts, Windows wrappers cannot run. Use a scoped Linux GBDK asset from the same pinned release, resolved from official release metadata, under the isolated checkout's `.tools/gbdk`; do not use the Windows archive hash to validate a different Linux archive or silently rewrite the repository lock. Keep host-specific setup outside product source, verify `lcc`/`png2asset`, and record the actual version and origin. Install editor dependencies with the repository lock (`npm ci` in editor) when missing. Required font source is `.tools/misaki/misaki_gothic.bdf` plus its notice, obtained from the pinned Misaki download in tools.lock.json. Missing tools are a setup task, not a reason to return a pretend ROM. If execution/download capability is unavailable, deliver the source and exact build instructions and identify the blocker.
- Build editor APIs with `npm --prefix editor run build`; load `editor/build/library.cjs` from Node. API: readGame(root,name), revision(game), validate(game), createProject(root,id,title,game), saveGame(root,id,game,expectedRevision), compile(root,id,configuration,logCallback).
- `createProject` clones a loaded Game including pixel arrays and writes source PNGs. It does not mutate the template. Read stored PNG pixels through readGame, not by feeding raw disk JSON directly to the compiler.
- `projects/ID/assets-src/game.json` plus `assets-src/images/*.png` are editable source. `generated/`, `.cache`, build outputs, ROMs and SRAM are not source. Preserve user modifications; do not use a design regeneration script with overwrite on an edited project.
- Title screen branding may be baked into an image. Changing `game.title` alone cannot remove it. Keep a full display title in brief.creative if in-engine glyph restrictions require bitmap typography.

## Shared engine vs game settings

Compiler always builds `engine/caravan/runtime.c`, `render.c`, `music.c`, `save.c` with generated project configuration. Fixed entity pools, the SM83 OAM inner loop, complete-pose VBlank synchronization, boss impact SFX and battery SRAM support are shared. Editing an old project and rebuilding uses those improvements; changing a template is not needed to propagate shared engine code.

Game settings:
- `game.timeLimit`: NOVA false; default true. HUD is separate: remove the `binding: "time"` item for an untimed HUD. Keep stage/event scheduling even when timeout is disabled.
- `game.bossCelebration`: NOVA true; default false. Plays repeated explosions, removes wreck, waits for dedicated fanfare then stage exit.
- `game.stageFade`: absent defaults true; 24+24 display-frame fades.
- `game.player.respawnDelay`: NOVA 90 updates; default 0. Respawn invulnerability is separate.
- `stage.scrollDown`, `stage.requireBoss`, `stage.clearOnBoss`, `stage.events`, `stage.music`, `game.stageOrder` determine progression. Avoid timeout or end events bypassing required bosses.
- Current built-in music IDs 0–8, victory ID 8. New compositions currently require a deliberate engine music-table extension; there is no arbitrary audio-file BGM import. Do not claim that selecting an ID composes a new soundtrack.
- Each boss can have motion and attack phases; see model.ts and NOVA data for exact fields. Do not guess schema fields from another editor.

## Limits and traps

160×144 display, four-shade DMG assets, CGB palettes, 40 hardware sprites / 10 per scanline. The compact one-row HUD leaves 136px. Runtime admits bounded entities/OAM; do not call a spawn-drop counter increase a frame-skip measurement. No malloc/free in the gameplay loop.

Scores saturate at 65535 and rankings keep five entries. Plan score ceilings deliberately. MBC5+8KiB battery RAM, two CRC16 slots and project-name identity. Test score registration at game end and reboot with extracted RAM. Keep the project ID stable between revisions; never distribute your test save as the player's initial score.

Dmg/Cgb CPU budget differs. Use the repository's `clockRomFrame` or its exact `70224 * gb.multiplier()` budget for one host display step; do not repeat unseen logic/display frames to catch up after a stalled callback. Ignore accumulated wall-time backlog. Clear held input and queued audio on blur, pause and reload.

## Validation evidence

`npm --prefix editor run check` runs type checks and available regression tests; do not count skipped emulator tests as passed hardware coverage. Root policy also asks for STAR CARAVAN Debug/Release, BGB/Emulicious and hardware checks; say which could not run and why. `editor/tests/emulator.mjs` provides real Boytacean execution, BESS memory inspection and OAM reconstruction. Existing test fixtures demonstrate the technique but are not a generic autopilot for all future games.

Measure at representative early/middle/late high-load sections and boss fights. Existing profile-build.cjs builds disposable instrumentation; never ship that ROM. Phase percentages include waits/interrupts. Keep only optimizations supported by measurements of the same game data, inputs and target mode.

## Distribution

Read `docs/licensing.md` in the checkout before distributing source, skills, ROM bundles or players. Repository-wide permissions are currently unspecified. The pinned Boytacean npm WASM contains original DMG bootstrap data; the HTML exporter rejects it. Local player settings do not remove embedded data. Do not bypass the guard or distribute the binary as cleared. ROM building and local playtesting can still be performed, subject to component usage terms.
