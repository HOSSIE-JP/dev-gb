import fs from "node:fs";
import path from "node:path";
import { importMidiMusic } from "./midi-music";
import {
    readGame,
    projectDir,
    safePath,
    hash,
    atomicWrite,
} from "./project-store";
import { convertMidi } from "./midi-import";
import type { MidiOptions, MusicTrack } from "../shared/music-score";

export function readProjectMusic(root: string, name: string) {
    const game = readGame(root, name),
        dir = projectDir(root, name);
    let tracks: MusicTrack[] = [];
    if (game.musicScore) {
        const file = safePath(dir, game.musicScore),
            manifest = JSON.parse(fs.readFileSync(file, "utf8"));
        tracks = importMidiMusic(file).map((t) => {
            const entry = manifest.tracks.find(
                (e: { id: number }) => e.id === t.id,
            );
            return {
                ...t,
                source: {
                    file: path.posix.join(
                        path.posix.dirname(game.musicScore!),
                        entry.file,
                    ),
                    name: entry.file,
                    sha256: entry.sha256,
                    warnings: [
                        "登録済みGB向けMIDI。音符・テンポ・強弱を既存の変換設定で読み込みました。",
                    ],
                },
            };
        });
    }
    for (const t of game.musicTracks ?? [])
        tracks = [...tracks.filter((old) => old.id !== t.id), t];
    const waves = JSON.parse(
        fs.readFileSync(
            path.join(root, "engine/caravan/assets-src/music-waves.json"),
            "utf8",
        ),
    ).waves as { name?: string; samples: number[] }[];
    return {
        tracks: tracks.sort((a, b) => a.id - b.id),
        waves: waves.map((w, i) => ({
            name: w.name ?? `波形 ${i}`,
            samples: w.samples,
        })),
    };
}
export function importProjectMidi(
    root: string,
    name: string,
    bytes: Buffer,
    filename: string,
    options: MidiOptions,
) {
    const song = convertMidi(bytes, filename, options),
        target = safePath(projectDir(root, name), song.source!.file);
    if (
        fs.existsSync(target) &&
        hash(fs.readFileSync(target)) !== song.source!.sha256
    )
        throw Error("保管先に異なる元MIDIがあります");
    if (!fs.existsSync(target)) atomicWrite(target, bytes);
    return song;
}
