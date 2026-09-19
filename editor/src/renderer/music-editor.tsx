import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Game } from "../shared/model";
import { MUSIC_TRACKS } from "../shared/music";
import {
    editableMusicTrack,
    emptyMusicBar,
    MUSIC_HZ,
    MUSIC_LEVELS,
    MUSIC_VOICES,
    musicBpm,
    musicErrors,
    newMusicTrack,
    noteName,
    repairMusicTies,
    setMusicBpm,
    writeMusicNote,
    updatePianoNote,
    type MidiInfo,
    type MidiOptions,
    type MusicBar,
    type MusicTrack,
} from "../shared/music-score";
import { MusicAudition } from "./music-audition";
import { MusicPianoRoll } from "./music-piano-roll";
import "./music-editor.css";

export type MusicCatalog = {
    tracks: MusicTrack[];
    waves: { name: string; samples: number[] }[];
};
const voiceNames = ["主旋律 · CH2", "副旋律 · CH1", "ベース · CH3"];
const noteChoices = [0, ...Array.from({ length: 60 }, (_, i) => i + 1)];
const dutyChoices = [
    [0, "12.5%"],
    [64, "25%"],
    [128, "50%"],
    [192, "75%"],
] as const;
const sourcePitch = (n: number) =>
    `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][n % 12]}${Math.floor(n / 12) - 1}`;

