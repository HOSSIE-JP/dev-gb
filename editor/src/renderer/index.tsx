import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
    type Game,
    type Asset,
    type Stage,
    type StageEvent,
    type ProjectInfo,
    type BuildResult,
    clone,
    uid,
    validate,
    normalMotion,
} from "../shared/model";
import { Form, Field, Select } from "./fields";
import { AssetCanvas, MapCanvas, ScreenCanvas, MotionCanvas } from "./canvases";
import { BossCanvas } from "./boss-canvas";
import { Preview, RomPreview } from "./preview";
import "./style.css";

const categories = [
    ["assets", "画像・スプライト", "▦"],
    ["player", "自機", "△"],
    ["enemies", "敵キャラクター", "◇"],
    ["patterns", "弾幕", "✳"],
    ["bosses", "ボス", "⬡"],
    ["stages", "マップ・ステージ", "▤"],
    ["screens", "画面・HUD", "▣"],
    ["palettes", "パレット", "◐"],
    ["project", "作品設定", "⚙"],
];
type Selection = { kind: string; id: string };
class Boundary extends React.Component<
    { children: React.ReactNode },
    { error: string }
> {
    state = { error: "" };
    static getDerivedStateFromError(e: Error) {
        return { error: e.message };
    }
    render() {
        return this.state.error ? (
            <div className="error">
                プレビューを表示できません：{this.state.error}
                <button onClick={() => this.setState({ error: "" })}>
                    再表示
                </button>
            </div>
        ) : (
            this.props.children
        );
    }
}
function Timeline({
    stage,
    selected,
    onSelect,
    onChange,
}: {
    stage: Stage;
    selected: string;
    onSelect: (id: string) => void;
    onChange: (s: Stage) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null),
        drag = useRef(""),
        width = Math.max(700, stage.duration * 10);
    useEffect(() => {
        const c = canvas.current?.getContext("2d");
        if (!c) return;
        c.fillStyle = "#131d28";
        c.fillRect(0, 0, width, 110);
        c.font = "11px sans-serif";
        for (let sec = 0; sec <= stage.duration; sec += 10) {
            const x = (sec / stage.duration) * width;
            c.fillStyle = "#253545";
            c.fillRect(x, 22, 1, 88);
            c.fillStyle = "#899bab";
            c.fillText(`${sec}s`, x + 3, 15);
        }
        stage.events.forEach((e) => {
            const x = (e.frame / (stage.duration * 60)) * width,
                y =
                    30 +
                    ["enemy", "boss", "scroll", "end"].indexOf(e.kind) * 19;
            c.fillStyle =
                e.id === selected
                    ? "#ffbd66"
                    : e.kind === "boss"
                      ? "#ee6d8b"
                      : e.kind === "enemy"
                        ? "#57cbb5"
                        : "#8b9fd0";
            c.fillRect(x, y, Math.max(5, e.count * 2), 13);
        });
    }, [stage, selected, width]);
    return (
        <div className="timeline">
            <div className="panel-title">
                ステージ・タイムライン{" "}
                <span>
                    敵 / ボス / 速度 /
                    終了　·　クリックで選択、ドラッグで時刻変更
                </span>
            </div>
            <div className="timeline-scroll">
                <canvas
                    width={width}
                    height={110}
                    ref={canvas}
                    onPointerDown={(e) => {
                        const r = e.currentTarget.getBoundingClientRect(),
                            x = e.clientX - r.left,
                            y = e.clientY - r.top,
                            kind = Math.floor((y - 30) / 19);
                        const found = [...stage.events]
                            .sort(
                                (a, b) =>
                                    Math.abs(
                                        (a.frame / (stage.duration * 60)) *
                                            width -
                                            x,
                                    ) -
                                    Math.abs(
                                        (b.frame / (stage.duration * 60)) *
                                            width -
                                            x,
                                    ),
                            )
                            .find(
                                (v) =>
                                    ["enemy", "boss", "scroll", "end"].indexOf(
                                        v.kind,
                                    ) === kind &&
                                    Math.abs(
                                        (v.frame / (stage.duration * 60)) *
                                            width -
                                            x,
                                    ) < 12,
                            );
                        if (found) {
                            onSelect(found.id);
                            drag.current = found.id;
                            e.currentTarget.setPointerCapture(e.pointerId);
                        }
                    }}
                    onPointerMove={(e) => {
                        if (!e.buttons || !drag.current) return;
                        const r = e.currentTarget.getBoundingClientRect(),
                            frame = Math.max(
                                0,
                                Math.min(
                                    stage.duration * 60,
                                    Math.round(
                                        ((e.clientX - r.left) / width) *
                                            stage.duration *
                                            4,
                                    ) * 15,
                                ),
                            );
                        onChange({
                            ...stage,
                            events: stage.events.map((v) =>
                                v.id === drag.current ? { ...v, frame } : v,
                            ),
                        });
                    }}
                    onPointerUp={() => (drag.current = "")}
                />
            </div>
        </div>
    );
}
function App() {
    const [game, setGame] = useState<Game | null>(null),
        [projects, setProjects] = useState<ProjectInfo[]>([]),
        [name, setName] = useState(""),
        [glyphs, setGlyphs] = useState<Record<string, number[]>>({}),
        [selection, setSelection] = useState<Selection>({
            kind: "assets",
            id: "player-ship",
        }),
        [search, setSearch] = useState(""),
        [frame, setFrame] = useState(0),
        [eventId, setEventId] = useState(""),
        [textId, setTextId] = useState(""),
        [dmg, setDmg] = useState(false),
        [grid, setGrid] = useState(true),
        [zoom, setZoom] = useState(16),
        [saved, setSaved] = useState(""),
        [error, setError] = useState(""),
        [logs, setLogs] = useState(""),
        [building, setBuilding] = useState(false),
        [config, setConfig] = useState("Debug"),
        [built, setBuilt] = useState<BuildResult | null>(null),
        [buildSnapshot, setBuildSnapshot] = useState(""),
        [modal, setModal] = useState(""),
        [newId, setNewId] = useState(""),
        [newTitle, setNewTitle] = useState("NEW CARAVAN"),
        [assetKind, setAssetKind] = useState("sprite"),
        [tab, setTab] = useState("preview");
    const undo = useRef<Game[]>([]),
        redo = useRef<Game[]>([]),
        gameRef = useRef<Game | null>(null),
        savedRef = useRef(""),
        clipboard = useRef<any>(null);
    gameRef.current = game;
    savedRef.current = saved;
    const content = game ? JSON.stringify(game) : "",
        dirty = !!game && content !== saved;
    const commit = (next: Game) => {
        const current = gameRef.current;
        if (current && JSON.stringify(current) !== JSON.stringify(next)) {
            undo.current.push(current);
            if (undo.current.length > 80) undo.current.shift();
            redo.current = [];
        }
        gameRef.current = next;
        setGame(next);
    };
    const change = (fn: (g: Game) => void) => {
        if (!gameRef.current) return;
        const next = clone(gameRef.current);
        fn(next);
        commit(next);
    };
    const doUndo = () => {
        if (!undo.current.length || !gameRef.current) return;
        redo.current.push(gameRef.current);
        const prev = undo.current.pop()!;
        gameRef.current = prev;
        setGame(prev);
    };
    const doRedo = () => {
        if (!redo.current.length || !gameRef.current) return;
        undo.current.push(gameRef.current);
        const next = redo.current.pop()!;
        gameRef.current = next;
        setGame(next);
    };
    const applyProject = (g: Game) => {
        setGame(g);
        gameRef.current = g;
        setSaved(JSON.stringify(g));
        undo.current = [];
        redo.current = [];
        setSelection({ kind: "assets", id: g.player.asset });
        setBuilt(null);
        setEventId("");
        setTextId("");
        setFrame(0);
    };
    useEffect(() => {
        window.caravan
            .init()
            .then((data) => {
                setProjects(data.projects);
                setName(data.name);
                setGlyphs(data.glyphs);
                applyProject(data.game);
                if (
                    data.recovery &&
                    confirm(
                        "自動復旧コピーがあります。未保存の編集を復元しますか？",
                    )
                ) {
                    setGame(data.recovery);
                    gameRef.current = data.recovery;
                }
            })
            .catch((e) => setError(e.message));
        return window.caravan.onLog((log) =>
            setLogs((s) => (s + log).slice(-150000)),
        );
    }, []);
    useEffect(() => {
        window.caravan.dirty(dirty);
        if (!game || !dirty) return;
        const timer = setTimeout(
            () =>
                window.caravan
                    .recover(name, game)
                    .catch((e) => setError(`復旧コピー保存失敗：${e.message}`)),
            800,
        );
        return () => clearTimeout(timer);
    }, [content, saved, name]);
    const save = async () => {
        const g = gameRef.current;
        if (!g) return;
        try {
            await window.caravan.save(name, g);
            setSaved(JSON.stringify(g));
            setError("");
        } catch (e) {
            setError((e as Error).message);
        }
    };
    const build = async () => {
        const g = gameRef.current;
        if (!g || building) return;
        setBuilding(true);
        setLogs("");
        setTab("build");
        const snapshot = JSON.stringify(g);
        setBuildSnapshot(snapshot);
        try {
            const result = await window.caravan.build(name, g, config);
            setBuilt(result);
            if (result.ok) {
                setSaved(snapshot);
                setError("");
            } else setError(result.error ?? "ビルド失敗");
        } catch (e) {
            setBuilt({
                ok: false,
                revision: "",
                configuration: config,
                error: (e as Error).message,
            });
            setError((e as Error).message);
        } finally {
            setBuilding(false);
        }
    };
    const actions = useRef({ save, build, doUndo, doRedo });
    actions.current = { save, build, doUndo, doRedo };
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key.toLowerCase() === "s") {
                e.preventDefault();
                void actions.current.save();
            }
            if (e.ctrlKey && e.key.toLowerCase() === "z") {
                e.preventDefault();
                e.shiftKey
                    ? actions.current.doRedo()
                    : actions.current.doUndo();
            }
            if (e.ctrlKey && e.key.toLowerCase() === "y") {
                e.preventDefault();
                actions.current.doRedo();
            }
            if (e.key === "F5") {
                e.preventDefault();
                void actions.current.build();
            }
        };
        window.addEventListener("keydown", key);
        return () => window.removeEventListener("keydown", key);
    }, []);
    const diagnostics = useMemo(() => {
        try {
            return game ? validate(game) : [];
        } catch (e) {
            return [
                {
                    severity: "error" as const,
                    target: "project",
                    message: (e as Error).message,
                },
            ];
        }
    }, [game]);
    if (!game)
        return (
            <div className="loading">
                <h1>
                    CARAVAN <span>EDITOR</span>
                </h1>
                <p>{error || "作品を読み込んでいます…"}</p>
            </div>
        );
    const collection = (g: Game, kind = selection.kind): any[] =>
        Array.isArray((g as any)[kind]) ? (g as any)[kind] : [];
    const object =
            selection.kind === "player"
                ? game.player
                : selection.kind === "project"
                  ? game
                  : collection(game).find((o) => o.id === selection.id),
        asset = selection.kind === "assets" ? (object as Asset) : null,
        stage = selection.kind === "stages" ? (object as Stage) : null,
        screen = selection.kind === "screens" ? object : null;
    const choose = (kind: string, id: string) => {
        setSelection({ kind, id });
        setFrame(0);
        setEventId(
            kind === "stages"
                ? (gameRef.current?.stages.find((s) => s.id === id)?.events[0]
                      ?.id ?? "")
                : "",
        );
        setTextId(
            kind === "screens"
                ? (gameRef.current?.screens.find((s) => s.id === id)?.items[0]
                      ?.id ?? "")
                : "",
        );
        if (kind === "assets") {
            const a = gameRef.current?.assets.find((a) => a.id === id);
            setZoom(a?.kind === "sprite" ? 16 : a?.kind === "tileset" ? 6 : 3);
        }
    };
    const replace = (value: any) =>
        change((g) => {
            if (selection.kind === "player") {
                g.player = value;
                return;
            }
            if (selection.kind === "project") {
                Object.assign(g, value);
                return;
            }
            const list = collection(g),
                i = list.findIndex((o) => o.id === selection.id);
            if (i < 0) return;
            if (selection.kind === "assets") {
                const old = list[i] as Asset,
                    a = value as Asset;
                a.width = Math.max(
                    8,
                    Math.min(a.kind === "sprite" ? 32 : 160, a.width),
                );
                a.height = Math.max(
                    8,
                    Math.min(a.kind === "sprite" ? 32 : 144, a.height),
                );
                if (old.width !== a.width || old.height !== a.height) {
                    a.frames = a.frames.map((f) => ({
                        ...f,
                        pixels: Array.from(
                            { length: a.width * a.height },
                            (_, n) => {
                                const x = n % a.width,
                                    y = Math.floor(n / a.width);
                                return x < old.width && y < old.height
                                    ? f.pixels[y * old.width + x]
                                    : 0;
                            },
                        ),
                    }));
                    a.origin.x = Math.min(a.origin.x, a.width);
                    a.origin.y = Math.min(a.origin.y, a.height);
                    a.hitbox = { x: 0, y: 0, w: a.width, h: a.height };
                }
            }
            if (
                selection.kind === "stages" &&
                list[i].height !== value.height
            ) {
                value.height = Math.max(18, Math.min(512, value.height));
                value.tiles = Array.from(
                    { length: value.height * 20 },
                    (_, n) => value.tiles[n] ?? 0,
                );
                value.walls = Array.from(
                    { length: value.height * 20 },
                    (_, n) => value.walls[n] ?? 0,
                );
            }
            list[i] = value;
        });
    const duplicate = (from = object) => {
        if (!from || !collection(game).length) return;
        const copy = clone(from);
        copy.id = uid(selection.kind);
        copy.name += " コピー";
        if (selection.kind === "assets")
            copy.frames = copy.frames.map((f: any) => ({
                ...f,
                id: uid("frame"),
                image: `images/${uid("image")}.png`,
            }));
        if (selection.kind === "bosses")
            copy.phases = copy.phases.map((p: any) => ({
                ...p,
                id: uid("phase"),
            }));
        if (selection.kind === "stages")
            copy.events = copy.events.map((e: any) => ({
                ...e,
                id: uid("event"),
            }));
        change((g) => {
            collection(g).push(copy);
            if (selection.kind === "stages") g.stageOrder.push(copy.id);
        });
        choose(selection.kind, copy.id);
    };
    const add = () => {
        if (selection.kind === "assets") {
            setModal("asset");
            return;
        }
        if (
            selection.kind === "screens" ||
            selection.kind === "player" ||
            selection.kind === "project"
        )
            return;
        const first = collection(game)[0];
        duplicate(first);
    };
    const addEvent = () => {
        if (!stage) return;
        const e: StageEvent = {
            id: uid("event"),
            frame: 0,
            kind: "enemy",
            ref: game.enemies[0].id,
            x: 80,
            y: 0,
            count: 1,
            spacing: 16,
            interval: 0,
            value: 1,
        };
        replace({ ...stage, events: [...stage.events, e] });
        setEventId(e.id);
    };
    const activeEvent = stage?.events.find((e) => e.id === eventId),
        activeText = screen?.items.find((t: any) => t.id === textId),
        spriteTiles = game.assets
            .filter((a) => a.kind === "sprite")
            .reduce(
                (n, a) => n + ((a.width * a.height) / 64) * a.frames.length,
                0,
            );
    const openProject = async (next: string) => {
        if (
            dirty &&
            !confirm(
                "未保存の変更があります。復旧コピーを残して作品を切り替えますか？",
            )
        )
            return;
        try {
            if (dirty) await window.caravan.recover(name, game);
            const data = await window.caravan.open(next);
            setName(next);
            applyProject(data.game);
            if (
                data.recovery &&
                confirm("この作品の復旧コピーを読み込みますか？")
            ) {
                setGame(data.recovery);
                gameRef.current = data.recovery;
            }
        } catch (e) {
            setError((e as Error).message);
        }
    };
    const locate = (id: string) => {
        for (const [kind] of categories) {
            const o = collection(game, kind).find(
                (o) => o.id === id || o.items?.some((t: any) => t.id === id),
            );
            if (o) {
                choose(kind, o.id);
                return;
            }
        }
    };
    return (
        <div className="app">
            <header>
                <div className="brand">
                    <span className="brand-mark">C</span>
                    <div>
                        CARAVAN <b>EDITOR</b>
                        <small>GAME BOY / COLOR · DEVELOPMENT STUDIO</small>
                    </div>
                </div>
                <div className="project-picker">
                    <select
                        aria-label="作品"
                        value={name}
                        onChange={(e) => openProject(e.target.value)}
                    >
                        {projects.map((p) => (
                            <option key={p.name} value={p.name}>
                                {p.title} / {p.name}
                            </option>
                        ))}
                    </select>
                    <span className={`status-dot ${dirty ? "unsaved" : ""}`} />
                    <span>{dirty ? "未保存" : "保存済み"}</span>
                </div>
                <div className="header-actions">
                    <button
                        onClick={() => {
                            setModal("new");
                            setNewId("");
                        }}
                    >
                        新規作品
                    </button>
                    <button
                        onClick={() => {
                            setModal("copy");
                            setNewId("");
                            setNewTitle(game.title);
                        }}
                    >
                        作品を複製
                    </button>
                    <button disabled={building} onClick={save}>
                        保存 <kbd>Ctrl S</kbd>
                    </button>
                    <select
                        value={config}
                        onChange={(e) => setConfig(e.target.value)}
                    >
                        <option>Debug</option>
                        <option>Release</option>
                    </select>
                    <button
                        className="accent"
                        disabled={building}
                        onClick={build}
                    >
                        {building ? "ビルド中…" : "▶ ROMビルド"} <kbd>F5</kbd>
                    </button>
                </div>
            </header>
            <div className="workspace">
                <aside className="library">
                    <div className="panel-title">作品ライブラリ</div>
                    <input
                        className="search"
                        placeholder="名前・IDを検索…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {categories.map(([kind, label, icon]) => (
                        <section key={kind}>
                            <button
                                className={`category ${selection.kind === kind ? "selected" : ""}`}
                                onClick={() =>
                                    choose(
                                        kind,
                                        kind === "project" || kind === "player"
                                            ? kind
                                            : (collection(game, kind)[0]?.id ??
                                                  ""),
                                    )
                                }
                            >
                                <span>{icon}</span>
                                {label}
                                <small>
                                    {collection(game, kind).length || ""}
                                </small>
                            </button>
                            {selection.kind === kind &&
                                collection(game, kind)
                                    .filter((o) =>
                                        `${o.name} ${o.id}`
                                            .toLowerCase()
                                            .includes(search.toLowerCase()),
                                    )
                                    .map((o) => (
                                        <button
                                            key={o.id}
                                            className={`asset-row ${selection.id === o.id ? "selected" : ""}`}
                                            onClick={() => choose(kind, o.id)}
                                        >
                                            <span className="tiny-icon">
                                                {kind === "assets" ? "▧" : "·"}
                                            </span>
                                            <span>
                                                {o.name}
                                                <small>{o.id}</small>
                                            </span>
                                        </button>
                                    ))}
                        </section>
                    ))}
                    <div className="library-footer">
                        <button onClick={add}>＋ 追加</button>
                        <button
                            disabled={
                                !object ||
                                ["player", "project", "screens"].includes(
                                    selection.kind,
                                )
                            }
                            onClick={() => duplicate()}
                        >
                            複製
                        </button>
                    </div>
                    <div className="budget">
                        <small>SPRITE TILE BUDGET</small>
                        <div className="meter">
                            <i
                                style={{
                                    width: `${Math.min(100, (spriteTiles / 128) * 100)}%`,
                                }}
                            />
                        </div>
                        <span className={spriteTiles > 128 ? "warning" : ""}>
                            {spriteTiles} / 128 タイル
                        </span>
                        <span>{game.palettes.length} / 8 パレット</span>
                        <small>
                            背景＋画面文字：各128タイル以内
                            <br />
                            OAM・走査線はプレビューで確認
                            <br />
                            RAM・ROMはビルドログに表示
                        </small>
                    </div>
                </aside>
                <main>
                    <div className="document-toolbar">
                        <div>
                            <span className="eyebrow">
                                {
                                    categories.find(
                                        (c) => c[0] === selection.kind,
                                    )?.[1]
                                }
                            </span>
                            <h1>
                                {object?.name ??
                                    (selection.kind === "player"
                                        ? "自機設定"
                                        : game.title)}
                            </h1>
                        </div>
                        <div className="toolbar">
                            <button
                                disabled={!undo.current.length}
                                onClick={doUndo}
                            >
                                ↶
                            </button>
                            <button
                                disabled={!redo.current.length}
                                onClick={doRedo}
                            >
                                ↷
                            </button>
                            <select
                                aria-label="表示モード"
                                value={dmg ? "dmg" : "cgb"}
                                onChange={(e) =>
                                    setDmg(e.target.value === "dmg")
                                }
                            >
                                <option value="cgb">CGBカラー</option>
                                <option value="dmg">DMG 4階調</option>
                            </select>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={grid}
                                    onChange={(e) => setGrid(e.target.checked)}
                                />
                                グリッド
                            </label>
                            {asset && (
                                <select
                                    value={zoom}
                                    onChange={(e) =>
                                        setZoom(Number(e.target.value))
                                    }
                                >
                                    {[2, 3, 4, 6, 8, 12, 16, 24, 32].map(
                                        (n) => (
                                            <option value={n} key={n}>
                                                {n * 100}%
                                            </option>
                                        ),
                                    )}
                                </select>
                            )}
                        </div>
                    </div>
                    {error && (
                        <div className="error" role="alert">
                            <span>{error}</span>
                            <button onClick={() => setError("")}>×</button>
                        </div>
                    )}
                    <div className="editing">
                        <Boundary key={selection.kind + selection.id}>
                            {asset ? (
                                <>
                                    <AssetCanvas
                                        game={game}
                                        asset={asset}
                                        frame={frame}
                                        onChange={replace}
                                        dmg={dmg}
                                        grid={grid}
                                        zoom={zoom}
                                        error={setError}
                                    />
                                    <div className="frames">
                                        <span>アニメーション</span>
                                        {asset.frames.map((f, i) => (
                                            <button
                                                key={f.id}
                                                className={
                                                    frame === i ? "active" : ""
                                                }
                                                onClick={() => setFrame(i)}
                                            >
                                                {i + 1} · {f.duration}f
                                            </button>
                                        ))}
                                        <button
                                            onClick={() => {
                                                const f = clone(
                                                    asset.frames[
                                                        Math.min(
                                                            frame,
                                                            asset.frames
                                                                .length - 1,
                                                        )
                                                    ],
                                                );
                                                f.id = uid("frame");
                                                f.image = `images/${uid("image")}.png`;
                                                replace({
                                                    ...asset,
                                                    frames: [
                                                        ...asset.frames,
                                                        f,
                                                    ],
                                                });
                                                setFrame(asset.frames.length);
                                            }}
                                        >
                                            ＋ フレーム複製
                                        </button>
                                        <button
                                            disabled={asset.frames.length < 2}
                                            onClick={() => {
                                                replace({
                                                    ...asset,
                                                    frames: asset.frames.filter(
                                                        (_, i) => i !== frame,
                                                    ),
                                                });
                                                setFrame(0);
                                            }}
                                        >
                                            フレーム削除
                                        </button>
                                        <input
                                            aria-label="フレーム表示時間"
                                            type="number"
                                            min={1}
                                            max={255}
                                            value={
                                                asset.frames[frame]?.duration ??
                                                1
                                            }
                                            onChange={(e) =>
                                                replace({
                                                    ...asset,
                                                    frames: asset.frames.map(
                                                        (f, i) =>
                                                            i === frame
                                                                ? {
                                                                      ...f,
                                                                      duration:
                                                                          Number(
                                                                              e
                                                                                  .target
                                                                                  .value,
                                                                          ),
                                                                  }
                                                                : f,
                                                    ),
                                                })
                                            }
                                        />
                                        <small>frame</small>
                                    </div>
                                </>
                            ) : stage ? (
                                <MapCanvas
                                    game={game}
                                    stage={stage}
                                    onChange={replace}
                                    dmg={dmg}
                                    grid={grid}
                                    eventId={eventId}
                                    onEvent={setEventId}
                                />
                            ) : screen ? (
                                <ScreenCanvas
                                    game={game}
                                    screen={screen}
                                    onChange={replace}
                                    glyphs={glyphs}
                                    dmg={dmg}
                                    selected={textId}
                                    onSelect={setTextId}
                                />
                            ) : ["enemies", "bosses"].includes(
                                  selection.kind,
                              ) && object ? (
                                selection.kind === "bosses" ? (
                                    <BossCanvas
                                        boss={object}
                                        onChange={replace}
                                    />
                                ) : (
                                    <MotionCanvas
                                        motion={object.motion}
                                        onChange={(motion) =>
                                            replace({ ...object, motion })
                                        }
                                    />
                                )
                            ) : selection.kind === "project" ? (
                                <div className="project-overview">
                                    <span className="eyebrow">PROJECT</span>
                                    <h2>{game.title}</h2>
                                    <p>
                                        素材 → 即時プレビュー → ROMビルド → GB /
                                        GBCでプレイ
                                    </p>
                                    <div className="overview-grid">
                                        <div>
                                            <strong>
                                                {game.assets.length}
                                            </strong>
                                            素材
                                        </div>
                                        <div>
                                            <strong>
                                                {game.stages.length}
                                            </strong>
                                            ステージ
                                        </div>
                                        <div>
                                            <strong>
                                                {game.patterns.length}
                                            </strong>
                                            弾幕
                                        </div>
                                    </div>
                                    <h3>通常モードのステージ順</h3>
                                    {game.stageOrder.map((id, i) => (
                                        <div className="order-row" key={id}>
                                            <span>
                                                {String(i + 1).padStart(2, "0")}
                                            </span>
                                            {
                                                game.stages.find(
                                                    (s) => s.id === id,
                                                )?.name
                                            }
                                            <button
                                                disabled={!i}
                                                onClick={() =>
                                                    change((g) => {
                                                        [
                                                            g.stageOrder[i - 1],
                                                            g.stageOrder[i],
                                                        ] = [
                                                            g.stageOrder[i],
                                                            g.stageOrder[i - 1],
                                                        ];
                                                    })
                                                }
                                            >
                                                ↑
                                            </button>
                                            <button
                                                disabled={
                                                    i ===
                                                    game.stageOrder.length - 1
                                                }
                                                onClick={() =>
                                                    change((g) => {
                                                        [
                                                            g.stageOrder[i],
                                                            g.stageOrder[i + 1],
                                                        ] = [
                                                            g.stageOrder[i + 1],
                                                            g.stageOrder[i],
                                                        ];
                                                    })
                                                }
                                            >
                                                ↓
                                            </button>
                                            <button
                                                disabled={
                                                    game.stageOrder.length === 1
                                                }
                                                onClick={() =>
                                                    change((g) =>
                                                        g.stageOrder.splice(
                                                            i,
                                                            1,
                                                        ),
                                                    )
                                                }
                                            >
                                                順序から除外
                                            </button>
                                        </div>
                                    ))}
                                    {game.stages
                                        .filter(
                                            (s) =>
                                                !game.stageOrder.includes(s.id),
                                        )
                                        .map((s) => (
                                            <button
                                                key={s.id}
                                                onClick={() =>
                                                    change((g) =>
                                                        g.stageOrder.push(s.id),
                                                    )
                                                }
                                            >
                                                ＋ {s.name}
                                            </button>
                                        ))}
                                    <p className="hint">
                                        キャラバンは開始ステージのみ。通常モードはこの順番に進みます。
                                    </p>
                                </div>
                            ) : selection.kind === "palettes" ? (
                                <div className="palette-display">
                                    {object?.colors.map(
                                        (c: string, i: number) => (
                                            <div
                                                key={i}
                                                style={{ background: c }}
                                            >
                                                <span>{i}</span>
                                                <small>{c}</small>
                                            </div>
                                        ),
                                    )}
                                </div>
                            ) : (
                                <div className="pattern-info">
                                    <span className="orb">✳</span>
                                    <h2>{object?.name ?? "対象を選択"}</h2>
                                    <p>
                                        右側で編集し、下の「選択対象」プレビューで即時確認。
                                    </p>
                                    <p className="hint">
                                        方向は22.5°単位、速度は1/16px単位に量子化されます。
                                    </p>
                                </div>
                            )}
                        </Boundary>
                    </div>
                    {stage && (
                        <Timeline
                            stage={stage}
                            selected={eventId}
                            onSelect={setEventId}
                            onChange={replace}
                        />
                    )}
                    <section className="bottom-panel">
                        <div className="bottom-tabs">
                            <button
                                className={tab === "preview" ? "selected" : ""}
                                onClick={() => setTab("preview")}
                            >
                                プレビュー
                            </button>
                            <button
                                className={tab === "rom" ? "selected" : ""}
                                onClick={() => setTab("rom")}
                            >
                                ROMプレイヤー
                            </button>
                            <button
                                className={tab === "build" ? "selected" : ""}
                                onClick={() => setTab("build")}
                            >
                                ビルド・検証{" "}
                                {diagnostics.length > 0 && (
                                    <b>{diagnostics.length}</b>
                                )}
                            </button>
                            {built?.ok && (
                                <span
                                    className={
                                        content !== buildSnapshot
                                            ? "warning"
                                            : "success"
                                    }
                                >
                                    {content !== buildSnapshot
                                        ? "● ROMは編集前の内容です"
                                        : "● 最新のビルド"}{" "}
                                    · {(built.size! / 1024).toFixed(0)} KiB
                                </span>
                            )}
                            {built && !built.ok && (
                                <span className="warning">
                                    ビルド失敗 · 新しいROMはありません
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                display: tab === "preview" ? "block" : "none",
                            }}
                        >
                            <Boundary
                                key={`preview-${diagnostics.length ? content : "valid"}`}
                            >
                                {diagnostics.some(
                                    (d) => d.severity === "error",
                                ) ? (
                                    <p className="notice">
                                        定義エラーを修正すると即時プレビューを再開します。
                                    </p>
                                ) : (
                                    <Preview
                                        active={tab === "preview"}
                                        game={game}
                                        dmg={dmg}
                                        glyphs={glyphs}
                                        kind={selection.kind}
                                        id={selection.id}
                                    />
                                )}
                            </Boundary>
                        </div>
                        <div
                            style={{
                                display: tab === "rom" ? "block" : "none",
                            }}
                        >
                            <RomPreview
                                active={tab === "rom"}
                                name={name}
                                build={built}
                                dmg={dmg}
                                error={setError}
                            />
                        </div>
                        <div
                            className="build-pane"
                            style={{
                                display: tab === "build" ? "block" : "none",
                            }}
                        >
                            {diagnostics.map((d, i) => (
                                <button
                                    className="diagnostic"
                                    key={i}
                                    onClick={() => locate(d.target)}
                                >
                                    {d.severity === "error" ? "!" : "△"}{" "}
                                    {d.target}：{d.message}
                                </button>
                            ))}
                            {!diagnostics.length && (
                                <p className="success">
                                    ✓ 作品定義・参照・画像インデックスの検証 OK
                                </p>
                            )}
                            {built?.romPath && (
                                <p className="output-path">
                                    出力：{built.romPath}
                                </p>
                            )}
                            {built?.ok && (
                                <p>
                                    ROM {built.size} bytes · WRAM{" "}
                                    {built.ramBytes ?? "ログを参照"} / 8192
                                    bytes · OBJ {built.spriteTiles} / 128 tiles
                                </p>
                            )}
                            <pre>
                                {logs ||
                                    "ROMビルドを実行すると、変換・GBDK・ROM容量のログが表示されます。"}
                            </pre>
                        </div>
                    </section>
                </main>
                <aside className="inspector">
                    <div className="panel-title">
                        インスペクター{" "}
                        <span>{object?.id ?? selection.kind}</span>
                    </div>
                    <Boundary key={`form-${selection.kind}-${selection.id}`}>
                        {object && (
                            <Form
                                value={object}
                                game={game}
                                onChange={replace}
                                context={
                                    asset
                                        ? "asset"
                                        : stage
                                          ? "stage"
                                          : selection.kind === "patterns"
                                            ? "pattern"
                                            : ""
                                }
                                omit={
                                    selection.kind === "project"
                                        ? [
                                              "assets",
                                              "patterns",
                                              "enemies",
                                              "bosses",
                                              "stages",
                                              "screens",
                                              "palettes",
                                              "player",
                                          ]
                                        : asset
                                          ? ["kind"]
                                          : selection.kind === "bosses"
                                            ? ["motion", "pattern", "attacks"]
                                            : []
                                }
                            />
                        )}
                    </Boundary>
                    {stage && (
                        <details open>
                            <summary>
                                ステージイベント{" "}
                                <small>{stage.events.length}</small>
                            </summary>
                            <button onClick={addEvent}>＋ イベント追加</button>
                            <select
                                size={6}
                                value={eventId}
                                onChange={(e) => setEventId(e.target.value)}
                            >
                                {[...stage.events]
                                    .sort((a, b) => a.frame - b.frame)
                                    .map((e) => (
                                        <option key={e.id} value={e.id}>
                                            {e.frame}f · {e.kind} · {e.ref}
                                        </option>
                                    ))}
                            </select>
                            {activeEvent && (
                                <>
                                    <Form
                                        value={activeEvent}
                                        game={game}
                                        context="event"
                                        onChange={(v) => {
                                            if (v.kind !== activeEvent.kind)
                                                v.ref =
                                                    v.kind === "boss"
                                                        ? game.bosses[0].id
                                                        : game.enemies[0].id;
                                            replace({
                                                ...stage,
                                                events: stage.events.map((e) =>
                                                    e.id === eventId ? v : e,
                                                ),
                                            });
                                        }}
                                    />
                                    <button
                                        onClick={() => {
                                            const e = {
                                                ...clone(activeEvent),
                                                id: uid("event"),
                                                frame: activeEvent.frame + 60,
                                            };
                                            replace({
                                                ...stage,
                                                events: [...stage.events, e],
                                            });
                                            setEventId(e.id);
                                        }}
                                    >
                                        イベント複製
                                    </button>
                                    <button
                                        onClick={() => {
                                            replace({
                                                ...stage,
                                                events: stage.events.filter(
                                                    (e) => e.id !== eventId,
                                                ),
                                            });
                                            setEventId("");
                                        }}
                                    >
                                        イベント削除
                                    </button>
                                </>
                            )}
                        </details>
                    )}
                    {screen && (
                        <details open>
                            <summary>文字・表示部品</summary>
                            <button
                                onClick={() => {
                                    const t = {
                                        id: uid("text"),
                                        text: "あたらしいもじ",
                                        x: 1,
                                        y: screen.id === "hud" ? 0 : 3,
                                        palette: screen.palette,
                                        binding: "none",
                                    };
                                    replace({
                                        ...screen,
                                        items: [...screen.items, t],
                                    });
                                    setTextId(t.id);
                                }}
                            >
                                ＋ 文字を追加
                            </button>
                            <select
                                size={5}
                                value={textId}
                                onChange={(e) => setTextId(e.target.value)}
                            >
                                {screen.items.map((t: any) => (
                                    <option key={t.id} value={t.id}>
                                        {t.text || t.binding}
                                    </option>
                                ))}
                            </select>
                            {activeText && (
                                <>
                                    <Form
                                        value={activeText}
                                        game={game}
                                        onChange={(v) =>
                                            replace({
                                                ...screen,
                                                items: screen.items.map(
                                                    (t: any) =>
                                                        t.id === textId ? v : t,
                                                ),
                                            })
                                        }
                                    />
                                    <button
                                        onClick={() => {
                                            const t = {
                                                ...clone(activeText),
                                                id: uid("text"),
                                                y: Math.min(
                                                    screen.id === "hud"
                                                        ? 1
                                                        : 17,
                                                    activeText.y + 1,
                                                ),
                                            };
                                            replace({
                                                ...screen,
                                                items: [...screen.items, t],
                                            });
                                            setTextId(t.id);
                                        }}
                                    >
                                        部品複製
                                    </button>
                                    <button
                                        onClick={() => {
                                            replace({
                                                ...screen,
                                                items: screen.items.filter(
                                                    (t: any) => t.id !== textId,
                                                ),
                                            });
                                            setTextId("");
                                        }}
                                    >
                                        部品削除
                                    </button>
                                </>
                            )}
                        </details>
                    )}
                    {object &&
                        !["player", "project", "screens"].includes(
                            selection.kind,
                        ) && (
                            <div className="inspector-actions">
                                <button
                                    onClick={() =>
                                        (clipboard.current = {
                                            kind: selection.kind,
                                            object: clone(object),
                                        })
                                    }
                                >
                                    対象をコピー
                                </button>
                                <button
                                    onClick={() => {
                                        if (
                                            clipboard.current?.kind ===
                                            selection.kind
                                        )
                                            duplicate(clipboard.current.object);
                                        else
                                            setError(
                                                "同じ種類の一覧を選択して貼り付けてください",
                                            );
                                    }}
                                >
                                    コピーから複製
                                </button>
                                <button
                                    className="danger"
                                    onClick={() => {
                                        if (
                                            !confirm(
                                                "この対象を削除しますか？参照先が残る場合はビルドエラーになります。",
                                            )
                                        )
                                            return;
                                        change((g) => {
                                            const a = collection(g),
                                                i = a.findIndex(
                                                    (o) =>
                                                        o.id === selection.id,
                                                );
                                            if (i >= 0) a.splice(i, 1);
                                        });
                                    }}
                                >
                                    対象を削除
                                </button>
                            </div>
                        )}
                    <div className="inspector-note">
                        変更はすぐにプレビューへ反映されます。
                        <br />
                        Ctrl+S 保存 · Ctrl+Z Undo · Ctrl+Y Redo
                        <br />
                        実機向け制約はビルド・検証で確認。
                    </div>
                </aside>
            </div>
            <footer>
                <span>● LOCAL / OFFLINE READY</span>
                <span>{name} / assets-src/game.json</span>
                <span>GBDK 4.5.0 · 160×144 · 60 ticks/sec</span>
            </footer>
            {modal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h2>
                            {modal === "asset"
                                ? "素材を追加"
                                : modal === "new"
                                  ? "テンプレートから新規作品"
                                  : "作品を複製"}
                        </h2>
                        {modal === "asset" ? (
                            <>
                                <Field label="素材の種類">
                                    <Select
                                        value={assetKind}
                                        options={[
                                            {
                                                id: "sprite",
                                                name: "スプライト（8×8）",
                                            },
                                            {
                                                id: "tileset",
                                                name: "タイルセット（32×32）",
                                            },
                                            {
                                                id: "screen",
                                                name: "画面背景（160×144）",
                                            },
                                        ]}
                                        onChange={setAssetKind}
                                    />
                                </Field>
                                <button
                                    className="accent"
                                    onClick={() => {
                                        const id = uid("asset"),
                                            w =
                                                assetKind === "screen"
                                                    ? 160
                                                    : assetKind === "tileset"
                                                      ? 32
                                                      : 8,
                                            h =
                                                assetKind === "screen"
                                                    ? 144
                                                    : w,
                                            a: Asset = {
                                                id,
                                                name: "新しい素材",
                                                kind: assetKind as Asset["kind"],
                                                width: w,
                                                height: h,
                                                palette: 0,
                                                origin: { x: 0, y: 0 },
                                                hitbox: { x: 0, y: 0, w, h },
                                                emitters: [],
                                                frames: [
                                                    {
                                                        id: uid("frame"),
                                                        image: `images/${uid("image")}.png`,
                                                        duration: 8,
                                                        pixels: Array(
                                                            w * h,
                                                        ).fill(0),
                                                    },
                                                ],
                                            };
                                        change((g) => g.assets.push(a));
                                        choose("assets", id);
                                        setModal("");
                                    }}
                                >
                                    追加
                                </button>
                            </>
                        ) : (
                            <>
                                <Field label="作品ID（英数字・ハイフン）">
                                    <input
                                        autoFocus
                                        value={newId}
                                        onChange={(e) =>
                                            setNewId(e.target.value)
                                        }
                                    />
                                </Field>
                                <Field label="タイトル（英数字・かな）">
                                    <input
                                        value={newTitle}
                                        onChange={(e) =>
                                            setNewTitle(e.target.value)
                                        }
                                    />
                                </Field>
                                <p>
                                    元作品は変更されません。新しいprojectsフォルダへ独立して保存します。
                                </p>
                                <button
                                    className="accent"
                                    onClick={async () => {
                                        try {
                                            if (dirty)
                                                await window.caravan.recover(
                                                    name,
                                                    game,
                                                );
                                            const template =
                                                modal === "new"
                                                    ? (
                                                          await window.caravan.open(
                                                              "star-caravan",
                                                          )
                                                      ).game
                                                    : game;
                                            const result =
                                                await window.caravan.create(
                                                    newId,
                                                    newTitle,
                                                    template,
                                                );
                                            setName(newId);
                                            setProjects(result.projects);
                                            applyProject(result.game);
                                            setModal("");
                                        } catch (e) {
                                            setError((e as Error).message);
                                            setModal("");
                                        }
                                    }}
                                >
                                    作成
                                </button>
                            </>
                        )}
                        <button onClick={() => setModal("")}>キャンセル</button>
                    </div>
                </div>
            )}
        </div>
    );
}
createRoot(document.getElementById("root")!).render(<App />);
