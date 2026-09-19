/** Editable, deterministic GB notation. 0 = rest, 255 = tie, 1..60 = C2..B6. */
export type MusicBar = {
    section: string;
    chord: string;
    duty: number;
    envelope: number;
    level: number;
    wave?: number;
    lead: number[];
    bass: number[];
    counter?: number[];
    counterDuty?: number;
    leadEnvelope?: number[];
    counterEnvelope?: number[];
    bassLevel?: number[];
};
export type ArrangedSong = {
    id: number;
    key: string;
    title: string;
    speed: number;
    speedHalf?: boolean;
    loop: boolean;
    bars: MusicBar[];
};
export type MidiLane = {
    key: string;
    name: string;
    count: number;
    min: number;
    max: number;
};
export type MidiInfo = {
    name: string;
    sha256: string;
    ppq: number;
    beats: number;
    bpm: number;
    lanes: MidiLane[];
    warnings: string[];
};
export type MidiOptions = {
    id: number;
    title: string;
    startBeat: number;
    bars: number;
    bpm: number;
    lanes: string[];
    octaves: number[];
    overlap: "reject" | "high" | "low" | "latest";
};
export type MusicTrack = ArrangedSong & {
    source?: {
        file: string;
        name: string;
        sha256: string;
        converter?: string;
        options?: MidiOptions;
        warnings: string[];
    };
};
export const MUSIC_HZ = 4194304 / 70224;
export const MUSIC_VOICES = ["lead", "counter", "bass"] as const;
export const MUSIC_LEVELS = [
    "leadEnvelope",
    "counterEnvelope",
    "bassLevel",
] as const;
export const noteName = (n: number) =>
    n === 0
        ? "休符"
        : n === 255
          ? "タイ"
          : `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][(n + 35) % 12]}${Math.floor((n + 35) / 12) - 1}`;
export const musicBpm = (song: ArrangedSong) =>
    (MUSIC_HZ * 15) / (song.speed + (song.speedHalf ? 0.5 : 0));
