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
    const ugeTracks = (game.musicUgeTracks ?? []).map(t => {
        const eventPath = safePath(dir, t.eventFile), ugePath = safePath(dir, t.ugeFile), scorePath = safePath(dir, t.scoreFile);
        if (hash(fs.readFileSync(eventPath)) !== t.eventSha256 || hash(fs.readFileSync(ugePath)) !== t.ugeSha256 || hash(fs.readFileSync(scorePath)) !== t.scoreSha256)
            throw new Error(`UGE source SHA-256 mismatch for track ${t.id}: ${t.title}`);
        const events = JSON.parse(fs.readFileSync(eventPath, "utf8"));
        const tempos: number[] = [...new Set<number>([t.ticksPerRow, ...events.events.filter((e: any) => e.effect === 15).map((e: any) => e.param)])].sort((a,b)=>a-b);
        return {id:t.id,title:t.title,rows:t.rows,endMode:t.endMode,ticksPerRow:t.ticksPerRow,tempos,loopStartRow:t.loopStartRow===65535?null:t.loopStartRow,eventCount:events.events.length,sha256:t.ugeSha256};
    });
    return {
        tracks: tracks.sort((a, b) => a.id - b.id),
        ugeTracks,
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
