import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BuildResult, Diagnostic, Game } from "../shared/model";
import { spriteLayout } from "../shared/model";

export const categories = [
    ["project", "プロジェクト", "◈"],
    ["stages", "ステージ", "▤"],
    ["player", "自機", "△"],
    ["enemies", "敵キャラクター", "◇"],
    ["patterns", "弾幕", "✳"],
    ["bosses", "ボス", "⬡"],
    ["assets", "画像・スプライト", "▦"],
    ["screens", "画面・HUD", "▣"],
    ["palettes", "パレット", "◐"],
];
export type Selection = { kind: string; id: string };
export type WorkspaceCommand = {
    id: string;
    label: string;
    detail?: string;
    shortcut?: string;
    disabled?: boolean;
    run: () => void;
};
const items = (game: Game, kind: string): { id: string; name: string }[] => {
    const value = game[kind as keyof Game];
    return Array.isArray(value)
        ? (value as { id: string; name: string }[])
        : [];
};

export function readPreference<T>(key: string, fallback: T): T {
    try {
        const value = JSON.parse(
            localStorage.getItem(`caravan.workspace.${key}`) ?? "null",
        );
        return value !== null && typeof value === typeof fallback
            ? value
            : fallback;
    } catch {
        return fallback;
    }
}
export function writePreference(key: string, value: unknown) {
    try {
        localStorage.setItem(`caravan.workspace.${key}`, JSON.stringify(value));
    } catch {
        /* Workspace preferences must never block editing. */
    }
}

