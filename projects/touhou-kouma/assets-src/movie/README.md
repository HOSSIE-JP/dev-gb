# OP source and assembly

User-supplied originals: `01.mp4`, `02.mp4`, `03.mp4`, `04.mp4`, `bgm.mp3`.
These source files are preserved. Their hashes and media properties are in `assembly.json`.

`opening-40s.mp4` joins the clips in numbered order. Each original is 10.125 seconds;
the complete clip is retimed to 10 seconds (1.25% faster), producing a 40-second
960x544, 24fps H.264 movie. Only `bgm.mp3` supplies the AAC audio track.

Reproduce the master with:

```powershell
.tools/node/node.exe projects/touhou-kouma/assets-src/movie/assemble.cjs PATH_TO_FFMPEG
```

Import the complete master into the existing project with:

```powershell
.tools/node/node.exe editor/build.mjs
.tools/node/node.exe editor/scripts/import-startup-movie.cjs . touhou-kouma projects/touhou-kouma/assets-src/movie/opening-40s.mp4 PATH_TO_FFMPEG 40 projects/touhou-kouma/generated/startup-movie-v40
```

The portable encoded movie is saved in `assets-src/game.json`. Intermediate PNGs,
audio and `encoding.json` are generated in the requested output directory.
ROM playback uses 400 frames, six VBlanks per frame (40.182495 seconds), with
160x96 seven-palette CGB pictures or 112x64 four-shade DMG pictures. Audio is
mono 8192Hz 4-bit PCM, time-aligned to the hardware display interval.

Source provenance: supplied by the project owner for this opening. No new
third-party distribution license is asserted for the supplied media.
