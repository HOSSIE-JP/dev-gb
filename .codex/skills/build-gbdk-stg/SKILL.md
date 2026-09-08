---
name: build-gbdk-stg
description: Create and revise original Game Boy/Game Boy Color shooting games with HOSSIE-JP/dev-gb Caravan Editor from user-supplied parameters, deliver tested ROMs and browser playtests, and produce packaging and promotional video after the user approves the game. Use for this GBDK editor workflow, not GB Studio projects.
---

# GBDK STG production workflow

Use the actual editable project and C engine in `HOSSIE-JP/dev-gb`. Do not substitute a JavaScript remake for the ROM or claim GB Studio compatibility. Respond in the user's language; examples below are Japanese.

## Start or resume

1. Read the repository's AGENTS.md and `references/engine.md`. Locate the current checkout or obtain it through available Git/GitHub tools. Record the repository revision. Follow pinned setup rather than modifying `.tools` or inventing a compiler download.
2. Convert the user's prompt into `brief.json` using `references/parameters.md`. Respect supplied values. Fill routine gaps with explicit defaults; ask only for materially blocking decisions. Do not require the user to fill a form or approve every parameter.
3. For a continuing project, load its existing brief, editable assets, feedback and `workflow.json`. Preserve its project ID and save identity. Never regenerate over user edits. Do not depend on files or paths from another chat's scratch storage.

## Author and validate

- `scripts/scaffold.cjs REPO BRIEF.json` creates an independent editor project from an installed template and preserves a brief. It is scaffolding, not finished creative work. Existing project IDs are refused.
- Design original enemy formations, stage progression, boss phases, scenery, sprites, title/result screens and music to satisfy the brief. More stages than the template initially repeat source stages: replace those repetitions before declaring the game authored. Replace any baked-in template title/branding in PNGs as well as JSON text. Retain legitimate third-party notices.
- Read `references/engine.md` before editing. Source of truth is `assets-src/game.json` plus source PNGs, never generated C. Use the editor's load/save/validate/compiler functions; preserve stable IDs and revision checks. Reopen saved projects to confirm editability.
- Compile real GBDK Debug and Release ROMs. Run applicable regression gates and DMG/CGB ROM checks. Test actual authored gameplay, each boss, transitions, death/respawn, result and SRAM reboot. Shortened fixtures help isolate bugs but are not evidence of an unmodified full-game clear. Document unsupported hardware/GUI checks accurately.
- Profile high-load sections before optimizing. Preserve the engine's completed-pose OAM transfer wait and the host's one-display-frame-per-paint policy. Slow progression is preferable to invisible catch-up. Do not promise zero slowdown.

## Deliver a playtest, then iterate

Read `references/playtest.md`. Deliver a versioned ROM with SHA-256, controls, changes and known limits. Check the checkout’s `docs/licensing.md` before exporting a player. The pinned WASM has a distribution blocker; do not bypass the check. When a rights-cleared emulator build is available, export the **same bytes** into a browser player using `scripts/export-playtest.cjs REPO ROM.gb OUTPUT.html [TITLE]`. Verify boot, input, pause, audio and save export/import in a browser. Return a downloadable file; use the available file-delivery/Library workflow when required.

Conversation-embedded play is conditional: check the host's current HTML/WASM/audio/storage contract. If permitted, test the exact embedded artifact before presenting it. If not, deliver the standalone HTML, or use an available hosting workflow when the user authorizes hosting. Do not claim an ordinary Markdown link executes HTML inside ChatGPT. Do not bypass size/CSP/network restrictions. A preview simulator is not a replacement for the exported real-ROM test.

Ask the user to play the provided revision and report feedback. Incorporate changes, rebuild, and replace the playtest artifact. Record each ROM hash and feedback in `workflow.json`. This is a requested human playtest milestone, not permission to stop before a testable ROM exists.

## Completion and release materials

Read `references/release.md` only when relevant. When the user clearly judges the game complete, record their decision and the exact approved ROM hash. Tests passing alone never counts as user approval. A later ROM change invalidates the previous approval for release production.

Then produce the requested original cartridge box dieline, cartridge label and promotional video. Use the approved ROM's actual gameplay and audio for promotional gameplay footage. Do not invent console footage, a release date, platform certification, store availability or a commercial publisher. Preserve any existing authorization to create these materials; do not ask again after game approval unless a new material decision is necessary.

Deliver editable game source, the approved ROM, playtest HTML, production PDFs/images, promotional MP4 and a manifest with versions, hashes and verification limits. Use Git to persist skill/source changes when applicable; publish/push/host only within the user's authorization. Do not infer approval to send messages or post advertising.

## Supporting files

- `references/parameters.md`: prompt examples, defaults and brief format.
- `references/engine.md`: verified repository entry points and GB constraints.
- `references/playtest.md`: offline player, chat embedding limits, save handling and tests.
- `references/release.md`: approval record, print geometry and real-footage trailer workflow.
- `assets/player.js`: bundled by the web-export helper; not a game simulation.