export function setMusicBpm(song: ArrangedSong, bpm: number) {
    const frames = Math.max(
        1,
        Math.min(60, Math.round((MUSIC_HZ * 30) / bpm) / 2),
    );
    song.speed = Math.floor(frames);
    song.speedHalf = frames % 1 !== 0;
}
export function emptyMusicBar(): MusicBar {
    const z = () => Array<number>(16).fill(0);
    return {
        section: "",
        chord: "",
        duty: 128,
        envelope: 128,
        level: 64,
        wave: 0,
        counterDuty: 64,
        lead: z(),
        counter: z(),
        bass: z(),
        leadEnvelope: z(),
        counterEnvelope: z(),
        bassLevel: z(),
    };
}
export function newMusicTrack(id: number): MusicTrack {
    return {
        id,
        key: `custom_${id}`,
        title: `新しい曲 ${id}`,
        speed: 8,
        speedHalf: false,
        loop: true,
        bars: Array.from({ length: 4 }, emptyMusicBar),
    };
}
/** Expand two-voice defaults for editing without changing sounding notes or instruments. */
export function editableMusicTrack(input: MusicTrack): MusicTrack {
    const song = structuredClone(input);
    let lead = 0,
        bass = 0;
    for (const b of song.bars) {
        b.counter ??= Array(16).fill(0);
        b.counterDuty ??= 64;
        b.leadEnvelope ??= b.lead.map((n) => {
            if (n !== 255) lead = n;
            return lead ? b.envelope : 0;
        });
        b.counterEnvelope ??= Array(16).fill(0);
        b.bassLevel ??= b.bass.map((n) => {
            if (n !== 255) bass = n;
            return bass ? b.level : 0;
        });
    }
    return song;
}
/** Shape and musical constraints are checked before IPC writes and compilation. */
export function musicErrors(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > 22)
        return ["編集曲は最大22曲です"];
    const errors: string[] = [],
        ids = new Set<number>();
    for (const s of value) {
        const fail = (m: string) => errors.push(`曲${s?.id ?? "?"}: ${m}`);
        if (
            !s ||
            !Number.isInteger(s.id) ||
            s.id < 16 ||
            s.id > 37 ||
            ids.has(s.id)
        ) {
            fail("曲番号は16〜37、重複なしにしてください");
            continue;
        }
        ids.add(s.id);
        if (
            typeof s.title !== "string" ||
            !s.title.trim() ||
            s.title.length > 120 ||
            typeof s.key !== "string" ||
            s.key.length > 128
        )
            fail("曲名・識別名が不正です");
        if (
            !Number.isInteger(s.speed) ||
            s.speed < 1 ||
            s.speed > 60 ||
            (s.speedHalf !== undefined && typeof s.speedHalf !== "boolean") ||
            typeof s.loop !== "boolean"
        )
            fail("テンポまたはループ指定が不正です");
        if (!Array.isArray(s.bars) || s.bars.length < 1 || s.bars.length > 64) {
            fail("1〜64小節にしてください");
            continue;
        }
        const held = [0, 0, 0],
            three = s.bars[0]?.counter !== undefined;
        for (const [index, b] of s.bars.entries()) {
            if (
                !b ||
                typeof b.section !== "string" ||
                typeof b.chord !== "string" ||
                b.section.length > 120 ||
                b.chord.length > 120 ||
                ![0, 64, 128, 192].includes(b.duty) ||
                !Number.isInteger(b.envelope) ||
                b.envelope < 16 ||
                b.envelope > 255 ||
                ![32, 64, 96].includes(b.level) ||
                !Number.isInteger(b.wave ?? 0) ||
                (b.wave ?? 0) < 0 ||
                (b.wave ?? 0) > 7
            ) {
                fail(`${index + 1}小節の音色が不正です`);
                continue;
            }
            if (
                (b.counter !== undefined) !== three ||
                (three && ![0, 64, 128, 192].includes(b.counterDuty))
            ) {
                fail("声数・副旋律の音色が不正です");
                continue;
            }
            for (const [v, key] of MUSIC_VOICES.entries()) {
                if (v === 1 && !three) continue;
                const notes = b[key],
                    levels = b[MUSIC_LEVELS[v]];
                if (
                    !Array.isArray(notes) ||
                    notes.length !== 16 ||
                    notes.some(
                        (n: unknown) =>
                            !Number.isInteger(n) ||
                            (n !== 255 && (Number(n) < 0 || Number(n) > 60)),
                    )
                ) {
                    fail(`${index + 1}小節: 音符は16ステップ、C2〜B6です`);
                    continue;
                }
                if (
                    three &&
                    (!Array.isArray(levels) ||
                        levels.length !== 16 ||
                        levels.some((n: unknown) =>
                            v === 2
                                ? ![0, 32, 64, 96].includes(Number(n))
                                : !Number.isInteger(n) ||
                                  Number(n) < 0 ||
                                  Number(n) > 240 ||
                                  Number(n) % 16 !== 0,
                        ))
                ) {
                    fail(`${index + 1}小節: 音量が不正です`);
                    continue;
                }
                notes.forEach((n: number, r: number) => {
                    if (n === 255 && !held[v])
                        fail(
                            `${index + 1}小節 ${r + 1}番: タイの前に音符がありません`,
                        );
                    if (n !== 255) held[v] = n;
                    if (three && (held[v] === 0) !== (levels[r] === 0))
                        fail(
                            `${index + 1}小節 ${r + 1}番: 音符と音量が一致しません`,
                        );
                });
            }
        }
        if (s.source) {
            const p = s.source;
            if (
                typeof p.file !== "string" ||
                !/^assets-src\/(?:[\w-]+\/)*[\w.-]+\.mid$/.test(p.file) ||
                p.file.includes("..") ||
                typeof p.name !== "string" ||
                p.name.length > 255 ||
                !/^([a-f0-9]{64})$/.test(p.sha256) ||
                !Array.isArray(p.warnings) ||
                p.warnings.some((w: unknown) => typeof w !== "string")
            )
                fail("元MIDIの記録が不正です");
        }
    }
    return [...new Set(errors)].slice(0, 20);
}
/** Replace a row span, preserving any valid tail of a note that it interrupts. */
export function writeMusicNote(
    song: MusicTrack,
    voice: number,
    row: number,
    pitch: number,
    length: number,
    volume: number,
) {
    const key = MUSIC_VOICES[voice],
        level = MUSIC_LEVELS[voice],
        notes = song.bars.flatMap((b) => b[key]!),
        levels = song.bars.flatMap((b) => b[level]!);
    const end = Math.min(notes.length, row + Math.max(1, length));
    // Editing the start of an existing note replaces its complete old duration.
    if (notes[row] !== 255) {
        let oldEnd = row + 1;
        while (oldEnd < notes.length && notes[oldEnd] === 255) oldEnd++;
        for (let r = row; r < oldEnd; r++) {
            notes[r] = 0;
            levels[r] = 0;
        }
    }
    let previous = 0;
    for (let r = 0; r <= end && r < notes.length; r++)
        if (notes[r] !== 255) previous = notes[r];
    if (end < notes.length && notes[end] === 255) {
        notes[end] = previous;
        if (!previous) levels[end] = 0;
    }
    for (let r = row; r < end; r++) {
        notes[r] = pitch ? (r === row ? pitch : 255) : 0;
        levels[r] = pitch ? volume : 0;
    }
    song.bars.forEach((b, i) => {
        b[key] = notes.slice(i * 16, i * 16 + 16);
        b[level] = levels.slice(i * 16, i * 16 + 16);
    });
}
export function repairMusicTies(song: MusicTrack) {
    for (const [v, key] of MUSIC_VOICES.entries()) {
        let held = 0;
        for (const b of song.bars)
            for (let r = 0; r < 16; r++) {
                const notes = b[key]!,
                    levels = b[MUSIC_LEVELS[v]]!;
                if (notes[r] === 255 && !held) {
                    notes[r] = 0;
                    levels[r] = 0;
                }
                if (notes[r] !== 255) held = notes[r];
            }
    }
}

