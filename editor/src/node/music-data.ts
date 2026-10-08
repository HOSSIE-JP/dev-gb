import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {importMidiMusic} from "./midi-music";

import { musicErrors, type ArrangedSong, type MusicTrack } from "../shared/music-score";
import type { UgeMusicTrack } from "../shared/model";
import { exportUgeSongs } from "./uge-export";
export type { ArrangedSong, MusicBar } from "../shared/music-score";

/** Source notation lives with the engine so standalone project copies can build.
 * Only this converter writes generated C; each score can be autobanked separately. */
export function generateMusic(root: string, target: string, midiManifest?: string, edited: MusicTrack[] = [], uge: UgeMusicTrack[] = []): string[] {
    const projectAssets=path.resolve(root,"assets-src");
    let repoRoot=root;
    while(!fs.existsSync(path.join(repoRoot,"engine/caravan/assets-src/kouma-score.json")) && path.dirname(repoRoot)!==repoRoot) repoRoot=path.dirname(repoRoot);
    if(!fs.existsSync(path.join(repoRoot,"engine/caravan/assets-src/kouma-score.json")))throw Error("Repository engine music source was not found");
    const score = JSON.parse(
        fs.readFileSync(
            path.join(repoRoot, "engine/caravan/assets-src/kouma-score.json"),
            "utf8",
        ),
    );
    const side = JSON.parse(
        fs.readFileSync(
            path.join(repoRoot, "engine/caravan/assets-src/side-score.json"),
            "utf8",
        ),
    );
    if (
        side.format !== "caravan-banked-score-v1" ||
        !Array.isArray(side.tracks) ||
        side.tracks.length !== 3
    )
        throw Error("Invalid SIDE CARAVAN soundtrack");
    const errors = musicErrors(edited);
    if (errors.length) throw Error(errors.join("\n"));
    const imported = midiManifest ? importMidiMusic(midiManifest) : [];
    const overrides = [...edited, ...imported];
    const ugeIds = new Set(uge.map(t=>t.id));
    const tracks: ArrangedSong[] = [...score.tracks, ...side.tracks]
        .map(t => overrides.find(o => o.id === t.id) ?? t)
        .filter(t => !ugeIds.has(t.id));
    if (
        score.format !== "caravan-banked-score-v1" ||
        !Array.isArray(tracks) ||
        tracks.length !== 22 - ugeIds.size
    )
        throw Error("Invalid banked soundtrack");
    const sources: string[] = [],
        decls: string[] = [],
        rows: string[] = [];
    fs.mkdirSync(target, { recursive: true });
    for (const t of tracks) {
        if (
            t.id<16 || t.id>37 ||
            !Number.isInteger(t.speed) ||
            t.speed < 1 ||
            t.speed > 60 ||
            (t.speedHalf !== undefined && typeof t.speedHalf !== "boolean") ||
            typeof t.loop !== "boolean" ||
            !Array.isArray(t.bars) ||
            !t.bars.length ||
            t.bars.length > 64
        )
            throw Error("Invalid song timing or ID");
        const data: number[] = [];
        const three = t.bars[0].counter !== undefined;
        for (const b of t.bars) {
            if ((b.counter !== undefined) !== three) throw Error("Mixed two/three voice bars");
            if (
                ![0, 64, 128, 192].includes(b.duty) ||
                !Number.isInteger(b.envelope) ||
                b.envelope < 16 ||
                b.envelope > 255 ||
                ![32, 64, 96].includes(b.level) ||
                !Number.isInteger(b.wave ?? 0) ||
                (b.wave ?? 0) < 0 ||
                (b.wave ?? 0) > 7
            )
                throw Error("Invalid GB instrument");
            for (const voice of [b.lead, b.bass, ...(three ? [b.counter!] : [])]) {
                if (
                    !Array.isArray(voice) ||
                    voice.length !== 16 ||
                    voice.some(
                        (n) =>
                            !Number.isInteger(n) ||
                            (n !== 255 && (n < 0 || n > 60)),
                    )
                )
                    throw Error("Invalid GB note");
            }
            data.push(
                b.duty,
                b.envelope,
                b.level | (b.wave ?? 0),
                ...b.lead,
                ...b.bass,
            );
            if (three) {
                if (![0,64,128,192].includes(b.counterDuty!) ||
                    ![b.leadEnvelope,b.counterEnvelope,b.bassLevel].every(a=>Array.isArray(a)&&a.length===16) ||
                    [...b.leadEnvelope!,...b.counterEnvelope!].some(n=>!Number.isInteger(n)||n<0||n>255||(n>0&&n<16)) ||
                    b.bassLevel!.some(n=>![0,32,64,96].includes(n))) throw Error("Invalid three-voice expression");
                data.push(b.counterDuty!,...b.counter!,...b.leadEnvelope!,...b.counterEnvelope!,...b.bassLevel!);
            }
        }
        const symbol = `ce_score_${t.id}`,
            file = `caravan_music_${t.id}.c`;
        fs.writeFileSync(
            path.join(target, file),
            `#pragma bank 255\n#include "music.h"\nBANKREF(${symbol})\nconst uint8_t ${symbol}[]={${data.join(",")}};\n`,
        );
        sources.push(file);
        decls.push(
            `BANKREF_EXTERN(${symbol})\nextern const uint8_t ${symbol}[];`,
        );
        rows.push(
            `{BANK(${symbol}),${symbol},${t.bars.length * 16},${t.speed | (t.speedHalf ? 128 : 0)},${+t.loop},${three?100:35}}`,
        );
    }
    if (uge.length) {
        const seen = new Set<number>();
        for (const t of uge) {
            if (seen.has(t.id) || t.id < 16 || t.id > 37) throw Error("Invalid or duplicate UGE track ID");
            seen.add(t.id);
            for (const [file,expected] of [[t.eventFile,t.eventSha256],[t.ugeFile,t.ugeSha256],[t.scoreFile,t.scoreSha256]] as const) {
                const full = path.resolve(projectAssets,path.relative("assets-src",file));
                if (fs.realpathSync(full) !== full || !full.startsWith(projectAssets+path.sep)) throw Error(`Unsafe UGE path ${file}`);
                const bytes=fs.readFileSync(full), actual=cryptoSha256(bytes);
                if (actual !== expected) throw Error(`UGE SHA-256 mismatch: ${file}`);
            }
            const eventPath=path.resolve(projectAssets,path.relative("assets-src",t.eventFile)), event=JSON.parse(fs.readFileSync(eventPath,"utf8"));
            if (event.bars*16!==t.rows || event.ticks_per_row!==t.ticksPerRow || (event.end_mode ?? (event.loop_start_order === null ? "stop" : "loop"))!==t.endMode ||
                (event.loop_start_order === null ? 65535 : event.loop_start_order * 64) !== (t.loopStartRow ?? 65535))
                throw Error(`Invalid UGE event metadata: ${t.title}`);
        }
        sources.push(...exportUgeSongs(projectAssets,target,uge));
    }
    const waves: { samples: number[] }[] = JSON.parse(
        fs.readFileSync(
            path.join(repoRoot, "engine/caravan/assets-src/music-waves.json"),
            "utf8",
        ),
    ).waves;
    if (
        !Array.isArray(waves) ||
        waves.length !== 8 ||
        waves.some(
            (w) =>
                !Array.isArray(w.samples) ||
                w.samples.length !== 32 ||
                w.samples.some((n) => !Number.isInteger(n) || n < 0 || n > 15),
        )
    )
        throw Error("Invalid GB wave bank");
    const waveData = waves
        .map(
            (w) =>
                `{${Array.from({ length: 16 }, (_, i) => (w.samples[i * 2] << 4) | w.samples[i * 2 + 1]).join(",")}}`,
        )
        .join(",");
    fs.writeFileSync(
        path.join(target, "caravan_music_index.c"),
        `#pragma bank 2\n#include "music.h"\n${decls.join("\n")}\nconst CE_MusicScore ce_music_scores[22]={${Array.from({length:22},(_,i)=>{const id=16+i,at=tracks.findIndex(t=>t.id===id);return at<0?"{0,0,0,0,0,0}":rows[at]}).join(",")}};\nconst uint8_t ce_music_waves[8][16]={${waveData}};\n`,
    );
    sources.push("caravan_music_index.c");
    return sources;
}
function cryptoSha256(data:Buffer){return createHash("sha256").update(data).digest("hex");}