export function MusicEditor({
    game,
    catalog,
    change,
    disabled,
}: {
    game: Game;
    catalog: MusicCatalog;
    change: (fn: (g: Game) => void) => void;
    disabled: boolean;
}) {
    const tracks = useMemo(() => {
        const list = [...catalog.tracks];
        for (const t of game.musicTracks ?? []) {
            const at = list.findIndex((a) => a.id === t.id);
            if (at < 0) list.push(t);
            else list[at] = t;
        }
        return list.sort((a, b) => a.id - b.id);
    }, [catalog.tracks, game.musicTracks]);
    const [id, setId] = useState(0),
        [barIndex, setBar] = useState(0),
        [voice, setVoice] = useState(0),
        [row, setRow] = useState(0),
        [pitch, setPitch] = useState(25),
        [length, setLength] = useState(1),
        [volume, setVolume] = useState(8),
        [bpm, setBpm] = useState("120"),
        [message, setMessage] = useState(""),
        [busy, setBusy] = useState(false);
    const [chosen, setChosen] = useState<{
            token: string;
            info: MidiInfo;
        } | null>(null),
        [options, setOptions] = useState<MidiOptions | null>(null),
        [converted, setConverted] = useState<MusicTrack | null>(null);
    const [mask, setMask] = useState([true, true, true]),
        [repeat, setRepeat] = useState(false),
        [playing, setPlaying] = useState(false),
        [playRow, setPlayRow] = useState(-1),
        [assignment, setAssignment] = useState("title"),
        [slot, setSlot] = useState(16);
    const clipboard = useRef<MusicBar | null>(null),
        audio = useRef(new MusicAudition()),
        generation = useRef(0),
        mounted = useRef(true);
    const song = tracks.find((t) => t.id === id) ?? tracks[0],
        bar = song?.bars[Math.min(barIndex, song.bars.length - 1)],
        selectedBar = Math.min(barIndex, (song?.bars.length ?? 1) - 1);
    const stop = () => {
        audio.current.stop();
        setPlaying(false);
        setPlayRow(-1);
    };
    useEffect(() => {
        mounted.current = true;
        const halt = () => stop();
        window.addEventListener("blur", halt);
        document.addEventListener("visibilitychange", halt);
        return () => {
            mounted.current = false;
            generation.current++;
            audio.current.stop();
            window.removeEventListener("blur", halt);
            document.removeEventListener("visibilitychange", halt);
        };
    }, []);
    useEffect(() => {
        stop();
        setBpm(song ? musicBpm(song).toFixed(2) : "120");
    }, [song]);
    useEffect(() => {
        stop();
    }, [mask, repeat]);
    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setMessage("");
        try {
            await action();
        } catch (e) {
            if (mounted.current) setMessage((e as Error).message);
        } finally {
            if (mounted.current) setBusy(false);
        }
    };
    const put = (track: MusicTrack) => {
        const errors = musicErrors([track]);
        if (errors.length) {
            setMessage(errors.join("\n"));
            return;
        }
        stop();
        change((g) => {
            g.musicTracks = [
                ...(g.musicTracks ?? []).filter((t) => t.id !== track.id),
                track,
            ].sort((a, b) => a.id - b.id);
        });
        setId(track.id);
        setMessage("");
    };
    const edit = (fn: (track: MusicTrack) => void) => {
        if (!song) return;
        const copy = editableMusicTrack(song);
        fn(copy);
        put(copy);
    };
    const inspect = (v: number, r: number) => {
        setVoice(v);
        setRow(r);
        if (!song) return;
        const notes = song.bars.flatMap(
                (b) => b[MUSIC_VOICES[v]] ?? Array(16).fill(0),
            ),
            index = selectedBar * 16 + r;
        let held = 0;
        for (let i = 0; i <= index; i++) if (notes[i] !== 255) held = notes[i];
        setPitch(held);
        let count = 1;
        while (index + count < notes.length && notes[index + count] === 255)
            count++;
        setLength(count);
        const value = bar?.[MUSIC_LEVELS[v]]?.[r] ?? (v === 2 ? 64 : 128);
        setVolume(v === 2 ? value || 64 : value >> 4 || 8);
    };
    const play = async (all: boolean) => {
        if (!song) return;
        stop();
        setPlaying(true);
        setMessage("");
        try {
            await audio.current.play(
                editableMusicTrack(song),
                catalog.waves.map((w) => w.samples),
                all ? 0 : selectedBar,
                all ? song.bars.length - 1 : selectedBar,
                mask,
                repeat,
                setPlayRow,
                () => setPlaying(false),
            );
        } catch (e) {
            stop();
            setMessage((e as Error).message);
        }
    };
    const chooseMidi = () =>
        void run(async () => {
            stop();
            const result = await window.caravan.chooseMidi();
            if (!result || !mounted.current) return;
            const occupied = new Set(tracks.map((t) => t.id)),
                used = new Set([
                    game.music?.title,
                    game.music?.boss,
                    game.music?.clear,
                    game.music?.gameover,
                    game.music?.victory,
                    game.ending?.music,
                    ...game.stages.flatMap((s) => [s.music, s.bossMusic]),
                ]);
            const free =
                MUSIC_TRACKS.find(
                    (t) => t.id >= 16 && !occupied.has(t.id) && !used.has(t.id),
                )?.id ?? 16;
            const info = result.info,
                lanes = info.lanes.filter((l) => !l.key.endsWith(":9"));
            const picked = lanes.slice(0, 3);
            setChosen(result);
            setOptions({
                id: free,
                title: info.name.replace(/\.(mid|midi)$/i, ""),
                startBeat: 0,
                bars: Math.min(64, Math.max(1, Math.ceil(info.beats / 4))),
                bpm: info.bpm,
                lanes: [0, 1, 2].map((i) => picked[i]?.key ?? ""),
                octaves: [0, 0, 0],
                overlap: "reject",
            });
            setConverted(null);
        });
    const option = (next: MidiOptions) => {
        generation.current++;
        setOptions(next);
        setConverted(null);
    };
    const review = () =>
        void run(async () => {
            if (!chosen || !options) return;
            const token = ++generation.current;
            const result = await window.caravan.convertMidi(
                game.name,
                chosen.token,
                options,
                false,
            );
            if (token === generation.current && mounted.current)
                setConverted(result);
        });
    const importTrack = () =>
        void run(async () => {
            if (!chosen || !options || !converted) return;
            const existing = tracks.find((t) => t.id === options.id);
            if (
                !(await window.caravan.confirm(
                    `曲番号${options.id}を「${options.title}」で置き換えます。${existing ? `既存曲「${existing.title}」の編集内容が置き換わります。` : "この番号を使う場面の音楽も変わります。"} 続行しますか？`,
                ))
            )
                return;
            const result = await window.caravan.convertMidi(
                game.name,
                chosen.token,
                options,
                true,
            );
            if (!mounted.current) return;
            put(result);
            setBar(0);
            setChosen(null);
            setOptions(null);
            setConverted(null);
        });
    const add = () =>
        void run(async () => {
            if (
                !(await window.caravan.confirm(
                    `曲番号${slot}を空の4小節に置き換えます。この番号を使う場面も変わります。`,
                ))
            )
                return;
            put(newMusicTrack(slot));
            setBar(0);
        });
    const assign = () => {
        if (!song) return;
        change((g) => {
            if (assignment.includes(":")) {
                const [kind, stageId] = assignment.split(":");
                const stage = g.stages.find((s) => s.id === stageId)!;
                stage[kind === "road" ? "music" : "bossMusic"] = song.id;
            } else if (assignment === "ending") {
                if (g.ending) g.ending.music = song.id;
            } else {
                g.music ??= {
                    title: 0,
                    boss: 0,
                    clear: 0,
                    gameover: 0,
                    victory: 0,
                };
                g.music[assignment as keyof NonNullable<Game["music"]>] =
                    song.id;
            }
        });
        setMessage("指定した場面に割り当てました。上部の保存で確定します。");
    };
    const removeBar = () =>
        void run(async () => {
            if (!song || song.bars.length <= 1) return;
            if (
                !(await window.caravan.confirm(
                    `${selectedBar + 1}小節目を削除しますか？ 後続の小節が前に移ります。`,
                ))
            )
                return;
            edit((s) => {
                s.bars.splice(selectedBar, 1);
                repairMusicTies(s);
            });
            setBar(Math.max(0, selectedBar - 1));
        });
    const transpose = (delta: number) => {
        if (
            bar?.[MUSIC_VOICES[voice]]?.some(
                (n) =>
                    n !== 0 && n !== 255 && (n + delta < 1 || n + delta > 60),
            )
        ) {
            setMessage("C2〜B6を超えるため移調できません。");
            return;
        }
        edit((s) => {
            const b = s.bars[selectedBar];
            b[MUSIC_VOICES[voice]] = b[MUSIC_VOICES[voice]]!.map((n) =>
                n === 0 || n === 255 ? n : n + delta,
            );
        });
    };
    const locked = disabled || busy;
    return (
        <section className="music-editor" aria-label="音楽エディター">
            <p className="music-intro">
                MIDIの声部を選んで取り込み、GBの3声を編集します。変更は上部の「保存」で確定し、元に戻す・自動復旧も使えます。
            </p>
            <div className="music-toolbar">
                <button disabled={locked} onClick={chooseMidi}>
                    MIDIを取り込む
                </button>
                <label>
                    新規の曲番号
                    <select
                        aria-label="新規の曲番号"
                        value={slot}
                        onChange={(e) => setSlot(+e.target.value)}
                    >
                        {MUSIC_TRACKS.filter((t) => t.id >= 16).map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.id} ·{" "}
                                {tracks.find((s) => s.id === t.id)?.title ??
                                    t.label}
                            </option>
                        ))}
                    </select>
                </label>
                <button disabled={locked} onClick={add}>
                    空の曲を作る
                </button>
            </div>
            {message && (
                <p role="status" className="music-message">
                    {message}
                </p>
            )}
            {chosen && options && (
                <fieldset className="midi-import" disabled={locked}>
                    <legend>MIDI取り込み設定 · {chosen.info.name}</legend>
                    <p>
                        {chosen.info.ppq} PPQ / {chosen.info.beats.toFixed(2)}拍
                        / {chosen.info.lanes.length}
                        声部。4/4・1小節16ステップ、最大64小節に変換します。
                    </p>
                    <div className="music-controls">
                        <label>
                            曲番号
                            <select
                                aria-label="取り込み先の曲番号"
                                value={options.id}
                                onChange={(e) =>
                                    option({ ...options, id: +e.target.value })
                                }
                            >
                                {MUSIC_TRACKS.filter((t) => t.id >= 16).map(
                                    (t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.id} ·{" "}
                                            {tracks.find((s) => s.id === t.id)
                                                ?.title ?? t.label}
                                        </option>
                                    ),
                                )}
                            </select>
                        </label>
                        <label>
                            曲名
                            <input
                                aria-label="取り込み曲名"
                                maxLength={120}
                                value={options.title}
                                onChange={(e) =>
                                    option({
                                        ...options,
                                        title: e.target.value,
                                    })
                                }
                            />
                        </label>
                        <label>
                            開始拍（0始まり）
                            <input
                                aria-label="MIDI開始拍"
                                type="number"
                                min="0"
                                step="0.25"
                                value={options.startBeat}
                                onChange={(e) =>
                                    option({
                                        ...options,
                                        startBeat: +e.target.value,
                                    })
                                }
                            />
                        </label>
                        <label>
                            小節数
                            <input
                                aria-label="取り込み小節数"
                                type="number"
                                min="1"
                                max="64"
                                value={options.bars}
                                onChange={(e) =>
                                    option({
                                        ...options,
                                        bars: +e.target.value,
                                    })
                                }
                            />
                        </label>
                        <label>
                            一定テンポ BPM
                            <input
                                aria-label="取り込みBPM"
                                type="number"
                                min="15"
                                max="900"
                                value={options.bpm}
                                onChange={(e) =>
                                    option({ ...options, bpm: +e.target.value })
                                }
                            />
                        </label>
                    </div>
                    <div className="midi-lanes">
                        {voiceNames.map((name, i) => (
                            <div key={name}>
                                <label>
                                    {name}
                                    <select
                                        aria-label={`${name} 元トラック`}
                                        value={options.lanes[i]}
                                        onChange={(e) =>
                                            option({
                                                ...options,
                                                lanes: options.lanes.map(
                                                    (v, j) =>
                                                        j === i
                                                            ? e.target.value
                                                            : v,
                                                ),
                                            })
                                        }
                                    >
                                        <option value="">使用しない</option>
                                        {chosen.info.lanes.map((l) => (
                                            <option key={l.key} value={l.key}>
                                                {l.name} · {l.count}音 (
                                                {sourcePitch(l.min)}〜
                                                {sourcePitch(l.max)})
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    オクターブ移動
                                    <select
                                        aria-label={`${name} オクターブ`}
                                        value={options.octaves[i]}
                                        onChange={(e) =>
                                            option({
                                                ...options,
                                                octaves: options.octaves.map(
                                                    (v, j) =>
                                                        j === i
                                                            ? +e.target.value
                                                            : v,
                                                ),
                                            })
                                        }
                                    >
                                        {[
                                            -5, -4, -3, -2, -1, 0, 1, 2, 3, 4,
                                            5,
                                        ].map((n) => (
                                            <option key={n} value={n}>
                                                {n > 0 ? "+" : ""}
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        ))}
                    </div>
                    <label>
                        重なる音の処理
                        <select
                            aria-label="重複音の処理"
                            value={options.overlap}
                            onChange={(e) =>
                                option({
                                    ...options,
                                    overlap: e.target
                                        .value as MidiOptions["overlap"],
                                })
                            }
                        >
                            <option value="reject">
                                重複があれば取り込まず知らせる
                            </option>
                            <option value="high">
                                高い音を優先（他の音は省略）
                            </option>
                            <option value="low">
                                低い音を優先（他の音は省略）
                            </option>
                            <option value="latest">
                                後から始まった音を優先
                            </option>
                        </select>
                    </label>
                    <div className="music-toolbar">
                        <button onClick={review}>変換結果を確認</button>
                        <button disabled={!converted} onClick={importTrack}>
                            この設定で取り込む
                        </button>
                        <button
                            onClick={() => {
                                generation.current++;
                                setChosen(null);
                                setOptions(null);
                                setConverted(null);
                            }}
                        >
                            取り込みを閉じる
                        </button>
                    </div>
                    {converted && (
                        <div className="music-import-result" role="status">
                            <strong>
                                {musicBpm(converted).toFixed(2)} BPM /{" "}
                                {converted.bars.length}小節 /{" "}
                                {(
                                    (converted.bars.length *
                                        16 *
                                        (converted.speed +
                                            (converted.speedHalf ? 0.5 : 0))) /
                                    MUSIC_HZ
                                ).toFixed(1)}
                                秒
                            </strong>
                            <ul>
                                {converted.source!.warnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                            <p>
                                原曲の音色や全パートの再現、自動でのサビ選定は行いません。
                            </p>
                        </div>
                    )}
                </fieldset>
            )}
            {!song ? (
                <p className="empty-state">
                    まだ編集曲がありません。MIDIを取り込むか、空の曲を作ってください。
                </p>
            ) : (
                <>
                    <label className="music-song-select">
                        編集する曲
                        <select
                            aria-label="編集する曲"
                            value={song.id}
                            disabled={locked}
                            onChange={(e) => {
                                stop();
                                setId(+e.target.value);
                                setBar(0);
                                setMessage("");
                            }}
                        >
                            {tracks.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.id} · {t.title}
                                    {game.musicTracks?.some(
                                        (e) => e.id === t.id,
                                    )
                                        ? "（編集データ）"
                                        : "（取り込み済み）"}
                                </option>
                            ))}
                        </select>
                    </label>
                    <fieldset disabled={locked} className="music-controls">
                        <label>
                            曲名
                            <input
                                aria-label="編集曲名"
                                value={song.title}
                                maxLength={120}
                                onChange={(e) =>
                                    edit((s) => {
                                        s.title = e.target.value;
                                    })
                                }
                            />
                        </label>
                        <label>
                            テンポ BPM
                            <input
                                aria-label="編集BPM"
                                type="number"
                                min="15"
                                max="900"
                                value={bpm}
                                onChange={(e) => setBpm(e.target.value)}
                            />
                        </label>
                        <button
                            onClick={() => {
                                const n = +bpm;
                                if (n >= 15 && n <= 900)
                                    edit((s) => setMusicBpm(s, n));
                                else
                                    setMessage(
                                        "BPMは15〜900で指定してください。",
                                    );
                            }}
                        >
                            テンポを適用
                        </button>
                        <label>
                            <input
                                aria-label="曲をループ"
                                type="checkbox"
                                checked={song.loop}
                                onChange={(e) =>
                                    edit((s) => {
                                        s.loop = e.target.checked;
                                    })
                                }
                            />
                            曲をループ
                        </label>
                    </fieldset>
                    <p className="music-meta">
                        採用 {musicBpm(song).toFixed(2)} BPM ·{" "}
                        {song.speed + (song.speedHalf ? 0.5 : 0)}
                        フレーム/ステップ · {song.bars.length}小節 ·{" "}
                        {(
                            (song.bars.length *
                                16 *
                                (song.speed + (song.speedHalf ? 0.5 : 0))) /
                            MUSIC_HZ
                        ).toFixed(1)}
                        秒
                    </p>
                    <div className="music-audition">
                        <div className="music-toolbar">
                            <button
                                disabled={locked || playing}
                                onClick={() => void play(true)}
                            >
                                全曲試聴
                            </button>
                            <button
                                disabled={locked || playing}
                                onClick={() => void play(false)}
                            >
                                この小節を試聴
                            </button>
                            <button disabled={!playing} onClick={stop}>
                                試聴を停止
                            </button>
                            <label>
                                <input
                                    type="checkbox"
                                    aria-label="試聴範囲を繰り返す"
                                    checked={repeat}
                                    onChange={(e) =>
                                        setRepeat(e.target.checked)
                                    }
                                />
                                試聴範囲を繰り返す
                            </label>
                        </div>
                        <div className="music-toolbar">
                            {voiceNames.map((label, i) => (
                                <label key={label}>
                                    <input
                                        aria-label={`${label} 試聴`}
                                        type="checkbox"
                                        checked={mask[i]}
                                        onChange={(e) =>
                                            setMask(
                                                mask.map((v, j) =>
                                                    j === i
                                                        ? e.target.checked
                                                        : v,
                                                ),
                                            )
                                        }
                                    />
                                    {label}
                                </label>
                            ))}
                            <span role="status">
                                {playing ? "試聴中" : "停止中"}
                            </span>
                        </div>
                        <small>
                            簡易GB音色です。実機APUの再現ではありません。ビルドせず、現在の編集内容を再生します。
                        </small>
                    </div>
                    <div className="music-bars" aria-label="小節一覧">
                        {song.bars.map((b, i) => (
                            <button
                                key={i}
                                aria-label={`${i + 1}小節目`}
                                aria-pressed={selectedBar === i}
                                className={selectedBar === i ? "active" : ""}
                                onClick={() => {
                                    setBar(i);
                                    setRow(0);
                                }}
                            >
                                {i + 1}
                                {b.section && <small>{b.section}</small>}
                            </button>
                        ))}
                    </div>
                    {bar && (
                        <>
                            <MusicPianoRoll
                                song={song}
                                voice={voice}
                                selectedRow={selectedBar * 16 + row}
                                playRow={playRow}
                                disabled={locked}
                                onVoice={(v) => inspect(v, row)}
                                onPage={(b) => {
                                    setBar(b);
                                    setRow(0);
                                }}
                                onSelect={(v, n) => {
                                    setVoice(v);
                                    setBar(Math.floor(n.start / 16));
                                    setRow(n.start % 16);
                                    setPitch(n.pitch);
                                    setLength(n.length);
                                    setVolume(
                                        v === 2 ? n.volume : n.volume >> 4,
                                    );
                                }}
                                onEdit={(v, old, n) => {
                                    edit((s) => updatePianoNote(s, v, old, n));
                                    if (n) {
                                        setVoice(v);
                                        setBar(Math.floor(n.start / 16));
                                        setRow(n.start % 16);
                                        setPitch(n.pitch);
                                        setLength(n.length);
                                        setVolume(
                                            v === 2 ? n.volume : n.volume >> 4,
                                        );
                                    }
                                }}
                            />
                            <fieldset
                                disabled={locked}
                                className="music-bar-controls"
                            >
                                <legend>{selectedBar + 1}小節目の音色</legend>
                                <label>
                                    区間名
                                    <input
                                        aria-label="区間名"
                                        maxLength={120}
                                        value={bar.section}
                                        onChange={(e) =>
                                            edit((s) => {
                                                s.bars[selectedBar].section =
                                                    e.target.value;
                                            })
                                        }
                                    />
                                </label>
                                {[0, 1].map((v) => (
                                    <label key={v}>
                                        {voiceNames[v]}
                                        <select
                                            aria-label={`${voiceNames[v]} 音色`}
                                            value={
                                                v === 0
                                                    ? bar.duty
                                                    : (bar.counterDuty ?? 64)
                                            }
                                            onChange={(e) =>
                                                edit((s) => {
                                                    s.bars[selectedBar][
                                                        v === 0
                                                            ? "duty"
                                                            : "counterDuty"
                                                    ] = +e.target.value;
                                                })
                                            }
                                        >
                                            {dutyChoices.map(([n, label]) => (
                                                <option key={n} value={n}>
                                                    パルス {label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                ))}
                                <label>
                                    ベースの波形
                                    <select
                                        aria-label="ベースの波形"
                                        value={bar.wave ?? 0}
                                        onChange={(e) =>
                                            edit((s) => {
                                                s.bars[selectedBar].wave =
                                                    +e.target.value;
                                            })
                                        }
                                    >
                                        {catalog.waves.map((w, i) => (
                                            <option key={i} value={i}>
                                                {i} · {w.name}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </fieldset>
                            <div className="music-edit-area">
                                <div className="music-pattern">
                                    <table aria-label="3声の音符">
                                        <thead>
                                            <tr>
                                                <th>ステップ</th>
                                                {voiceNames.map((v) => (
                                                    <th key={v}>
                                                        {v}
                                                        <small>
                                                            音符 / 音量
                                                        </small>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from(
                                                { length: 16 },
                                                (_, r) => (
                                                    <tr
                                                        key={r}
                                                        className={
                                                            playRow ===
                                                            selectedBar * 16 + r
                                                                ? "playing"
                                                                : r % 4 === 0
                                                                  ? "beat"
                                                                  : ""
                                                        }
                                                    >
                                                        <th>
                                                            {String(
                                                                r + 1,
                                                            ).padStart(2, "0")}
                                                        </th>
                                                        {MUSIC_VOICES.map(
                                                            (key, v) => (
                                                                <td key={key}>
                                                                    <button
                                                                        aria-label={`${selectedBar + 1}小節 ${r + 1}番 ${voiceNames[v]}`}
                                                                        aria-pressed={
                                                                            voice ===
                                                                                v &&
                                                                            row ===
                                                                                r
                                                                        }
                                                                        className={
                                                                            voice ===
                                                                                v &&
                                                                            row ===
                                                                                r
                                                                                ? "selected"
                                                                                : ""
                                                                        }
                                                                        onClick={() =>
                                                                            inspect(
                                                                                v,
                                                                                r,
                                                                            )
                                                                        }
                                                                    >
                                                                        {noteName(
                                                                            bar[
                                                                                key
                                                                            ]?.[
                                                                                r
                                                                            ] ??
                                                                                0,
                                                                        )}
                                                                        <small>
                                                                            {v ===
                                                                            2
                                                                                ? ({
                                                                                      0: "—",
                                                                                      32: "100%",
                                                                                      64: "50%",
                                                                                      96: "25%",
                                                                                  }[
                                                                                      bar
                                                                                          .bassLevel?.[
                                                                                          r
                                                                                      ] ??
                                                                                          0
                                                                                  ] ??
                                                                                  "—")
                                                                                : (bar[
                                                                                      MUSIC_LEVELS[
                                                                                          v
                                                                                      ]
                                                                                  ]?.[
                                                                                      r
                                                                                  ] ??
                                                                                      0) >>
                                                                                      4 ||
                                                                                  "—"}
                                                                        </small>
                                                                    </button>
                                                                </td>
                                                            ),
                                                        )}
                                                    </tr>
                                                ),
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <fieldset
                                    disabled={locked}
                                    className="music-note-edit"
                                >
                                    <legend>
                                        {selectedBar + 1}小節 {row + 1}番 ·{" "}
                                        {voiceNames[voice]}
                                    </legend>
                                    <label>
                                        音符
                                        <select
                                            aria-label="音符"
                                            value={pitch}
                                            onChange={(e) =>
                                                setPitch(+e.target.value)
                                            }
                                        >
                                            {noteChoices.map((n) => (
                                                <option key={n} value={n}>
                                                    {noteName(n)}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label>
                                        長さ（16分音符）
                                        <input
                                            aria-label="音符の長さ"
                                            type="number"
                                            min="1"
                                            max={
                                                song.bars.length * 16 -
                                                selectedBar * 16 -
                                                row
                                            }
                                            value={length}
                                            onChange={(e) =>
                                                setLength(
                                                    Math.max(
                                                        1,
                                                        Math.floor(
                                                            +e.target.value,
                                                        ),
                                                    ),
                                                )
                                            }
                                        />
                                    </label>
                                    <label>
                                        音量
                                        <select
                                            aria-label="音符の音量"
                                            value={volume}
                                            onChange={(e) =>
                                                setVolume(+e.target.value)
                                            }
                                        >
                                            {(voice === 2
                                                ? [32, 64, 96]
                                                : Array.from(
                                                      { length: 15 },
                                                      (_, i) => i + 1,
                                                  )
                                            ).map((n) => (
                                                <option key={n} value={n}>
                                                    {voice === 2
                                                        ? {
                                                              32: "100%",
                                                              64: "50%",
                                                              96: "25%",
                                                          }[n]
                                                        : n}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <button
                                        onClick={() =>
                                            edit((s) =>
                                                writeMusicNote(
                                                    s,
                                                    voice,
                                                    selectedBar * 16 + row,
                                                    pitch,
                                                    length,
                                                    voice === 2
                                                        ? volume
                                                        : volume << 4,
                                                ),
                                            )
                                        }
                                    >
                                        音符を適用
                                    </button>
                                    <button
                                        onClick={() =>
                                            edit((s) =>
                                                writeMusicNote(
                                                    s,
                                                    voice,
                                                    selectedBar * 16 + row,
                                                    0,
                                                    length,
                                                    0,
                                                ),
                                            )
                                        }
                                    >
                                        休符にする
                                    </button>
                                    <button onClick={() => transpose(-12)}>
                                        選択声部を1オクターブ下げる
                                    </button>
                                    <button onClick={() => transpose(12)}>
                                        1オクターブ上げる
                                    </button>
                                </fieldset>
                            </div>
                            <div className="music-toolbar">
                                <button
                                    disabled={locked || song.bars.length >= 64}
                                    onClick={() => {
                                        edit((s) => {
                                            s.bars.splice(
                                                selectedBar + 1,
                                                0,
                                                emptyMusicBar(),
                                            );
                                            repairMusicTies(s);
                                        });
                                        setBar(selectedBar + 1);
                                    }}
                                >
                                    次に小節を追加
                                </button>
                                <button
                                    onClick={() => {
                                        clipboard.current = structuredClone(
                                            editableMusicTrack(song).bars[
                                                selectedBar
                                            ],
                                        );
                                        setMessage("小節をコピーしました。");
                                    }}
                                >
                                    小節をコピー
                                </button>
                                <button
                                    disabled={locked || !clipboard.current}
                                    onClick={() =>
                                        edit((s) => {
                                            s.bars[selectedBar] =
                                                structuredClone(
                                                    clipboard.current!,
                                                );
                                            repairMusicTies(s);
                                        })
                                    }
                                >
                                    小節を貼り付け
                                </button>
                                <button
                                    disabled={locked || song.bars.length <= 1}
                                    onClick={removeBar}
                                >
                                    小節を削除
                                </button>
                            </div>
                        </>
                    )}
                    <fieldset className="music-assignment" disabled={locked}>
                        <legend>ゲームへの割り当て</legend>
                        <select
                            aria-label="曲の割り当て先"
                            value={assignment}
                            onChange={(e) => setAssignment(e.target.value)}
                        >
                            <option value="title">タイトル・スコア</option>
                            <option value="boss">共通ボス</option>
                            <option value="clear">クリア</option>
                            <option value="gameover">ゲームオーバー</option>
                            <option value="victory" disabled={song.loop}>
                                撃破ファンファーレ（非ループのみ）
                            </option>
                            {game.ending && (
                                <option value="ending">エンディング</option>
                            )}
                            {game.stageOrder.flatMap((stageId, i) => [
                                <option
                                    key={stageId + "r"}
                                    value={`road:${stageId}`}
                                >
                                    {i + 1}面 道中
                                </option>,
                                <option
                                    key={stageId + "b"}
                                    value={`boss:${stageId}`}
                                >
                                    {i + 1}面 ボス
                                </option>,
                            ])}
                        </select>
                        <button
                            disabled={assignment === "victory" && song.loop}
                            onClick={assign}
                        >
                            この曲を割り当てる
                        </button>
                        <p>
                            {game.stages
                                .flatMap((s, i) => [
                                    ...(s.music === song.id
                                        ? [`${i + 1}面 道中`]
                                        : []),
                                    ...(s.bossMusic === song.id
                                        ? [`${i + 1}面 ボス`]
                                        : []),
                                ])
                                .join(" / ") || "ステージへの割り当てなし"}
                        </p>
                    </fieldset>
                    {song.source && (
                        <details>
                            <summary>元MIDI・変換設定</summary>
                            <p>{song.source.name}</p>
                            <code>{song.source.sha256}</code>
                            <ul>
                                {song.source.warnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                ))}
                            </ul>
                            <p>
                                元MIDIは保持し、編集はプロジェクトの楽譜へ保存します。編集後のビルドではこの楽譜が優先されます。
                            </p>
                        </details>
                    )}
                </>
            )}
        </section>
    );
}
