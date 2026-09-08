import React from "react";
import { Field } from "./fields";
import { MUSIC_TRACKS, SILENT_SOUNDTRACK, type Soundtrack } from "../shared/music";

export function MusicField({
    label = "ステージBGM",
    value,
    onChange,
}: {
    label?: string;
    value?: number;
    onChange: (track: number) => void;
}) {
    return (
        <Field label={label}>
            <select
                aria-label={label}
                value={value ?? 0}
                onChange={(event) => onChange(Number(event.target.value))}
            >
                {MUSIC_TRACKS.map((track) => (
                    <option key={track.id} value={track.id}>{track.label}</option>
                ))}
            </select>
        </Field>
    );
}

export function SoundtrackFields({
    value,
    onChange,
}: {
    value?: Soundtrack;
    onChange: (soundtrack: Soundtrack) => void;
}) {
    const soundtrack = value ?? SILENT_SOUNDTRACK;
    return (
        <details open>
            <summary>BGM</summary>
            <div className="form">
                {([
                    ["title", "タイトル・スコア画面"],
                    ["boss", "ボス戦"],
                    ["clear", "クリア"],
                    ["gameover", "ゲームオーバー"],
                ] as const).map(([key, label]) => (
                    <MusicField
                        key={key}
                        label={label}
                        value={soundtrack[key]}
                        onChange={(track) => onChange({ ...soundtrack, [key]: track })}
                    />
                ))}
            </div>
        </details>
    );
}
