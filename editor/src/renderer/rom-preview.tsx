import React, { useEffect, useRef, useState } from "react";
import init, { GameBoy, GameBoyMode, BootRom, PadKey } from "boytacean";
import type { BuildResult } from "../shared/model";

const keys: Record<string, PadKey> = {
    ArrowRight: PadKey.Right,
    ArrowLeft: PadKey.Left,
    ArrowUp: PadKey.Up,
    ArrowDown: PadKey.Down,
    z: PadKey.A,
    Z: PadKey.A,
    x: PadKey.B,
    X: PadKey.B,
    Shift: PadKey.Select,
    Enter: PadKey.Start,
};
const pad = [
    ["↑", PadKey.Up],
    ["←", PadKey.Left],
    ["↓", PadKey.Down],
    ["→", PadKey.Right],
    ["A", PadKey.A],
    ["B", PadKey.B],
    ["START", PadKey.Start],
    ["SELECT", PadKey.Select],
] as const;
let wasmReady: Promise<unknown> | undefined;

/** Owns the WASM/audio lifetime; async loads cannot outlive their project/build. */
export function RomPreview({
    active,
    name,
    build,
    dmg,
    error,
    autoLoad = 0,
}: {
    active: boolean;
    name: string;
    build: BuildResult | null;
    dmg: boolean;
    error: (message: string) => void;
    autoLoad?: number;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const gb = useRef<GameBoy | null>(null);
    const audio = useRef<AudioContext | null>(null);
    const sources = useRef(new Set<AudioBufferSourceNode>());
    const nextAudio = useRef(0);
    const generation = useRef(0);
    const held = useRef(new Set<PadKey>());
    const releases = useRef(new Map<PadKey, number>());
    const requested = useRef(0);
    const [loaded, setLoaded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [enabled, setEnabled] = useState(true);
    const [zoom, setZoom] = useState(3);
    const [speed, setSpeed] = useState(1);
    const [fps, setFps] = useState(0);
    const [status, setStatus] = useState("ビルドするとROMを実行できます");
    const preferences = useRef({ enabled, speed });
    preferences.current = { enabled, speed };

    const clearAudio = () => {
        for (const source of sources.current) {
            try {
                source.stop();
            } catch {
                /* already ended */
            }
            source.disconnect();
        }
        sources.current.clear();
        nextAudio.current = 0;
    };
    const releaseAll = () => {
        for (const key of held.current) gb.current?.key_lift(key);
        for (const key of releases.current.keys()) gb.current?.key_lift(key);
        held.current.clear();
        releases.current.clear();
    };
    const press = (key: PadKey) => {
        if (!gb.current) return;
        held.current.add(key);
        releases.current.delete(key);
        gb.current.key_press(key);
    };
    const release = (key: PadKey) => {
        held.current.delete(key);
        releases.current.set(key, 3);
    };
    const clock = () => {
        gb.current?.clocks_cycles(70224);
        for (const [key, frames] of releases.current) {
            if (frames <= 1) {
                gb.current?.key_lift(key);
                releases.current.delete(key);
            } else releases.current.set(key, frames - 1);
        }
    };
    const paint = (withAudio = true) => {
        const boy = gb.current,
            context = canvas.current?.getContext("2d");
        if (!boy || !context) return;
        const rgb = boy.frame_buffer_eager();
        const pixels = context.createImageData(160, 144);
        const stride = rgb.length / (160 * 144);
        for (let i = 0; i < 160 * 144; i++) {
            pixels.data[i * 4] = rgb[i * stride];
            pixels.data[i * 4 + 1] = rgb[i * stride + 1];
            pixels.data[i * 4 + 2] = rgb[i * stride + 2];
            pixels.data[i * 4 + 3] = 255;
        }
        context.putImageData(pixels, 0, 0);
        const samples = boy.audio_buffer_eager(true),
            ctx = audio.current;
        // Slow/fast debug playback is silent so queued audio cannot drift.
        if (
            !withAudio ||
            !ctx ||
            ctx.state !== "running" ||
            !preferences.current.enabled ||
            preferences.current.speed !== 1 ||
            !samples.length
        )
            return;
        const channels = boy.audio_channels(),
            count = Math.floor(samples.length / channels);
        if (!count) return;
        const buffer = ctx.createBuffer(
            channels,
            count,
            boy.audio_sampling_rate(),
        );
        for (let ch = 0; ch < channels; ch++) {
            const output = buffer.getChannelData(ch);
            for (let i = 0; i < count; i++)
                output[i] = samples[i * channels + ch] / 32768;
        }
        if (nextAudio.current - ctx.currentTime > 0.15) clearAudio();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => {
            sources.current.delete(source);
            source.disconnect();
        };
        sources.current.add(source);
        nextAudio.current = Math.max(ctx.currentTime, nextAudio.current);
        source.start(nextAudio.current);
        nextAudio.current += count / boy.audio_sampling_rate();
    };
    const load = async () => {
        if (!build?.ok || loading) return;
        const token = ++generation.current;
        setLoading(true);
        setPlaying(false);
        setLoaded(false);
        releaseAll();
        clearAudio();
        gb.current?.free();
        gb.current = null;
        setStatus("ROMを読み込み中…");
        try {
            // Resume within the initiating gesture when available. Audio failure
            // must not prevent an otherwise valid ROM from running.
            try {
                audio.current ??= new AudioContext();
                void audio.current.resume().catch(() => undefined);
            } catch {
                setEnabled(false);
            }
            wasmReady ??= init({
                module_or_path: new URL("boytacean_bg.wasm", location.href),
            }).catch((e) => {
                wasmReady = undefined;
                throw e;
            });
            await wasmReady;
            const bytes = await window.caravan.rom(
                name,
                build.configuration,
                build.revision,
            );
            if (token !== generation.current) return;
            const boy = new GameBoy(dmg ? GameBoyMode.Dmg : GameBoyMode.Cgb);
            try {
                boy.set_boot_rom(
                    dmg ? BootRom.DmgBootix : BootRom.CgbBoytacean,
                );
                boy.load_unsafe(true);
                boy.load_rom_wa(bytes).free();
            } catch (e) {
                boy.free();
                throw e;
            }
            gb.current = boy;
            setLoaded(true);
            setPlaying(true);
            setStatus(
                `${dmg ? "DMG" : "CGB"} · ${build.configuration} · ${build.revision.slice(0, 8)}`,
            );
            paint(false);
            canvas.current?.focus();
        } catch (e) {
            if (token !== generation.current) return;
            error((e as Error).message);
            setStatus("読込失敗：ビルド結果を確認してください");
        } finally {
            if (token === generation.current) setLoading(false);
        }
    };
    useEffect(() => {
        ++generation.current;
        releaseAll();
        clearAudio();
        gb.current?.free();
        gb.current = null;
        setLoaded(false);
        setPlaying(false);
        setLoading(false);
        setFps(0);
        setStatus(
            build?.ok
                ? "ROM読込でビルド結果を実行"
                : "ビルドするとROMを実行できます",
        );
        canvas.current?.getContext("2d")?.clearRect(0, 0, 160, 144);
    }, [name, build, dmg]);
    useEffect(() => {
        requested.current = 0;
    }, [name]);
    useEffect(() => {
        if (active && !loading && autoLoad > requested.current && build?.ok) {
            requested.current = autoLoad;
            void load();
        }
    }, [autoLoad, active, build, loading, name]);
    useEffect(() => {
        if (!active || !playing) {
            releaseAll();
            clearAudio();
        }
        let request = 0,
            last = performance.now(),
            accumulated = 0;
        let report = last,
            frames = 0;
        const loop = (now: number) => {
            if (playing && active && !document.hidden && gb.current) {
                try {
                    accumulated +=
                        Math.min(now - last, 100) * preferences.current.speed;
                    let count = 0;
                    while (accumulated >= 1000 / 59.7275 && count++ < 12) {
                        clock();
                        frames++;
                        accumulated -= 1000 / 59.7275;
                    }
                    if (count) paint();
                } catch (e) {
                    setPlaying(false);
                    releaseAll();
                    clearAudio();
                    setStatus("実行停止");
                    error((e as Error).message);
                    return;
                }
            } else accumulated = 0;
            if (now - report >= 1000) {
                setFps(Math.round((frames * 1000) / (now - report)));
                report = now;
                frames = 0;
            }
            last = now;
            request = requestAnimationFrame(loop);
        };
        request = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(request);
    }, [playing, active]);
    useEffect(() => {
        clearAudio();
    }, [enabled, speed]);
    useEffect(() => {
        const blur = () => {
            releaseAll();
            clearAudio();
        };
        window.addEventListener("blur", blur);
        document.addEventListener("visibilitychange", blur);
        return () => {
            ++generation.current;
            window.removeEventListener("blur", blur);
            document.removeEventListener("visibilitychange", blur);
            releaseAll();
            clearAudio();
            gb.current?.free();
            gb.current = null;
            void audio.current?.close().catch(() => undefined);
        };
    }, []);
    return (
        <div className="preview rom">
            <div className="toolbar wrap">
                <span className="eyebrow">ROM PLAYER</span>
                <button
                    className="accent"
                    disabled={!build?.ok || loading}
                    onClick={() => void load()}
                >
                    {loading ? "読込中…" : "ROM読込 / 再起動"}
                </button>
                <button
                    disabled={!loaded}
                    aria-label={playing ? "ROMを一時停止" : "ROMを再開"}
                    onClick={() => {
                        void audio.current?.resume().catch(() => undefined);
                        setPlaying(!playing);
                    }}
                >
                    {playing ? "Ⅱ 停止" : "▶ 再開"}
                </button>
                <button
                    disabled={!loaded}
                    title="1フレーム進める"
                    onClick={() => {
                        setPlaying(false);
                        clearAudio();
                        try {
                            clock();
                            paint(false);
                        } catch (e) {
                            error((e as Error).message);
                        }
                    }}
                >
                    1f
                </button>
                <select
                    aria-label="ROM表示倍率"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                >
                    {[2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>
                            {value}× 表示
                        </option>
                    ))}
                </select>
                <select
                    aria-label="ROM再生速度"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                >
                    {[0.25, 0.5, 1, 2].map((value) => (
                        <option key={value} value={value}>
                            {value}× 速度
                        </option>
                    ))}
                </select>
                <label>
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => {
                            setEnabled(e.target.checked);
                            void audio.current?.resume().catch(() => undefined);
                        }}
                    />
                    音
                </label>
            </div>
            <div className="preview-body">
                <canvas
                    ref={canvas}
                    width={160}
                    height={144}
                    tabIndex={0}
                    aria-label="ROMプレビュー"
                    style={{
                        width: 160 * zoom,
                        height: 144 * zoom,
                        maxWidth: "none",
                        flexShrink: 0,
                    }}
                    onPointerDown={(e) => {
                        e.currentTarget.focus();
                        void audio.current?.resume().catch(() => undefined);
                    }}
                    onKeyDown={(e) => {
                        if (
                            keys[e.key] !== undefined &&
                            !e.ctrlKey &&
                            !e.metaKey &&
                            !e.altKey
                        ) {
                            press(keys[e.key]);
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}
                    onKeyUp={(e) => {
                        if (keys[e.key] !== undefined) {
                            release(keys[e.key]);
                            e.preventDefault();
                        }
                    }}
                    onBlur={releaseAll}
                />
                <div className="preview-metrics">
                    <span className="chip" role="status">
                        {status}
                    </span>
                    <div>
                        <small>エミュレーション</small>
                        <strong>
                            {fps}
                            <em>fps</em>
                        </strong>
                    </div>
                    <div className="virtual-pad">
                        {pad.map(([label, key]) => (
                            <button
                                key={key}
                                disabled={!loaded}
                                aria-label={`ゲームボーイ ${label}`}
                                onClick={(e) => {
                                    if (e.detail === 0) {
                                        press(key);
                                        release(key);
                                    }
                                }}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.setPointerCapture(
                                        e.pointerId,
                                    );
                                    press(key);
                                }}
                                onPointerUp={() => release(key)}
                                onPointerCancel={() => release(key)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <p className="hint">
                        方向キー：移動
                        <br />Z / X：A / B<br />
                        Enter：START　Shift：SELECT
                        <br />
                        画面をクリックして操作します。
                        <br />
                        速度1×以外は消音。fpsはエミュレーターの処理速度です。
                    </p>
                    {["bgb", "emulicious"].map((emulator) => (
                        <button
                            key={emulator}
                            disabled={!build?.ok}
                            onClick={() =>
                                window.caravan
                                    .external(
                                        name,
                                        build!.configuration,
                                        emulator,
                                        build!.revision,
                                    )
                                    .catch((e) => error(e.message))
                            }
                        >
                            {emulator === "bgb" ? "BGB" : "Emulicious"}で開く ↗
                        </button>
                    ))}
                    <button
                        disabled={!build?.ok}
                        onClick={() =>
                            window.caravan
                                .exportRom(
                                    name,
                                    build!.configuration,
                                    build!.revision,
                                )
                                .then((saved) => {
                                    if (saved) setStatus("ROMを書き出しました");
                                })
                                .catch((e) => error(e.message))
                        }
                    >
                        ROMを書き出す…
                    </button>
                </div>
            </div>
        </div>
    );
}
