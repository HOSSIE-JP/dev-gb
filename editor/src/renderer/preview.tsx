import React, { useEffect, useRef, useState } from "react";
import init, { GameBoy, GameBoyMode, BootRom, PadKey } from "boytacean";
import { type Game, type BuildResult, clone, assetById } from "../shared/model";
import { Simulation, drawSimulation, drawAsset } from "../shared/simulation";
import { drawScreen } from "./canvases";
const inputKey: Record<string, number> = {
    ArrowRight: 1,
    ArrowLeft: 2,
    ArrowUp: 4,
    ArrowDown: 8,
    z: 16,
    Z: 16,
    x: 32,
    X: 32,
    Shift: 64,
    Enter: 128,
};
const padKey: Record<string, PadKey> = {
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
export function Preview({
    active,
    game,
    dmg,
    glyphs,
    kind,
    id,
}: {
    active: boolean;
    game: Game;
    dmg: boolean;
    glyphs: Record<string, number[]>;
    kind: string;
    id: string;
}) {
    const ref = useRef<HTMLCanvasElement>(null),
        sim = useRef<Simulation | null>(null),
        keys = useRef(0),
        [running, setRunning] = useState(true),
        [speed, setSpeed] = useState(1),
        [hitbox, setHitbox] = useState(false),
        [tick, setTick] = useState(0),
        [oam, setOam] = useState(0),
        [dropped, setDropped] = useState(0),
        [lineMax, setLineMax] = useState(0),
        [result, setResult] = useState(0),
        [scope, setScope] = useState("stage");
    const create = () => {
        const g = clone(game);
        let stageId = kind === "stages" ? id : g.startStage;
        const s = g.stages.find((s) => s.id === stageId) ?? g.stages[0];
        stageId = s.id;
        if (
            scope === "selection" &&
            ["patterns", "enemies", "bosses"].includes(kind)
        ) {
            s.events = [];
            s.duration = 600;
            s.clearOnBoss = false;
            g.player.invulnerability = 65535;
            if (kind === "patterns") {
                const actor = clone(g.enemies[0]);
                actor.id = "preview-actor";
                actor.hp = 255;
                actor.pattern = id;
                actor.motion = {
                    ...actor.motion,
                    kind: "straight",
                    vx: 0,
                    vy: 0,
                };
                g.enemies.push(actor);
                s.events.push({
                    id: "preview-event",
                    frame: 0,
                    kind: "enemy",
                    ref: actor.id,
                    x: 80,
                    y: 44,
                    count: 1,
                    spacing: 0,
                    interval: 0,
                    value: 0,
                });
            } else
                s.events.push({
                    id: "preview-event",
                    frame: 0,
                    kind: kind === "bosses" ? "boss" : "enemy",
                    ref: id,
                    x: 80,
                    y: 32,
                    count: 1,
                    spacing: 0,
                    interval: 0,
                    value: 0,
                });
        }
        return new Simulation(g, stageId);
    };
    const draw = () => {
        const c = ref.current?.getContext("2d"),
            s = sim.current;
        if (!c || !s) return;
        if (scope === "selection" && kind === "assets") {
            const a = game.assets.find((a) => a.id === id)!;
            c.fillStyle = "#17242d";
            c.fillRect(0, 0, 160, 144);
            drawAsset(
                c,
                game,
                a,
                (160 - a.width) / 2,
                (144 - a.height) / 2,
                s.tick,
                dmg,
            );
        } else {
            drawSimulation(c, s, dmg, hitbox);
            const hud = s.game.screens.find((s) => s.id === "hud")!;
            c.save();
            c.translate(0, hud.dock === "top" ? 0 : 128);
            drawScreen(c, s.game, hud, glyphs, dmg, {
                score: String(s.score).padStart(5, "0"),
                lives: String(s.lives).padStart(5, "0"),
                time: String(
                    Math.max(
                        0,
                        Math.ceil((s.stage.duration * 60 - s.stageTick) / 60),
                    ),
                ).padStart(5, "0"),
                boss: String(s.bossHp).padStart(5, "0"),
            });
            c.restore();
            if (s.aim) {
                c.strokeStyle = "#ffbd66";
                c.beginPath();
                c.moveTo(s.aim.x - 5, s.aim.y);
                c.lineTo(s.aim.x + 5, s.aim.y);
                c.moveTo(s.aim.x, s.aim.y - 5);
                c.lineTo(s.aim.x, s.aim.y + 5);
                c.stroke();
            }
        }
        setTick(s.tick);
        setOam(s.oam);
        setDropped(s.dropped);
        setResult(s.result);
        const lines = Array(144).fill(0),
            items = [
                { asset: s.game.player.asset, x: s.playerX, y: s.playerY },
                ...s.entities,
            ];
        for (const e of items) {
            const a = assetById(s.game, e.asset),
                y = Math.trunc(e.y / 16) - a.origin.y;
            for (let n = Math.max(0, y); n < Math.min(144, y + a.height); n++)
                lines[n] += a.width / 8;
        }
        setLineMax(Math.max(...lines));
    };
    useEffect(() => {
        sim.current = create();
        setTick(0);
        draw();
    }, [game, id, kind, scope]);
    useEffect(() => {
        let request = 0,
            last = performance.now(),
            fraction = 0;
        const frame = (now: number) => {
            const s = sim.current;
            if (s && active) {
                if (running) {
                    fraction +=
                        ((Math.min(100, now - last) * 60) / 1000) * speed;
                    const count = Math.min(12, Math.floor(fraction));
                    fraction -= count;
                    for (let i = 0; i < count; i++) {
                        if (scope === "selection" && kind === "assets")
                            s.tick++;
                        else s.step(keys.current);
                    }
                }
                draw();
            }
            last = now;
            request = requestAnimationFrame(frame);
        };
        request = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(request);
    }, [running, speed, dmg, hitbox, game, scope, kind, active]);
    const scrub = (frame: number) => {
        sim.current = create();
        for (let i = 0; i < frame; i++) sim.current.step(0);
        draw();
        setRunning(false);
    };
    return (
        <div className="preview">
            <div className="toolbar">
                <span className="eyebrow">LIVE PREVIEW</span>
                <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                >
                    <option value="stage">ステージ全体</option>
                    <option value="selection">選択対象</option>
                </select>
                <button onClick={() => setRunning(!running)}>
                    {running ? "Ⅱ 停止" : "▶ 再生"}
                </button>
                <button
                    onClick={() => {
                        setRunning(false);
                        sim.current?.step(keys.current);
                        draw();
                    }}
                >
                    1f
                </button>
                <button
                    onClick={() => {
                        sim.current = create();
                        draw();
                    }}
                >
                    ↺
                </button>
                <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                >
                    {[0.25, 0.5, 1, 2, 4].map((n) => (
                        <option key={n} value={n}>
                            {n}×
                        </option>
                    ))}
                </select>
                <label>
                    <input
                        type="checkbox"
                        checked={hitbox}
                        onChange={(e) => setHitbox(e.target.checked)}
                    />
                    判定
                </label>
            </div>
            <div className="preview-body">
                <canvas
                    ref={ref}
                    width={160}
                    height={144}
                    tabIndex={0}
                    aria-label="即時プレビュー"
                    onKeyDown={(e) => {
                        if (inputKey[e.key]) {
                            keys.current |= inputKey[e.key];
                            e.preventDefault();
                        }
                    }}
                    onKeyUp={(e) => {
                        keys.current &= ~(inputKey[e.key] ?? 0);
                    }}
                    onBlur={() => (keys.current = 0)}
                    onPointerDown={(e) => {
                        e.currentTarget.focus();
                        if (scope === "selection" && sim.current) {
                            const r = e.currentTarget.getBoundingClientRect();
                            sim.current.aim = {
                                x: ((e.clientX - r.left) * 160) / r.width,
                                y: ((e.clientY - r.top) * 144) / r.height,
                            };
                        }
                    }}
                    onPointerMove={(e) => {
                        if (e.buttons && scope === "selection" && sim.current) {
                            const r = e.currentTarget.getBoundingClientRect();
                            sim.current.aim = {
                                x: ((e.clientX - r.left) * 160) / r.width,
                                y: ((e.clientY - r.top) * 144) / r.height,
                            };
                        }
                    }}
                />
                <div className="preview-metrics">
                    <div>
                        <small>経過</small>
                        <strong>
                            {(tick / 60).toFixed(1)}
                            <em>s</em>
                        </strong>
                    </div>
                    <div>
                        <small>OAM</small>
                        <strong>
                            {oam}
                            <em>/40</em>
                        </strong>
                    </div>
                    <div className={lineMax > 10 ? "warning" : ""}>
                        <small>走査線最大</small>
                        <strong>
                            {lineMax}
                            <em>/10</em>
                        </strong>
                    </div>
                    <div>
                        <small>生成見送り</small>
                        <strong>{dropped}</strong>
                    </div>
                    <span className="hint">
                        {result === 1
                            ? "GAME OVER"
                            : result === 2
                              ? "STAGE CLEAR"
                              : "画面をクリックして操作"}
                        <br />
                        方向キー・Z/X
                        <br />
                        選択弾幕：照準をドラッグ
                    </span>
                    {kind === "bosses" && (
                        <label>
                            プレビューのボスHP
                            <input
                                type="number"
                                min={1}
                                max={255}
                                defaultValue={255}
                                onChange={(e) => {
                                    const boss = sim.current?.entities.find(
                                        (x) => x.kind === "boss",
                                    );
                                    if (boss) boss.hp = Number(e.target.value);
                                }}
                            />
                        </label>
                    )}
                </div>
            </div>
            <div className="scrub">
                <span>{tick}f</span>
                <input
                    aria-label="プレビュー時刻"
                    type="range"
                    min={0}
                    max={(sim.current?.stage.duration ?? 120) * 60}
                    value={tick}
                    onChange={(e) => scrub(Number(e.target.value))}
                />
            </div>
            <small className="hint">
                シークは入力なしで先頭から再計算。整数ロジックの確認用です。実機描画・音はROMプレビューで確認。
            </small>
        </div>
    );
}
let wasmReady: Promise<unknown> | undefined;
export function RomPreview({
    active,
    name,
    build,
    dmg,
    error,
}: {
    name: string;
    build: BuildResult | null;
    dmg: boolean;
    error: (s: string) => void;
    active: boolean;
}) {
    const canvas = useRef<HTMLCanvasElement>(null),
        gb = useRef<GameBoy | null>(null),
        audio = useRef<AudioContext | null>(null),
        nextAudio = useRef(0),
        [playing, setPlaying] = useState(false),
        [enabled, setEnabled] = useState(true),
        [status, setStatus] = useState("ビルドしたROMを読み込めます");
    const audioFlag = useRef(true);
    const releases = useRef(new Map<PadKey, number>());
    const press = (key: PadKey) => {
        releases.current.delete(key);
        gb.current?.key_press(key);
    };
    const release = (key: PadKey) => {
        releases.current.set(key, 3);
    };
    const clockFrame = () => {
        gb.current?.clocks_cycles(70224);
        for (const [key, left] of releases.current) {
            if (left <= 1) {
                gb.current?.key_lift(key);
                releases.current.delete(key);
            } else releases.current.set(key, left - 1);
        }
    };
    audioFlag.current = enabled;
    const paint = () => {
        const boy = gb.current,
            c = canvas.current?.getContext("2d");
        if (!boy || !c) return;
        const rgb = boy.frame_buffer_eager(),
            im = c.createImageData(160, 144),
            stride = rgb.length / (160 * 144);
        for (let i = 0; i < 160 * 144; i++) {
            im.data[i * 4] = rgb[i * stride];
            im.data[i * 4 + 1] = rgb[i * stride + 1];
            im.data[i * 4 + 2] = rgb[i * stride + 2];
            im.data[i * 4 + 3] = 255;
        }
        c.putImageData(im, 0, 0);
        const samples = boy.audio_buffer_eager(true),
            ctx = audio.current,
            channels = boy.audio_channels();
        if (ctx && audioFlag.current && samples.length) {
            const count = Math.floor(samples.length / channels),
                buffer = ctx.createBuffer(
                    channels,
                    count,
                    boy.audio_sampling_rate(),
                );
            for (let ch = 0; ch < channels; ch++) {
                const out = buffer.getChannelData(ch);
                for (let i = 0; i < count; i++)
                    out[i] = samples[i * channels + ch] / 32768;
            }
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            nextAudio.current = Math.max(ctx.currentTime, nextAudio.current);
            if (nextAudio.current - ctx.currentTime > 0.15)
                nextAudio.current = ctx.currentTime;
            source.start(nextAudio.current);
            nextAudio.current += count / boy.audio_sampling_rate();
        }
    };
    const load = async () => {
        if (!build?.ok) return;
        try {
            setStatus("ROMを読み込み中…");
            wasmReady ??= init({
                module_or_path: new URL("boytacean_bg.wasm", location.href),
            });
            await wasmReady;
            const data = await window.caravan.rom(name, build.configuration);
            gb.current?.free();
            const boy = new GameBoy(dmg ? GameBoyMode.Dmg : GameBoyMode.Cgb);
            boy.set_boot_rom(dmg ? BootRom.DmgBootix : BootRom.CgbBoytacean);
            boy.load_unsafe(true);
            boy.load_rom_wa(data).free();
            gb.current = boy;
            audio.current ??= new AudioContext();
            await audio.current.resume();
            nextAudio.current = 0;
            setPlaying(true);
            setStatus(`${dmg ? "DMG" : "CGB"} · Boytacean 0.13.2`);
            canvas.current?.focus();
        } catch (e) {
            error((e as Error).message);
            setStatus("読込失敗");
        }
    };
    useEffect(() => {
        setPlaying(false);
        gb.current?.free();
        gb.current = null;
        setStatus("「ROM読込」で新しい結果を実行");
    }, [build, dmg, name]);
    useEffect(() => {
        let id = 0,
            last = performance.now(),
            acc = 0;
        const loop = (now: number) => {
            if (playing && active && gb.current) {
                acc += Math.min(now - last, 100);
                let n = 0;
                while (acc >= 1000 / 59.7275 && n++ < 6) {
                    clockFrame();
                    acc -= 1000 / 59.7275;
                }
                paint();
            }
            last = now;
            id = requestAnimationFrame(loop);
        };
        id = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(id);
    }, [playing, active]);
    useEffect(
        () => () => {
            gb.current?.free();
            audio.current?.close();
        },
        [],
    );
    return (
        <div className="preview rom">
            <div className="toolbar">
                <span className="eyebrow">ROM PLAYER</span>
                <button className="accent" disabled={!build?.ok} onClick={load}>
                    ROM読込 / 再起動
                </button>
                <button
                    disabled={!gb.current}
                    onClick={() => setPlaying(!playing)}
                >
                    {playing ? "Ⅱ" : "▶"}
                </button>
                <button
                    disabled={!gb.current}
                    onClick={() => {
                        setPlaying(false);
                        clockFrame();
                        paint();
                    }}
                >
                    1f
                </button>
                <label>
                    <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
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
                    onKeyDown={(e) => {
                        const key = padKey[e.key];
                        if (key !== undefined) {
                            press(key);
                            e.preventDefault();
                        }
                    }}
                    onKeyUp={(e) => {
                        const key = padKey[e.key];
                        if (key !== undefined) release(key);
                    }}
                    onBlur={() =>
                        Object.values(padKey).forEach((key) =>
                            gb.current?.key_lift(key),
                        )
                    }
                />
                <div className="preview-metrics">
                    <span className="chip">{status}</span>
                    <div className="virtual-pad">
                        {(
                            [
                                ["↑", PadKey.Up],
                                ["←", PadKey.Left],
                                ["↓", PadKey.Down],
                                ["→", PadKey.Right],
                                ["A", PadKey.A],
                                ["B", PadKey.B],
                                ["START", PadKey.Start],
                                ["SELECT", PadKey.Select],
                            ] as const
                        ).map(([label, key]) => (
                            <button
                                key={key}
                                disabled={!gb.current}
                                onClick={() => {
                                    press(key);
                                    release(key);
                                }}
                                onPointerDown={(e) => {
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
                        Enter：START / 一時停止
                        <br />
                        Shift：SELECT
                    </p>
                    {["bgb", "emulicious"].map((e) => (
                        <button
                            key={e}
                            disabled={!build?.ok}
                            onClick={() =>
                                window.caravan
                                    .external(name, build!.configuration, e)
                                    .catch((e) => error(e.message))
                            }
                        >
                            {e === "bgb" ? "BGB" : "Emulicious"}で開く ↗
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
