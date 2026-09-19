import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const root = path.resolve(import.meta.dirname, "../.."),
    lib = createRequire(import.meta.url)("../build/library.cjs");
const base = path.join(root, "projects/touhou-kouma/assets-src/midi_gb"),
    bytes = fs.readFileSync(path.join(base, "th06_02_gb3.mid"));
const temp = () => fs.mkdtempSync(path.join(root, ".cache/music-editor-test-"));
test("piano roll moves cross-bar notes, preserves expression and other voices, resizes and deletes monophonically", () => {
    const song = lib.newMusicTrack(16);
    lib.writeMusicNote(song, 0, 14, 37, 6, 128);
    song.bars[1].leadEnvelope[1] = 96;
    lib.writeMusicNote(song, 1, 12, 25, 10, 64);
    const counter = song.bars.map((b) => [...b.counter]);
    assert.deepEqual(lib.pianoNotes(song, 0), [
        { start: 14, length: 6, pitch: 37, volume: 128 },
    ]);
    lib.updatePianoNote(song, 0, 14, {
        start: 30,
        length: 8,
        pitch: 39,
        volume: 128,
    });
    assert.deepEqual(lib.pianoNotes(song, 0), [
        { start: 30, length: 8, pitch: 39, volume: 128 },
    ]);
    assert.equal(song.bars[2].leadEnvelope[1], 96);
    assert.deepEqual(
        song.bars.map((b) => b.counter),
        counter,
    );
    lib.updatePianoNote(song, 0, null, {
        start: 32,
        length: 2,
        pitch: 42,
        volume: 144,
    });
    assert.deepEqual(
        lib.pianoNotes(song, 0).map((n) => [n.start, n.length, n.pitch]),
        [
            [30, 2, 39],
            [32, 2, 42],
            [34, 4, 39],
        ],
    );
    lib.updatePianoNote(song, 0, 32, null);
    assert.deepEqual(lib.musicErrors([song]), []);
    const before = structuredClone(song);
    assert.throws(() =>
        lib.updatePianoNote(song, 0, 30, {
            start: 62,
            length: 4,
            pitch: 39,
            volume: 128,
        }),
    );
    assert.deepEqual(song, before);
});
function settings(data = bytes) {
    const { info } = lib.readMidi(data, "test.mid");
    return {
        id: 16,
        title: "Imported",
        startBeat: 0,
        bars: Math.min(64, Math.ceil(info.beats / 4)),
        bpm: info.bpm,
        lanes: [...info.lanes.map((l) => l.key), "", ""].slice(0, 3),
        octaves: [0, 0, 0],
        overlap: "reject",
    };
}
function smf(events, ppq = 96) {
    const h = Buffer.alloc(14);
    h.write("MThd");
    h.writeUInt32BE(6, 4);
    h.writeUInt16BE(1, 10);
    h.writeUInt16BE(ppq, 12);
    const body = Buffer.from(events),
        t = Buffer.alloc(8);
    t.write("MTrk");
    t.writeUInt32BE(body.length, 4);
    return Buffer.concat([h, t, body]);
}

