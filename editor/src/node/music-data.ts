import fs from "node:fs";
import path from "node:path";

export type MusicBar = {
    section: string;
    chord: string;
    duty: number;
    envelope: number;
    level: number;
    lead: number[];
    bass: number[];
};
export type ArrangedSong = {
    id: number;
    key: string;
    title: string;
    speed: number;
    loop: boolean;
    bars: MusicBar[];
};

/** Source notation lives with the engine so standalone project copies can build.
 * Only this converter writes generated C; each score can be autobanked separately. */
export function generateMusic(root: string, target: string): string[] {
    const score = JSON.parse(
        fs.readFileSync(
            path.join(root, "engine/caravan/assets-src/kouma-score.json"),
            "utf8",
        ),
    );
    const tracks: ArrangedSong[] = score.tracks;
    if (
        score.format !== "caravan-banked-score-v1" ||
        !Array.isArray(tracks) ||
        tracks.length !== 19
    )
        throw Error("Invalid banked soundtrack");
    const sources: string[] = [],
        decls: string[] = [],
        rows: string[] = [];
    fs.mkdirSync(target, { recursive: true });
    for (const [index, t] of tracks.entries()) {
        if (
            t.id !== 16 + index ||
            !Number.isInteger(t.speed) ||
            t.speed < 1 ||
            t.speed > 60 ||
            typeof t.loop !== "boolean" ||
            !Array.isArray(t.bars) ||
            !t.bars.length ||
            t.bars.length > 64
        )
            throw Error("Invalid song timing or ID");
        const data: number[] = [];
        for (const b of t.bars) {
            if (
                ![0, 64, 128, 192].includes(b.duty) ||
                !Number.isInteger(b.envelope) ||
                b.envelope < 16 ||
                b.envelope > 255 ||
                ![32, 64, 96].includes(b.level)
            )
                throw Error("Invalid GB instrument");
            for (const voice of [b.lead, b.bass]) {
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
            data.push(b.duty, b.envelope, b.level, ...b.lead, ...b.bass);
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
            `{BANK(${symbol}),${symbol},${t.bars.length * 16},${t.speed},${+t.loop}}`,
        );
    }
    fs.writeFileSync(
        path.join(target, "caravan_music_index.c"),
        `#pragma bank 2\n#include "music.h"\n${decls.join("\n")}\nconst CE_MusicScore ce_music_scores[]={${rows.join(",")}};\n`,
    );
    sources.push("caravan_music_index.c");
    return sources;
}
