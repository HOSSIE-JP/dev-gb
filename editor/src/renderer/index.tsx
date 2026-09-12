import { useColumns } from "./column-resize";
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
import { VictoryDialogueCanvas } from "./victory-dialogue-canvas";
import { PlayerPresentationCanvas } from "./player-presentation-canvas";
import { StartupPreview } from "./startup-preview";
import { Preview, RomPreview } from "./preview";
import { Timeline } from "./timeline";
import { createEntity } from "./entity-defaults";
import { resizeStage } from "../shared/stage-space";
import { PowerUpFields, DestructibleFields } from "./shooter-fields";
import {
    categories,
    type Selection,
    LibraryPanel,
    ProjectOverview,
    CommandPalette,
    BuildPanel,
    readPreference,
    writePreference,
} from "./workspace";
import "./style.css";
import "./workspace.css";

class Boundary extends React.Component<
    { children: React.ReactNode; resetKey?: string },
    { error: string }
> {
    state = { error: "" };
    static getDerivedStateFromError(e: Error) {
        return { error: e.message };
    }
    componentDidUpdate(previous: { resetKey?: string }) {
        if (this.state.error && previous.resetKey !== this.props.resetKey)
            this.setState({ error: "" });
    }
    render() {
        return this.state.error ? (
            <div className="error">
                表示を一時停止しました。定義・参照を確認してください：
                {this.state.error}
                <button onClick={() => this.setState({ error: "" })}>
                    再表示
                </button>
            </div>
        ) : (
            this.props.children
        );
    }
}
function App() {
    const [game, setGame] = useState<Game | null>(null),
        [projects, setProjects] = useState<ProjectInfo[]>([]),
        [name, setName] = useState(""),
        [glyphs, setGlyphs] = useState<Record<string, number[]>>({}),
        [selection, setSelection] = useState<Selection>({
            kind: "project",
            id: "project",
        }),
        [search, setSearch] = useState(""),
        [frame, setFrame] = useState(0),
        [eventId, setEventId] = useState(""),
        [textId, setTextId] = useState(""),
        [dmg, setDmg] = useState(() => readPreference("dmg", false)),
        [grid, setGrid] = useState(() => readPreference("grid", true)),
        [zoom, setZoom] = useState(16),
        [saved, setSaved] = useState(""),
        [error, setError] = useState(""),
        [logs, setLogs] = useState(""),
        [building, setBuilding] = useState(false),
        [config, setConfig] = useState(() =>
            readPreference<string>("config", "Debug") === "Release"
                ? "Release"
                : "Debug",
        ),
        [built, setBuilt] = useState<BuildResult | null>(null),
        [buildSnapshot, setBuildSnapshot] = useState(""),
        [modal, setModal] = useState(""),
        [newId, setNewId] = useState(""),
        [newTitle, setNewTitle] = useState("NEW CARAVAN"),
        [newTemplate, setNewTemplate] = useState("nova-spear"),
        [assetKind, setAssetKind] = useState("sprite"),
        [tab, setTab] = useState("preview"),
        [commandOpen, setCommandOpen] = useState(false),
        [inspectorVisible, setInspectorVisible] = useState(() =>
            readPreference("inspector", true),
        ),
        [panelVisible, setPanelVisible] = useState(() =>
            readPreference("panel", true),
        ),
        [romAutoLoad, setRomAutoLoad] = useState(0),
        [saving, setSaving] = useState(false),
        [opening, setOpening] = useState(false),
        [cancelling, setCancelling] = useState(false),
        [toolchain, setToolchain] = useState<Awaited<
            ReturnType<typeof window.caravan.toolchain>
        > | null>(null);
    const columns = useColumns(inspectorVisible);
    const buildBusy = useRef(false),
        saveBusy = useRef(false),
        openBusy = useRef(false);
    useEffect(() => {
        writePreference("dmg", dmg);
        writePreference("grid", grid);
        writePreference("config", config);
        writePreference("inspector", inspectorVisible);
        writePreference("panel", panelVisible);
    }, [dmg, grid, config, inspectorVisible, panelVisible]);
    useEffect(() => {
        void window.caravan
            .toolchain()
            .then(setToolchain)
            .catch((e) => setError(e.message));
    }, []);
    useEffect(() => {
        if (!modal) return;
        const previous = document.activeElement as HTMLElement | null;
        const dialog = document.querySelector<HTMLElement>(
            ".modal[role=dialog]",
        );
        if (!dialog) return;
        const focusables = () =>
            Array.from(
                dialog.querySelectorAll<HTMLElement>(
                    'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
                ),
            );
        focusables()[0]?.focus();
        const trap = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;
            const controls = focusables(),
                first = controls[0],
                last = controls[controls.length - 1];
            if (!first) {
                event.preventDefault();
                return;
            }
            if (
                event.shiftKey &&
                (document.activeElement === first ||
                    !dialog.contains(document.activeElement))
            ) {
                event.preventDefault();
                last.focus();
            } else if (
                !event.shiftKey &&
                (document.activeElement === last ||
                    !dialog.contains(document.activeElement))
            ) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", trap);
        return () => {
            document.removeEventListener("keydown", trap);
            previous?.focus();
        };
    }, [modal]);
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
        setSelection({ kind: "project", id: "project" });
        setSearch("");
        setBuildSnapshot("");
        setLogs("");
        setError("");
        setRomAutoLoad(0);
        setBuilt(null);
        setEventId("");
        setTextId("");
        setFrame(0);
    };
    useEffect(() => {
        window.caravan
            .init()
            .then(async (data) => {
                setProjects(data.projects);
                setName(data.name);
                setGlyphs(data.glyphs);
                applyProject(data.game);
                if (data.warnings?.length) setError(data.warnings.join("\n"));
                if (
                    data.recovery &&
                    await window.caravan.confirm(
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
        window.caravan.dirty(dirty, name, game ?? undefined);
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
        if (!g || saveBusy.current || buildBusy.current || openBusy.current)
            return;
        saveBusy.current = true;
        setSaving(true);
        try {
            await window.caravan.save(name, g);
            setSaved(JSON.stringify(g));
            setError("");
        } catch (e) {
            setError((e as Error).message);
        } finally {
            saveBusy.current = false;
            setSaving(false);
        }
    };
    const build = async (playAfter = false) => {
        const g = gameRef.current;
        if (!g || buildBusy.current || saveBusy.current || openBusy.current)
            return;
        buildBusy.current = true;
        setBuilding(true);
        setCancelling(false);
        setPanelVisible(true);
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
                if (playAfter) {
                    setRomAutoLoad((n) => n + 1);
                    setTab("rom");
                }
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
            buildBusy.current = false;
            setBuilding(false);
            setCancelling(false);
        }
    };
    const play = () => {
        if (buildBusy.current || openBusy.current) return;
        setPanelVisible(true);
        if (
            built?.ok &&
            built.configuration === config &&
            JSON.stringify(gameRef.current) === buildSnapshot
        ) {
            setTab("rom");
            setRomAutoLoad((n) => n + 1);
        } else void build(true);
    };
    const cancelBuild = async () => {
        if (cancelling) return;
        setCancelling(true);
        try {
            await window.caravan.cancelBuild();
        } catch (e) {
            setError((e as Error).message);
            setCancelling(false);
        }
    };
    const actions = useRef({
        save,
        build,
        play,
        doUndo,
        doRedo,
        modal,
        commandOpen,
    });
    actions.current = { save, build, play, doUndo, doRedo, modal, commandOpen };
    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            const mod = e.ctrlKey || e.metaKey,
                key = e.key.toLowerCase();
            if (e.key === "Escape") {
                if (openBusy.current) return;
                setModal("");
                setCommandOpen(false);
                return;
            }
            if (mod && key === "p") {
                e.preventDefault();
                if (!actions.current.modal) setCommandOpen((v) => !v);
                return;
            }
            if (actions.current.modal || actions.current.commandOpen) return;
            if (mod && key === "s") {
                e.preventDefault();
                void actions.current.save();
            }
            if (mod && key === "z") {
                e.preventDefault();
                e.shiftKey
                    ? actions.current.doRedo()
                    : actions.current.doUndo();
            }
            if (mod && key === "y") {
                e.preventDefault();
                actions.current.doRedo();
            }
            if (mod && key === "f") {
                e.preventDefault();
                document.getElementById("library-search")?.focus();
            }
            if (mod && key === "b") {
                e.preventDefault();
                if (e.shiftKey) void actions.current.build();
                else setInspectorVisible((v) => !v);
            }
            if (e.key === "F5") {
                e.preventDefault();
                actions.current.play();
            }
            if (e.key === "F6") {
                e.preventDefault();
                setPanelVisible(true);
                setTab("preview");
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
                (list[i].height !== value.height || list[i].width !== value.width || list[i].scrollAxis !== value.scrollAxis)
            ) {
                value = {...value, ...resizeStage({...value,width:list[i].width,height:list[i].height}, Math.max(20,Math.min(512,Math.round(value.width))), Math.max(18,Math.min(512,Math.round(value.height))))};
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
        const entity = createEntity(game, selection.kind);
        if (!entity) return;
        change((g) => {
            if (!Array.isArray((g as any)[selection.kind])) (g as any)[selection.kind] = [];
            collection(g).push(entity);
            if (selection.kind === "stages") g.stageOrder.push(entity.id);
        });
        choose(selection.kind, entity.id);
    };
    const addEvent = () => {
        if (!stage) return;
        const e: StageEvent = {
            id: uid("event"),
            frame: 0,
            kind: "enemy",
            ref: game.enemies[0]?.id ?? "",
            x: stage.scrollAxis === "horizontal" ? 168 : 80,
            y: stage.scrollAxis === "horizontal" ? 72 : 0,
            count: 1,
            spacing: 16,
            spacingY: 0,
            interval: 0,
            value: 1,
        };
        replace({ ...stage, events: [...stage.events, e] });
        setEventId(e.id);
    };
    const activeEvent = stage?.events.find((e) => e.id === eventId),
        activeText = screen?.items.find((t: any) => t.id === textId);
    const openProject = async (next?: string) => {
        if (
            buildBusy.current ||
            saveBusy.current ||
            openBusy.current ||
            next === name
        )
            return;
        openBusy.current = true;
        setOpening(true);
        try {
            if (!next) {
                const selected = await window.caravan.chooseProject();
                if (!selected) return;
                setProjects(selected.projects);
                next = selected.name;
                if (next === name) return;
            }
            if (dirty && !await window.caravan.confirm("未保存の変更があります。復旧コピーを残して作品を切り替えますか？")) return;
            if (dirty) await window.caravan.recover(name, game);
            const data = await window.caravan.open(next);
            setName(next);
            applyProject(data.game);
            if (data.warnings?.length) setError(data.warnings.join("\n"));
            if (
                data.recovery &&
                await window.caravan.confirm("この作品の復旧コピーを読み込みますか？")
            ) {
                setGame(data.recovery);
                gameRef.current = data.recovery;
            }
        } catch (e) {
            setError((e as Error).message);
        } finally {
            openBusy.current = false;
            setOpening(false);
        }
    };
    const locate = (id: string) => {
        const path =
            /^(assets|stages|screens|enemies|bosses|patterns|palettes|items)\[(\d+)\]/.exec(
                id,
            );
        if (path) {
            const target = collection(game, path[1])[Number(path[2])];
            if (target) {
                choose(path[1], target.id);
                setInspectorVisible(true);
                return;
            }
        }
        if (id === "player" || id.startsWith("player.")) {
            choose("player", "player");
            setInspectorVisible(true);
            return;
        }
        for (const [kind] of categories) {
            const o = collection(game, kind).find(
                (o) =>
                    o.id === id ||
                    o.items?.some((t: any) => t.id === id) ||
                    o.events?.some((e: any) => e.id === id) ||
                    o.destructibles?.types.some((t: any) => t.id === id) ||
                    o.destructibles?.objects.some((o: any) => o.id === id),
            );
            if (o) {
                choose(kind, o.id);
                setInspectorVisible(true);
                if (kind === "stages" && o.events.some((e: any) => e.id === id))
                    setEventId(id);
                if (kind === "screens" && o.items.some((t: any) => t.id === id))
                    setTextId(id);
                return;
            }
        }
        choose("project", "project");
        setInspectorVisible(true);
    };
    const showPanel = (next: string) => {
        setTab(next);
        setPanelVisible(true);
    };
    const staleBuild =
        content !== buildSnapshot || built?.configuration !== config;
    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const busy = building || saving || opening;
    const commands = [
        {
            id: "save",
            label: "プロジェクトを保存",
            shortcut: "Ctrl S",
            disabled: busy,
            run: () => {
                void save();
            },
        },
        {
            id: "build",
            label: "ROM をビルド",
            detail: `${config} · GBDK`,
            shortcut: "Ctrl Shift B",
            disabled: busy,
            run: () => {
                void build();
            },
        },
        {
            id: "play",
            label: "ビルドしてプレイ",
            detail: "最新の ROM を内蔵エミュレーターで実行",
            shortcut: "F5",
            disabled: busy,
            run: play,
        },
        {
            id: "preview",
            label: "即時プレビューを表示",
            shortcut: "F6",
            run: () => showPanel("preview"),
        },
        {
            id: "diagnostics",
            label: "ビルド・検証を表示",
            detail: `${diagnostics.length} 件の問題`,
            run: () => showPanel("build"),
        },
        {
            id: "undo",
            label: "元に戻す",
            shortcut: "Ctrl Z",
            disabled: !undo.current.length,
            run: doUndo,
        },
        {
            id: "redo",
            label: "やり直す",
            shortcut: "Ctrl Y",
            disabled: !redo.current.length,
            run: doRedo,
        },
        {
            id: "inspector",
            label: inspectorVisible
                ? "インスペクターを隠す"
                : "インスペクターを表示",
            shortcut: "Ctrl B",
            run: () => setInspectorVisible((v) => !v),
        },
        {
            id: "new",
            label: "テンプレートから新規作品",
            disabled: busy,
            run: () => {
                setModal("new");
                setNewId("");
            },
        },
        {
            id: "copy-project",
            label: "作品を複製",
            disabled: busy,
            run: () => {
                setModal("copy");
                setNewId("");
                setNewTitle(game.title);
            },
        },
        ...categories.flatMap(([kind, label]) => [
            {
                id: `category-${kind}`,
                label: `${label} を開く`,
                run: () => choose(kind, collection(game, kind)[0]?.id ?? kind),
            },
            ...collection(game, kind).map((o) => ({
                id: `${kind}-${o.id}`,
                label: o.name,
                detail: `${label} · ${o.id}`,
                run: () => choose(kind, o.id),
            })),
        ]),
    ];
    return (
        <div className="app">
            <header>
                <div className="brand">
                    <img className="brand-mark app-icon" src="caravan-editor.png" alt="" />
                    <div>
                        CARAVAN <b>EDITOR</b>
                        <small>GAME BOY / COLOR · DEVELOPMENT STUDIO</small>
                    </div>
                </div>
                <div className="project-picker">
                    <button disabled={busy} onClick={() => openProject()}>プロジェクトを開く</button>
                    <select
                        aria-label="作品"
                        value={name}
                        disabled={busy}
                        onChange={(e) => openProject(e.target.value)}
                    >
                        {projects.map((p) => (
                            <option key={p.name} value={p.name}>
                                {p.title} / {p.name}
                            </option>
                        ))}
                    </select>
                    <button
                        disabled={opening}
                        title="現在のプロジェクトフォルダをエクスプローラーで開く"
                        aria-label="現在のプロジェクトフォルダをエクスプローラーで開く"
                        onClick={() => window.caravan.showProjectFolder(name).catch((e) => setError((e as Error).message))}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path d="M3 7V5h6l2 2h10v13H3V7Z" /><path d="M3 10h18" />
                        </svg>
                    </button>
                    <span className={`status-dot ${dirty ? "unsaved" : ""}`} />
                    <span role="status">
                        {saving
                            ? "保存中…"
                            : opening
                              ? "読込中…"
                              : dirty
                                ? "未保存"
                                : "保存済み"}
                    </span>
                </div>
                <div className="header-actions">
                    <button
                        disabled={busy}
                        onClick={() => {
                            setModal("new");
                            setNewId("");
                        }}
                    >
                        新規作品
                    </button>
                    <button
                        disabled={busy}
                        onClick={() => {
                            setModal("copy");
                            setNewId("");
                            setNewTitle(game.title);
                        }}
                    >
                        作品を複製
                    </button>
                    <button disabled={busy || !dirty} onClick={save}>
                        {saving ? "保存中…" : "保存"} <kbd>Ctrl S</kbd>
                    </button>
                    <button
                        className="command-trigger"
                        onClick={() => setCommandOpen(true)}
                        title="コマンド・素材を検索 (Ctrl+P)"
                    >
                        ⌕ <kbd>Ctrl P</kbd>
                    </button>
                    <select
                        aria-label="ビルド構成"
                        disabled={busy}
                        value={config}
                        onChange={(e) => setConfig(e.target.value)}
                    >
                        <option>Debug</option>
                        <option>Release</option>
                    </select>
                    <button
                        disabled={busy}
                        onClick={() => {
                            void build();
                        }}
                        title="ROM をビルド (Ctrl+Shift+B)"
                    >
                        ビルド
                    </button>
                    {building ? (
                        <button
                            className="danger"
                            disabled={cancelling}
                            onClick={() => {
                                void cancelBuild();
                            }}
                        >
                            {cancelling ? "中止要求済み…" : "■ 中止"}
                        </button>
                    ) : (
                        <button
                            className="accent"
                            disabled={busy}
                            onClick={play}
                        >
                            ▶ ビルド＆プレイ <kbd>F5</kbd>
                        </button>
                    )}
                </div>
            </header>
            <div
                className={`workspace ${inspectorVisible ? "" : "inspector-hidden"}`}
                ref={columns.ref}
                style={columns.style}
            >
                <LibraryPanel
                    game={game}
                    selection={selection}
                    search={search}
                    onSearch={setSearch}
                    choose={choose}
                    add={add}
                    duplicate={() => duplicate()}
                    canDuplicate={
                        !!object &&
                        !["player", "project", "screens"].includes(
                            selection.kind,
                        )
                    }
                />
                {columns.separator(0)}
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
                                {selection.kind === "project"
                                    ? game.title
                                    : (object?.name ??
                                      (selection.kind === "player"
                                          ? "自機設定"
                                          : "対象を選択"))}
                            </h1>
                        </div>
                        <div className="toolbar">
                            <button
                                title="元に戻す (Ctrl+Z)"
                                aria-label="元に戻す"
                                disabled={!undo.current.length}
                                onClick={doUndo}
                            >
                                ↶
                            </button>
                            <button
                                title="やり直す (Ctrl+Y)"
                                aria-label="やり直す"
                                disabled={!redo.current.length}
                                onClick={doRedo}
                            >
                                ↷
                            </button>
                            <button
                                className={inspectorVisible ? "active" : ""}
                                aria-pressed={inspectorVisible}
                                title="インスペクター表示 (Ctrl+B)"
                                onClick={() => setInspectorVisible((v) => !v)}
                            >
                                設定
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
                            <button
                                aria-label="エラーを閉じる"
                                onClick={() => setError("")}
                            >
                                ×
                            </button>
                        </div>
                    )}
                    <div className="editing">
                        <Boundary
                            key={selection.kind + selection.id}
                            resetKey={content}
                        >
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
                                <><VictoryDialogueCanvas game={game} stage={stage} glyphs={glyphs} dmg={dmg} before />
                                <VictoryDialogueCanvas game={game} stage={stage} glyphs={glyphs} dmg={dmg} />
                                <MapCanvas
                                    game={game}
                                    stage={stage}
                                    onChange={replace}
                                    dmg={dmg}
                                    grid={grid}
                                    eventId={eventId}
                                    onEvent={setEventId}
                                /></>
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
                                        game={game} glyphs={glyphs} dmg={dmg}
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
                                <div style={{width:"100%",overflowY:"auto"}}>
                                <StartupPreview game={game} glyphs={glyphs} dmg={dmg}/>
                                <ProjectOverview
                                    game={game}
                                    diagnostics={diagnostics}
                                    built={built}
                                    stale={staleBuild}
                                    building={busy}
                                    dirty={dirty}
                                    choose={choose}
                                    change={change}
                                    build={() => {
                                        void build();
                                    }}
                                    play={play}
                                    inspect={() => showPanel("build")}
                                />
                                </div>
                            ) : selection.kind === "player" ? (
                                <PlayerPresentationCanvas game={game} glyphs={glyphs} dmg={dmg}/>
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
                                onClick={() => showPanel("preview")}
                            >
                                プレビュー
                            </button>
                            <button
                                className={tab === "rom" ? "selected" : ""}
                                onClick={() => showPanel("rom")}
                            >
                                ROMプレイヤー
                            </button>
                            <button
                                className={tab === "build" ? "selected" : ""}
                                onClick={() => showPanel("build")}
                            >
                                ビルド・検証{" "}
                                {diagnostics.length > 0 && (
                                    <b>{diagnostics.length}</b>
                                )}
                            </button>
                            {built?.ok && (
                                <span
                                    className={
                                        staleBuild ? "warning" : "success"
                                    }
                                >
                                    {staleBuild
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
                            <button
                                className="panel-toggle"
                                aria-label={
                                    panelVisible
                                        ? "プレビューパネルを折りたたむ"
                                        : "プレビューパネルを開く"
                                }
                                aria-expanded={panelVisible}
                                onClick={() => setPanelVisible((v) => !v)}
                            >
                                {panelVisible ? "⌄" : "⌃"}
                            </button>
                        </div>
                        <div
                            style={{
                                display:
                                    panelVisible && tab === "preview"
                                        ? "block"
                                        : "none",
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
                                        active={
                                            panelVisible && tab === "preview"
                                        }
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
                                display:
                                    panelVisible && tab === "rom"
                                        ? "block"
                                        : "none",
                            }}
                        >
                            <RomPreview
                                active={panelVisible && tab === "rom"}
                                autoLoad={romAutoLoad}
                                name={name}
                                build={built}
                                dmg={dmg}
                                error={setError}
                            />
                        </div>
                        <div
                            style={{
                                display:
                                    panelVisible && tab === "build"
                                        ? "block"
                                        : "none",
                            }}
                        >
                            <BuildPanel
                                diagnostics={diagnostics}
                                built={built}
                                logs={logs}
                                building={building}
                                locate={locate}
                                clearLogs={() => setLogs("")}
                            />
                        </div>
                    </section>
                </main>
                {inspectorVisible && columns.separator(1)}
                <aside
                    className="inspector"
                    style={{ display: inspectorVisible ? undefined : "none" }}
                >
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
                                            : selection.kind === "player"
                                              ? "player"
                                              : selection.kind === "items" ? "item" : ["enemies","bosses"].includes(selection.kind) ? "actor" : ""
                                }
                                omit={
                                    selection.kind === "project"
                                        ? [
                                              "name",
                                              "assets",
                                              "patterns",
                                              "enemies",
                                              "bosses",
                                              "stages",
                                              "screens",
                                              "palettes",
                                              "player",
                                              "items",
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
                    {selection.kind === "player" && <PowerUpFields game={game} onChange={replace}/>}
                    {stage && <DestructibleFields game={game} stage={stage} onChange={replace}/>}
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
                                                        ? (game.bosses[0]?.id ??
                                                          "")
                                                        : v.kind === "item" ? (game.items?.[0]?.id ?? "")
                                                        : v.kind === "scroll" || v.kind === "end" ? ""
                                                        : (game.enemies[0]
                                                              ?.id ?? "");
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
                                    disabled={selection.kind !== "items" && collection(game).length <= 1}
                                    title={
                                        selection.kind !== "items" && collection(game).length <= 1
                                            ? "各種類に最低 1 件必要です"
                                            : "対象を削除"
                                    }
                                    onClick={async () => {
                                        if (
                                            !await window.caravan.confirm(
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
                                        choose(selection.kind, collection(gameRef.current!)[0]?.id ?? "");
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
                <button
                    className={toolchain?.ready ? "success" : "warning"}
                    onClick={() => {
                        setModal("tools");
                        void window.caravan
                            .toolchain()
                            .then(setToolchain)
                            .catch((e) => setError(e.message));
                    }}
                >
                    ●{" "}
                    {toolchain
                        ? toolchain.ready
                            ? "ビルド環境 OK"
                            : "環境セットアップが必要"
                        : "環境を確認中…"}
                </button>
                <span>{name} / assets-src/game.json</span>
                <button
                    onClick={() => showPanel("build")}
                    className={errorCount ? "warning" : ""}
                >
                    {building
                        ? "◌ ビルド中"
                        : `${errorCount} エラー · ${diagnostics.length - errorCount} 警告`}
                </button>
                <span>160 × 144 · 60 ticks/s</span>
            </footer>
            {commandOpen && (
                <CommandPalette
                    commands={commands}
                    onClose={() => setCommandOpen(false)}
                />
            )}
            {modal === "tools" && (
                <div
                    className="modal-overlay"
                    onPointerDown={(e) => {
                        if (e.target === e.currentTarget) setModal("");
                    }}
                >
                    <div
                        className="modal toolchain-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="toolchain-title"
                    >
                        <h2 id="toolchain-title">開発環境</h2>
                        <p>{toolchain?.hint ?? "環境を確認しています…"}</p>
                        {toolchain?.tools.map((tool) => (
                            <div className="toolchain-row" key={tool.path}>
                                <span
                                    className={
                                        tool.installed ? "success" : "warning"
                                    }
                                >
                                    {tool.installed ? "✓" : "○"}
                                </span>
                                <div>
                                    <strong>
                                        {tool.label}{" "}
                                        <small>{tool.version}</small>
                                    </strong>
                                    <code>{tool.path}</code>
                                </div>
                                <span>{tool.required ? "必須" : "任意"}</span>
                            </div>
                        ))}
                        <button autoFocus onClick={() => setModal("")}>
                            閉じる
                        </button>
                    </div>
                </div>
            )}
            {modal && modal !== "tools" && (
                <div className="modal-overlay">
                    <div
                        className="modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={
                            modal === "asset" ? "素材を追加" : "作品を作成"
                        }
                    >
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
                                {modal === "new" && <Field label="テンプレート">
                                    <select aria-label="新規作品テンプレート" value={newTemplate} disabled={busy} onChange={e => setNewTemplate(e.target.value)}>
                                        <option value="nova-spear">NOVA SPEAR：3面・時間制限なし・撃破演出</option>
                                        <option value="star-caravan">STAR CARAVAN：時間制キャラバン</option>
                                        <option value="side-caravan">SIDE CARAVAN：横STG・アイテム・破壊BG</option>
                                    </select>
                                    <p>選んだ作品の素材・ステージ・ゲーム設定を引き継ぎます。復帰待ち、時間制限、撃破演出は作成後も編集できます。</p>
                                </Field>}
                                <Field label="作品ID（英数字・ハイフン・_）">
                                    <input
                                        autoFocus
                                        aria-label="作品ID"
                                        maxLength={48}
                                        disabled={busy}
                                        value={newId}
                                        onChange={(e) =>
                                            setNewId(e.target.value)
                                        }
                                    />
                                </Field>
                                <Field label="タイトル（英数字・かな）">
                                    <input
                                        aria-label="作品タイトル"
                                        disabled={busy}
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
                                    disabled={
                                        busy ||
                                        !/^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$/.test(
                                            newId,
                                        ) ||
                                        !newTitle.trim() ||
                                        projects.some((p) => p.name === newId)
                                    }
                                    onClick={async () => {
                                        if (
                                            openBusy.current ||
                                            saveBusy.current ||
                                            buildBusy.current
                                        )
                                            return;
                                        openBusy.current = true;
                                        setOpening(true);
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
                                                              newTemplate,
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
                                        } finally {
                                            openBusy.current = false;
                                            setOpening(false);
                                        }
                                    }}
                                >
                                    {opening ? "作成中…" : "作成"}
                                </button>
                            </>
                        )}
                        <button disabled={opening} onClick={() => setModal("")}>
                            キャンセル
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
createRoot(document.getElementById("root")!).render(<App />);
