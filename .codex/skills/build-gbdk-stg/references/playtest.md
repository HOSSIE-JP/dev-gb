# Playtest delivery

The canonical artifact is the compiled `.gb`. The web player executes those same bytes with the repository-pinned Boytacean WASM, not Simulation.ts. Emulator source/license: [Boytacean](https://github.com/joamag/boytacean). Preserve its supplied notices and the game's/font/toolchain notices in distribution.

`node scripts/export-playtest.cjs REPO ROM.gb OUTPUT.html "DISPLAY TITLE" --acknowledge-redistribution`

The exporter bundles installed JavaScript, WASM and ROM into one standalone HTML; no CDN or ROM fetch is needed. It includes keyboard/touch controls, DMG/GBC selection, pause, audio opt-in, ROM download and SRAM import/export. ROM and HTML SHA-256 are written to the adjacent `.html.json` manifest. `tested:false` means export alone does not prove playback: add actual QA evidence separately.

Open the HTML in a real browser and check:
- Both modes reach the title, START starts gameplay, Z/X and arrow keys work. Mobile buttons allow simultaneous direction/fire.
- Pause/blur releases input and queued audio. Explicit resume works. Slow host callbacks do not cause batches of unseen frames.
- Audio starts only from a gesture; the player's recorded output remains actual ROM audio. Errors must be surfaced.
- ROM download hash equals the Release ROM. Export SRAM, reload/import, reboot and observe rankings. Wrong SRAM sizes are rejected; game-side CRC/project identity handles incompatible same-sized saves.
- 360px and desktop layouts fit. Preserve 160×144 aspect ratio and nearest-neighbor pixels.

LocalStorage may be denied or ephemeral for `file:` URLs and chat sandboxes. The player reports failure and still supports manual saves. Its save namespace is the ROM hash; revised ROMs require manual export/import, which prevents accidentally mixing unrelated games. The editor's own project-based save behavior is independent.

## Chat surface decision

Do not assume an arbitrary HTML attachment runs inline. At execution time inspect available visualization/hosting skills and their contract: fragment vs full document, size, WASM compilation, CSP, keyboard focus, audio gesture, download blobs, storage, permitted resource URLs. A full offline player may exceed the inline size budget, especially for larger ROMs. Do not trim licenses or substitute another game to fit.

If native HTML embedding allows it, adapt a copy to that fragment contract and test it there. Otherwise return downloadable HTML and ROM. If a hosted page is requested and a hosting integration is available, follow that workflow; do not promise public publication without the user's authorization. A local HTTP server is useful for automated QA but is not a user-accessible deployed link.

## Recording for later trailer

After game approval, capture actual gameplay of the approved ROM with normal controls or a replayed input sequence. Prefer lossless frame output at 160×144 plus emulator PCM, or canvas/WebAudio capture. Preserve repeated display frames during slowdown; do not speed up the game by dropping them. Retain the exact ROM hash, input log and capture timestamps. DOM/headless screenshots without audio are not an audiovisual trailer.

For deterministic raw capture, use the repository clock helper per display interval, `frame_buffer_eager()` for RGB, and `audio_buffer_eager(true)` plus audio_channels()/audio_sampling_rate() for PCM. Encode with ffmpeg at the actual emulated display cadence, then derive the requested delivery frame rate. Adapt navigation to the authored game; do not fabricate boss kills or patch invulnerability in footage represented as normal play.


A repeatable normal-input capture helper is included:

```text
node scripts/capture-rom.mjs REPO ROM.gb WORKFLOW.json INPUT.json NEW_OUTPUT_DIR
```

`INPUT.json` example: `{"mode":"cgb","warmupFrames":240,"frameCount":1800,"events":[{"frame":0,"keys":["Start","A"]},{"frame":8,"keys":["A"]},{"frame":300,"keys":["A","Left"]},{"frame":330,"keys":["A"]}]}`.
Each event replaces the held key set and times use display frames after warmup, not logical game updates. It checks the approval record, writes real RGB/PCM, then uses ffmpeg to produce gameplay.mp4 plus capture.json. A fresh output directory is required. This is a clip source; compose the trailer separately. Choose inputs that actually reach the intended scene; the helper does not auto-clear bosses. Keep the full input log and cut selected segments in the editor/ffmpeg. It does not record a user session automatically.

## PCM normalization (Boytacean 0.13.2)

The signed Int16Array container does not imply full-scale 16-bit PCM: the APU sums four 0–15 channel outputs and high-pass filters that small integer sum. The player divides by 64; capture multiplies by 512 to encode s16le, with clipping guards. Dividing these raw values by 32768 made a measured clip almost inaudible. See the pinned emulator's [APU source](https://github.com/joamag/boytacean/blob/0.13.2/src/apu.rs). Helpers reject an unreviewed emulator version; recheck source and an actual PCM level measurement before updating that guard. This correction belongs to the supplied standalone player/capture helper and is not a claim that the existing Electron audio path was changed.

## Distribution prerequisite

The pinned Boytacean 0.13.2 npm WASM includes original DMG bootstrap data. `export-playtest.cjs` requires explicit acknowledgement via `--acknowledge-redistribution` and reports known firmware findings. Read the checkout’s `docs/licensing.md` and explain the redistribution implications before using this option; existing explicit session acknowledgement applies. Acknowledgement grants no rights and does not remove responsibility. Passing a known-byte check alone is not license clearance for a replacement build. Preserve all runtime and boot-ROM notices.