export type PianoNote = {
    start: number;
    length: number;
    pitch: number;
    volume: number;
};
/** Join ties across bar boundaries into draggable notes. */
export function pianoNotes(song: MusicTrack, voice: number): PianoNote[] {
    const notes = song.bars.flatMap(
        (b) => b[MUSIC_VOICES[voice]] ?? Array(16).fill(0),
    );
    const levels = song.bars.flatMap(
        (b) =>
            b[MUSIC_LEVELS[voice]] ??
            Array(16).fill(voice === 2 ? b.level : b.envelope),
    );
    const result: PianoNote[] = [];
    for (let r = 0; r < notes.length; r++) {
        if (!notes[r] || notes[r] === 255) continue;
        let length = 1;
        while (notes[r + length] === 255) length++;
        result.push({ start: r, length, pitch: notes[r], volume: levels[r] });
    }
    return result;
}
/** One monophonic edit, preserving the moved note's per-step expression. */
export function updatePianoNote(
    song: MusicTrack,
    voice: number,
    originalStart: number | null,
    next: PianoNote | null,
) {
    if (!Number.isInteger(voice) || voice < 0 || voice > 2)
        throw Error("声部が不正です");
    const total = song.bars.length * 16;
    if (
        next &&
        (!Number.isInteger(next.start) ||
            !Number.isInteger(next.length) ||
            !Number.isInteger(next.pitch) ||
            next.start < 0 ||
            next.length < 1 ||
            next.start + next.length > total ||
            next.pitch < 1 ||
            next.pitch > 60 ||
            (voice === 2
                ? ![32, 64, 96].includes(next.volume)
                : !Number.isInteger(next.volume) ||
                  next.volume < 16 ||
                  next.volume > 240 ||
                  next.volume % 16))
    )
        throw Error("音符の範囲・長さ・音量が不正です");
    const old =
        originalStart === null
            ? undefined
            : pianoNotes(song, voice).find((n) => n.start === originalStart);
    if (originalStart !== null && !old)
        throw Error("移動元の音符が見つかりません");
    const expression = old
        ? song.bars
              .flatMap((b) => b[MUSIC_LEVELS[voice]]!)
              .slice(old.start, old.start + old.length)
        : [];
    if (old) writeMusicNote(song, voice, old.start, 0, old.length, 0);
    if (next) {
        writeMusicNote(
            song,
            voice,
            next.start,
            next.pitch,
            next.length,
            next.volume,
        );
        if (expression.length)
            for (let i = 0; i < next.length; i++) {
                const r = next.start + i;
                song.bars[r >> 4][MUSIC_LEVELS[voice]]![r & 15] =
                    expression[Math.min(i, expression.length - 1)];
            }
    }
}