export function LibraryPanel({
    game,
    selection,
    search,
    onSearch,
    choose,
    add,
    duplicate,
    canDuplicate,
}: {
    game: Game;
    selection: Selection;
    search: string;
    onSearch: (value: string) => void;
    choose: (kind: string, id: string) => void;
    add: () => void;
    duplicate: () => void;
    canDuplicate: boolean;
}) {
    const query = search.trim().toLowerCase();
    const spriteTiles = spriteLayout(game).tiles;
    const groups = categories
        .map(([kind, label, icon]) => ({
            kind,
            label,
            icon,
            values: items(game, kind).filter(
                (o) =>
                    !query ||
                    `${o.name} ${o.id} ${label}`.toLowerCase().includes(query),
            ),
        }))
        .filter(
            (group) =>
                !query ||
                group.values.length ||
                group.label.toLowerCase().includes(query),
        );
    return (
        <aside className="library" aria-label="プロジェクトナビゲーション">
            <div className="panel-title">
                エクスプローラー <span>{game.name}</span>
            </div>
            <div className="search-field">
                <span aria-hidden="true">⌕</span>
                <input
                    id="library-search"
                    aria-label="すべての素材と設定を検索"
                    placeholder="素材・ステージを検索"
                    value={search}
                    onChange={(e) => onSearch(e.target.value)}
                />
                {search && (
                    <button
                        aria-label="検索をクリア"
                        onClick={() => onSearch("")}
                    >
                        ×
                    </button>
                )}
            </div>
            <nav className="library-tree">
                {query && (
                    <p className="search-count">
                        {groups.reduce(
                            (n, group) => n + group.values.length,
                            0,
                        )}{" "}
                        件の検索結果
                    </p>
                )}
                {groups.map(({ kind, label, icon, values }) => (
                    <section key={kind}>
                        <button
                            className={`category ${selection.kind === kind ? "selected" : ""}`}
                            aria-current={
                                selection.kind === kind ? "location" : undefined
                            }
                            onClick={() =>
                                choose(
                                    kind,
                                    ["project", "player"].includes(kind)
                                        ? kind
                                        : (items(game, kind)[0]?.id ?? ""),
                                )
                            }
                        >
                            <span aria-hidden="true">{icon}</span>
                            {label}
                            <small>{items(game, kind).length || ""}</small>
                        </button>
                        {(selection.kind === kind || !!query) &&
                            values.map((o) => (
                                <button
                                    key={o.id}
                                    className={`asset-row ${selection.kind === kind && selection.id === o.id ? "selected" : ""}`}
                                    aria-current={
                                        selection.kind === kind &&
                                        selection.id === o.id
                                            ? "page"
                                            : undefined
                                    }
                                    onClick={() => choose(kind, o.id)}
                                    title={`${o.name} · ${o.id}`}
                                >
                                    <span
                                        className="tiny-icon"
                                        aria-hidden="true"
                                    >
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
                {!groups.length && (
                    <p className="empty-state">
                        一致する項目がありません。
                        <br />
                        名前や ID を変えて検索してください。
                    </p>
                )}
            </nav>
            <div className="library-footer">
                <button
                    disabled={["player", "project", "screens"].includes(
                        selection.kind,
                    )}
                    onClick={add}
                >
                    ＋ 追加
                </button>
                <button disabled={!canDuplicate} onClick={duplicate}>
                    複製
                </button>
            </div>
            <div className="budget">
                <div className="budget-label">
                    <small>スプライトタイル</small>
                    <span className={spriteTiles > 128 ? "warning" : ""}>
                        {spriteTiles} / 128
                    </span>
                </div>
                <div className="meter">
                    <i
                        className={spriteTiles > 128 ? "over-budget" : ""}
                        style={{
                            width: `${Math.min(100, (spriteTiles / 128) * 100)}%`,
                        }}
                    />
                </div>
                <div className="budget-label">
                    <small>CGB パレット</small>
                    <span>{game.palettes.length} / 8</span>
                </div>
                <small>
                    OAM・走査線はプレビューで確認
                    <br />
                    ROM・WRAM はビルド後に計測
                </small>
            </div>
        </aside>
    );
}

export function ProjectOverview({
    game,
    diagnostics,
    built,
    stale,
    building,
    dirty,
    choose,
    change,
    build,
    play,
    inspect,
}: {
    game: Game;
    diagnostics: Diagnostic[];
    built: BuildResult | null;
    stale: boolean;
    building: boolean;
    dirty: boolean;
    choose: (kind: string, id: string) => void;
    change: (edit: (game: Game) => void) => void;
    build: () => void;
    play: () => void;
    inspect: () => void;
}) {
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const eventCount = game.stages.reduce(
        (n, stage) => n + stage.events.length,
        0,
    );
    return (
        <div className="project-overview">
            <div className="overview-heading">
                <span className="eyebrow">PROJECT WORKSPACE</span>
                <span className="project-mode">
                    {game.mode === "caravan" ? "キャラバン" : "キャンペーン"} ·
                    GB / GBC
                </span>
            </div>
            <h2>{game.title}</h2>
            <p>ゲームを組み立てて、ROM で動作を確かめましょう。</p>
            <div className="workflow-strip">
                <button onClick={() => choose("stages", game.startStage)}>
                    <span className="step-number">01</span>
                    <span>
                        <strong>エディット</strong>
                        <small>
                            {dirty
                                ? "保存前の変更があります"
                                : "プロジェクトを保存済み"}
                        </small>
                    </span>
                    <span>↗</span>
                </button>
                <button onClick={errors ? inspect : build} disabled={building}>
                    <span className="step-number">02</span>
                    <span>
                        <strong>{building ? "ビルド中…" : "ROM ビルド"}</strong>
                        <small>
                            {errors
                                ? `${errors} 件のエラーを修正`
                                : "定義の検証 OK"}
                        </small>
                    </span>
                    <span>↗</span>
                </button>
                <button onClick={play} disabled={building || !!errors}>
                    <span className="step-number">03</span>
                    <span>
                        <strong>プレイ</strong>
                        <small>
                            {built?.ok && !stale
                                ? "最新 ROM を実行"
                                : "ビルドして実行"}
                        </small>
                    </span>
                    <span>▶</span>
                </button>
            </div>
            <div className="overview-grid">
                {[
                    [
                        "stages",
                        "ステージ",
                        game.stages.length,
                        `${eventCount} イベント`,
                    ],
                    [
                        "assets",
                        "画像素材",
                        game.assets.length,
                        `${game.assets.reduce((n, a) => n + a.frames.length, 0)} フレーム`,
                    ],
                    [
                        "patterns",
                        "弾幕パターン",
                        game.patterns.length,
                        `${game.enemies.length} 敵 / ${game.bosses.length} ボス`,
                    ],
                ].map(([kind, label, count, detail]) => (
                    <button
                        key={kind}
                        onClick={() =>
                            choose(
                                String(kind),
                                items(game, String(kind))[0]?.id ?? "",
                            )
                        }
                    >
                        <span>
                            {label}
                            <span aria-hidden="true">↗</span>
                        </span>
                        <strong>{count}</strong>
                        <small>{detail}</small>
                    </button>
                ))}
            </div>
            <div className="section-heading">
                <h3>ステージ進行</h3>
                <span>
                    {game.mode === "caravan"
                        ? "開始ステージをプレイ"
                        : "この順番でプレイ"}
                </span>
            </div>
            <div className="stage-list">
                {game.stageOrder.map((id, i) => {
                    const stage = game.stages.find((s) => s.id === id);
                    return (
                        <div className="order-row" key={`${id}-${i}`}>
                            <span>{String(i + 1).padStart(2, "0")}</span>
                            <button
                                className="stage-link"
                                onClick={() => choose("stages", id)}
                            >
                                <strong>{stage?.name ?? id}</strong>
                                <small>
                                    {stage
                                        ? `${stage.duration} 秒 · ${stage.events.length} イベント`
                                        : "参照先がありません"}
                                </small>
                            </button>
                            {game.startStage === id ? (
                                <span className="start-badge">開始</span>
                            ) : (
                                <button
                                    title="開始ステージに設定"
                                    onClick={() =>
                                        change((g) => {
                                            g.startStage = id;
                                        })
                                    }
                                >
                                    開始に設定
                                </button>
                            )}
                            <button
                                aria-label={`${stage?.name ?? id} を前へ移動`}
                                disabled={!i}
                                onClick={() =>
                                    change((g) => {
                                        [g.stageOrder[i - 1], g.stageOrder[i]] =
                                            [
                                                g.stageOrder[i],
                                                g.stageOrder[i - 1],
                                            ];
                                    })
                                }
                            >
                                ↑
                            </button>
                            <button
                                aria-label={`${stage?.name ?? id} を後ろへ移動`}
                                disabled={i === game.stageOrder.length - 1}
                                onClick={() =>
                                    change((g) => {
                                        [g.stageOrder[i], g.stageOrder[i + 1]] =
                                            [
                                                g.stageOrder[i + 1],
                                                g.stageOrder[i],
                                            ];
                                    })
                                }
                            >
                                ↓
                            </button>
                            <button
                                aria-label={`${stage?.name ?? id} を進行順から除外`}
                                disabled={
                                    game.stageOrder.length === 1 ||
                                    game.startStage === id
                                }
                                onClick={() =>
                                    change((g) => {
                                        g.stageOrder.splice(i, 1);
                                    })
                                }
                            >
                                ×
                            </button>
                        </div>
                    );
                })}
            </div>
            {game.stages
                .filter((s) => !game.stageOrder.includes(s.id))
                .map((s) => (
                    <button
                        className="add-stage"
                        key={s.id}
                        onClick={() =>
                            change((g) => {
                                g.stageOrder.push(s.id);
                            })
                        }
                    >
                        ＋ {s.name} を進行順に追加
                    </button>
                ))}
            <div className={`overview-readiness ${errors ? "has-errors" : ""}`}>
                <span>{errors ? "!" : "✓"}</span>
                <div>
                    <strong>
                        {errors
                            ? `${errors} 件の問題を修正してください`
                            : "ビルドの準備ができています"}
                    </strong>
                    <small>
                        {built?.ok
                            ? `前回の ROM ${(Number(built.size) / 1024).toFixed(1)} KiB${stale ? " · 更新が必要" : ""}`
                            : "素材・参照・Game Boy の制約を編集時に検証します"}
                    </small>
                </div>
                <button onClick={inspect}>検証結果</button>
            </div>
        </div>
    );
}

export function BuildPanel({
    diagnostics,
    built,
    logs,
    building,
    locate,
    clearLogs,
}: {
    diagnostics: Diagnostic[];
    built: BuildResult | null;
    logs: string;
    building: boolean;
    locate: (target: string) => void;
    clearLogs: () => void;
}) {
    const [filter, setFilter] = useState("all");
    const logRef = useRef<HTMLPreElement>(null);
    const [follow, setFollow] = useState(true);
    useEffect(() => {
        if (follow && logRef.current)
            logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [logs, follow]);
    const shown = diagnostics.filter(
        (d) => filter === "all" || d.severity === filter,
    );
    return (
        <div className="build-pane">
            <div className="validation-toolbar">
                <strong>
                    {building
                        ? "変換・コンパイルを実行中…"
                        : "プロジェクト検証"}
                </strong>
                <select
                    aria-label="診断の絞り込み"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                >
                    <option value="all">すべて ({diagnostics.length})</option>
                    <option value="error">
                        エラー (
                        {
                            diagnostics.filter((d) => d.severity === "error")
                                .length
                        }
                        )
                    </option>
                    <option value="warning">
                        警告 (
                        {
                            diagnostics.filter((d) => d.severity === "warning")
                                .length
                        }
                        )
                    </option>
                </select>
            </div>
            {shown.map((d, i) => (
                <button
                    className={`diagnostic ${d.severity}`}
                    key={`${d.target}-${i}`}
                    onClick={() => locate(d.target)}
                >
                    <span>{d.severity === "error" ? "!" : "△"}</span>
                    <span>
                        <strong>{d.target}</strong>
                        {d.message}
                    </span>
                    <span>対象へ ↗</span>
                </button>
            ))}
            {!diagnostics.length && (
                <p className="success validation-ok">
                    ✓ 素材・定義・参照の検証 OK
                </p>
            )}
            {diagnostics.length > 0 && !shown.length && (
                <p className="hint">この種類の問題はありません。</p>
            )}
            {built?.romPath && (
                <p className="output-path">出力：{built.romPath}</p>
            )}
            {built?.ok && (
                <div className="build-stats">
                    <span>
                        ROM{" "}
                        <strong>
                            {((built.size ?? 0) / 1024).toFixed(1)} KiB
                        </strong>
                    </span>
                    <span>
                        WRAM <strong>{built.ramBytes ?? "—"} / 8192 B</strong>
                    </span>
                    <span>
                        OBJ <strong>{built.spriteTiles ?? "—"} / 128</strong>
                    </span>
                </div>
            )}
            <div className="log-toolbar">
                <span>ビルド出力</span>
                <label>
                    <input
                        type="checkbox"
                        checked={follow}
                        onChange={(e) => setFollow(e.target.checked)}
                    />
                    末尾に追従
                </label>
                <button disabled={building || !logs} onClick={clearLogs}>
                    クリア
                </button>
            </div>
            <pre ref={logRef} aria-label="ビルドログ" tabIndex={0}>
                {logs ||
                    "ROM ビルドを実行すると、変換・GBDK・容量のログが表示されます。"}
            </pre>
        </div>
    );
}

export function CommandPalette({
    commands,
    onClose,
}: {
    commands: WorkspaceCommand[];
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const panel = useRef<HTMLDivElement>(null);
    const filtered = useMemo(
        () =>
            commands
                .filter((c) =>
                    `${c.label} ${c.detail ?? ""}`
                        .toLowerCase()
                        .includes(query.trim().toLowerCase()),
                )
                .slice(0, 60),
        [commands, query],
    );
    const active = Math.min(index, Math.max(0, filtered.length - 1));
    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        panel.current?.querySelector("input")?.focus();
        return () => previous?.focus();
    }, []);
    useEffect(() => {
        panel.current
            ?.querySelector(`[data-command-index="${active}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [active]);
    const execute = (command: WorkspaceCommand) => {
        if (!command.disabled) {
            onClose();
            command.run();
        }
    };
    return (
        <div
            className="modal-overlay command-overlay"
            onPointerDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="command-palette"
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-label="コマンドパレット"
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose();
                    }
                    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setIndex(
                            (active +
                                (e.key === "ArrowDown" ? 1 : -1) +
                                filtered.length) %
                                Math.max(1, filtered.length),
                        );
                    }
                    if (e.key === "Enter") {
                        e.preventDefault();
                        if (filtered[active]) execute(filtered[active]);
                    }
                    if (e.key === "Tab") {
                        e.preventDefault();
                        panel.current?.querySelector("input")?.focus();
                    }
                }}
            >
                <div className="command-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="command-options"
                        aria-autocomplete="list"
                        aria-activedescendant={
                            filtered.length ? `command-${active}` : undefined
                        }
                        aria-label="コマンド・素材を検索"
                        placeholder="操作名、素材名、ID を入力…"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIndex(0);
                        }}
                    />
                    <button onClick={onClose} aria-label="閉じる">
                        Esc
                    </button>
                </div>
                <div
                    className="command-results"
                    id="command-options"
                    role="listbox"
                    aria-label="コマンド検索結果"
                >
                    {filtered.map((command, i) => (
                        <button
                            key={command.id}
                            id={`command-${i}`}
                            data-command-index={i}
                            role="option"
                            aria-selected={i === active}
                            aria-disabled={command.disabled}
                            className={i === active ? "selected" : ""}
                            tabIndex={-1}
                            onMouseMove={() => setIndex(i)}
                            onClick={() => execute(command)}
                        >
                            <span>
                                <strong>{command.label}</strong>
                                <small>{command.detail}</small>
                            </span>
                            <kbd>{command.shortcut ?? "↵"}</kbd>
                        </button>
                    ))}
                    {!filtered.length && (
                        <p className="empty-state">
                            一致するコマンドや素材がありません。
                        </p>
                    )}
                </div>
                <div className="command-help">
                    <span>↑ ↓ 選択　↵ 実行</span>
                    <span>Esc 閉じる</span>
                </div>
            </div>
        </div>
    );
}
