import React, { useEffect, useRef, useState } from "react";
import { type Game, clone, assetById } from "../shared/model";
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
export { RomPreview } from "./rom-preview";
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
        [character,setCharacter]=useState(0),
        [bombs,setBombs]=useState(0),
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
            s.requireBoss = false;
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
        return new Simulation(g, stageId, character);
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
        } else if (s.intro) {
            const name = [...s.intro.spellName];
            drawScreen(c,s.game,{id: "clear", name: "Cut-in", background: s.intro.background, palette:0, dock:"top", items:[
                {id:"spell1",text:name.slice(0,18).join(""),x:1,y:14,palette:0,binding:"none"},
                {id:"spell2",text:name.slice(18).join(""),x:1,y:16,palette:0,binding:"none"}
            ]},glyphs,dmg);
        } else {
            drawSimulation(c, s, dmg, hitbox);
            if (!s.bombLeft) {
            const hud = s.game.screens.find((s) => s.id === "hud")!;
            c.save();
            c.translate(0, hud.dock === "top" ? 0 : 144 - (hud.rows ?? 2) * 8);
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
                bombs: String(s.bombs).padStart(5,"0"),
            });
            c.restore();
            }
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
        setBombs(s.bombs);
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
    }, [game, id, kind, scope, character]);
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
    }, [running, speed, dmg, hitbox, game, scope, kind, id, glyphs, active]);
    useEffect(() => {
        if (!active) keys.current = 0;
        const release = () => {
            keys.current = 0;
        };
        window.addEventListener("blur", release);
        document.addEventListener("visibilitychange", release);
        return () => {
            window.removeEventListener("blur", release);
            document.removeEventListener("visibilitychange", release);
        };
    }, [active]);
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
                <select aria-label="プレビューの機体" value={character} onChange={e=>setCharacter(+e.target.value)}>
                    <option value={0}>{game.player.name??"PLAYER 1"}</option>
                    {(game.player.characters??[]).map((p,i)=><option key={p.id} value={i+1}>{p.name}</option>)}
                </select>
                {game.player.bomb?.enabled && <span>ボム {bombs} · Z＋X</span>}
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
                        if (
                            inputKey[e.key] &&
                            !e.ctrlKey &&
                            !e.metaKey &&
                            !e.altKey
                        ) {
                            keys.current |= inputKey[e.key];
                            e.preventDefault();
                            e.stopPropagation();
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