test("all fourteen registered MIDI files convert reproducibly through the editor without changing compiled note grids", () => {
    const imported = lib.readProjectMusic(root, "touhou-kouma");
    assert.equal(imported.tracks.length, 14);
    assert.equal(imported.waves.length, 8);
    for (const original of imported.tracks) {
        const file = original.source.name,
            data = fs.readFileSync(path.join(base, file)),
            o = { ...settings(data), id: original.id, title: original.title };
        const a = lib.convertMidi(data, file, o),
            b = lib.convertMidi(data, file, o);
        assert.deepEqual(a, b);
        assert.equal(a.speed, original.speed);
        assert.equal(!!a.speedHalf, !!original.speedHalf);
        for (const key of [
            "lead",
            "counter",
            "bass",
            "leadEnvelope",
            "counterEnvelope",
            "bassLevel",
        ])
            assert.deepEqual(
                a.bars.flatMap((b) => b[key]),
                original.bars.flatMap((b) => b[key]),
                `${file} ${key}`,
            );
    }
});
test("SMF0, alternate PPQ, running status, explicit chord selection and octave adjustment work; malformed inputs fail", () => {
    const data = smf([
            0, 0x90, 60, 100, 0, 64, 80, 48, 0x80, 60, 0, 0, 64, 0, 0, 0xff,
            0x2f, 0,
        ]),
        o = settings(data);
    assert.throws(() => lib.convertMidi(data, "chord.mid", o), /重なります/);
    const high = lib.convertMidi(data, "chord.mid", { ...o, overlap: "high" }),
        low = lib.convertMidi(data, "chord.mid", {
            ...o,
            overlap: "low",
            octaves: [1, 0, 0],
        });
    assert.deepEqual(high.bars[0].lead.slice(0, 3), [29, 255, 0]);
    assert.equal(low.bars[0].lead[0], 37);
    assert(high.source.warnings.some((w) => w.includes("重複を処理: 2")));
    assert.throws(() => lib.readMidi(data.subarray(0, -1)), /不正|途中/);
    assert.throws(
        () =>
            lib.convertMidi(data, "x.mid", { ...o, lanes: ["0:0", "0:0", ""] }),
        /異なる/,
    );
    assert.throws(
        () => lib.convertMidi(data, "x.mid", { ...o, bars: 65 }),
        /小節/,
    );
    assert.throws(
        () => lib.convertMidi(data, "x.mid", { ...o, startBeat: NaN }),
        /開始拍/,
    );
    const bad = Buffer.from(data);
    bad.writeUInt16BE(0xe728, 12);
    assert.throws(() => lib.readMidi(bad), /SMPTE/);
});
test("note duration edits, rests, cross-bar holds and transposition constraints remain valid", () => {
    const song = lib.newMusicTrack(16);
    lib.writeMusicNote(song, 0, 0, 25, 8, 128);
    lib.writeMusicNote(song, 0, 0, 27, 2, 96);
    assert.deepEqual(
        song.bars[0].lead.slice(0, 9),
        [27, 255, 0, 0, 0, 0, 0, 0, 0],
    );
    lib.writeMusicNote(song, 2, 15, 13, 4, 64);
    assert.equal(song.bars[1].bass[0], 255);
    assert.deepEqual(lib.musicErrors([song]), []);
    lib.writeMusicNote(song, 2, 16, 0, 1, 0);
    assert.equal(song.bars[1].bass[1], 13);
    assert.deepEqual(lib.musicErrors([song]), []);
    const invalid = structuredClone(song);
    invalid.bars[0].counter[0] = 255;
    assert(lib.musicErrors([invalid]).some((s) => s.includes("タイ")));
    invalid.bars[0].counter[0] = 61;
    assert(lib.musicErrors([invalid]).some((s) => s.includes("C2")));
});
test("imported source, edits, recovery, normal project save, cloning and external-conflict protection round trip", () => {
    const work = temp();
    try {
        fs.mkdirSync(path.join(work, "projects"));
        lib.createProject(
            work,
            "sample",
            "SAMPLE",
            lib.readGame(root, "star-caravan"),
        );
        const game = lib.readGame(work, "sample"),
            old = lib.revision(game),
            track = lib.importProjectMidi(
                work,
                "sample",
                bytes,
                "source.mid",
                settings(),
            );
        assert.deepEqual(
            fs.readFileSync(
                path.join(work, "projects/sample", track.source.file),
            ),
            bytes,
        );
        game.musicTracks = [track];
        lib.writeMusicNote(track, 0, 0, 37, 4, 192);
        game.stages[0].music = 16;
        lib.recoverGame(work, "sample", game);
        assert.equal(
            lib.recoverGame(work, "sample").musicTracks[0].bars[0].lead[0],
            37,
        );
        lib.saveGame(work, "sample", game, old);
        const reopened = lib.readGame(work, "sample");
        assert.deepEqual(reopened.musicTracks, game.musicTracks);
        assert.throws(() => lib.saveGame(work, "sample", game, old), /外部/);
        lib.createProject(work, "copy", "COPY", reopened);
        assert.deepEqual(
            fs.readFileSync(
                path.join(work, "projects/copy", track.source.file),
            ),
            bytes,
        );
        const changed = structuredClone(reopened);
        changed.musicTracks[0].source.sha256 = "0".repeat(64);
        assert.throws(
            () => lib.saveGame(work, "sample", changed, lib.revision(reopened)),
            /元MIDI/,
        );
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
});
test("editing an imported song changes only its generated bank; untouched editor overrides equal the previous build", () => {
    const work = temp();
    try {
        const catalog = lib.readProjectMusic(root, "touhou-kouma"),
            manifest = path.join(base, "import.json");
        lib.generateMusic(root, path.join(work, "before"), manifest);
        lib.generateMusic(
            root,
            path.join(work, "unchanged"),
            manifest,
            catalog.tracks,
        );
        for (const name of fs.readdirSync(path.join(work, "before")))
            assert.deepEqual(
                fs.readFileSync(path.join(work, "before", name)),
                fs.readFileSync(path.join(work, "unchanged", name)),
            );
        const edited = structuredClone(catalog.tracks[0]);
        lib.writeMusicNote(edited, 0, 0, 30, 4, 160);
        lib.generateMusic(root, path.join(work, "after"), manifest, [edited]);
        for (const name of fs.readdirSync(path.join(work, "before"))) {
            const equal = fs
                .readFileSync(path.join(work, "before", name))
                .equals(fs.readFileSync(path.join(work, "after", name)));
            assert.equal(equal, name !== `caravan_music_${edited.id}.c`);
        }
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
});
test("edited fanfare validation accepts nonloop custom IDs and rejects looping overrides of old fanfare IDs", () => {
    const game = lib.readGame(root, "star-caravan");
    game.bossCelebration = true;
    game.music = { title: 1, boss: 5, clear: 6, gameover: 7, victory: 16 };
    const song = lib.newMusicTrack(16);
    song.loop = false;
    game.musicTracks = [song];
    assert(
        !lib
            .validate(game)
            .some((d) => d.target === "music" && d.severity === "error"),
    );
    song.loop = true;
    assert(
        lib
            .validate(game)
            .some((d) => d.target === "music" && d.severity === "error"),
    );
    song.id = 29;
    game.music.victory = 29;
    assert(
        lib
            .validate(game)
            .some((d) => d.target === "music" && d.severity === "error"),
    );
});
