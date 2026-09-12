import React, { useEffect, useRef, useState } from "react";
import {
    type Game,
    type Stage,
    type Point,
    clone,
    clamp,
    uid,
} from "../shared/model";
import {
    cameraAtEventFrame,
    screenToWorld,
    worldToScreen,
} from "../shared/stage-space";
import { linePoints } from "../shared/pixel-tools";
import { dmgColors } from "../shared/palette";
import { TilePalette } from "./tile-palette";

export function MapCanvas({
    game,
    stage,
    onChange,
    dmg,
    grid,
    eventId,
    onEvent,
}: {
    game: Game;
    stage: Stage;
    onChange: (s: Stage) => void;
    dmg: boolean;
    grid: boolean;
    eventId: string;
    onEvent: (id: string) => void;
}) {
    const ref = useRef<HTMLCanvasElement>(null),
        well = useRef<HTMLDivElement>(null);
    const [tile, setTile] = useState(0),
        [wall, setWall] = useState(false),
        [tool, setTool] = useState("tile"),
        [stamp, setStamp] = useState(""),
        [erase, setErase] = useState(false),
        [scale, setScale] = useState(3);
    const draft = useRef<Stage | null>(null),
        lastCell = useRef<Point | null>(null),
        pan = useRef<{
            x: number;
            y: number;
            left: number;
            top: number;
        } | null>(null);
    const [view, setView] = useState<Stage | null>(null),
        s = view ?? stage,
        a = game.assets.find((a) => a.id === s.tileset);
    const types = s.destructibles?.types ?? [],
        selectedType = types.find((t) => t.id === stamp) ?? types[0];
    useEffect(() => {
        draft.current = null;
        lastCell.current = null;
        setView(null);
    }, [stage]);
    useEffect(() => {
        setTile(0);
        setStamp("");
        if (well.current) {
            well.current.scrollLeft = 0;
            well.current.scrollTop = 0;
        }
    }, [stage.id, stage.tileset]);
    const eventWorld = (event: Stage["events"][number]) => {
        const p = screenToWorld(
            game,
            s,
            cameraAtEventFrame(game, s, event.frame),
            event.x,
            event.y,
        );
        if (s.loopMap) {
            if (s.scrollAxis === "horizontal")
                p.x = ((p.x % (s.width * 8)) + s.width * 8) % (s.width * 8);
            else p.y = ((p.y % (s.height * 8)) + s.height * 8) % (s.height * 8);
        }
        return p;
    };
    useEffect(() => {
        const c = ref.current?.getContext("2d");
        if (!c || !a) return;
        const colors = dmg ? dmgColors(game) : game.palettes[a.palette].colors,
            pixels = a.frames[0].pixels;
        const drawTile = (tile: number, x: number, y: number) => {
            const tx = (tile % (a.width / 8)) * 8,
                ty = Math.floor(tile / (a.width / 8)) * 8;
            for (let py = 0; py < 8; py++)
                for (let px = 0; px < 8; px++) {
                    c.fillStyle =
                        colors[pixels[(ty + py) * a.width + tx + px] ?? 0];
                    c.fillRect(x + px, y + py, 1, 1);
                }
        };
        for (let y = 0; y < s.height; y++)
            for (let x = 0; x < s.width; x++) {
                drawTile(s.tiles[y * s.width + x] ?? 0, x * 8, y * 8);
                if (s.walls[y * s.width + x]) {
                    c.fillStyle = "#f25c6c70";
                    c.fillRect(x * 8, y * 8, 8, 8);
                }
            }
        for (const object of s.destructibles?.objects ?? []) {
            const type = types.find((t) => t.id === object.type);
            if (!type) continue;
            type.tiles.forEach((t, i) =>
                drawTile(
                    t,
                    object.x * 8 + (i % 2) * 8,
                    object.y * 8 + Math.floor(i / 2) * 8,
                ),
            );
            c.strokeStyle = type.solid ? "#ff7185" : "#ffbd66";
            c.lineWidth = 0.65;
            c.strokeRect(object.x * 8 + 0.5, object.y * 8 + 0.5, 15, 15);
        }
        if (grid) {
            c.strokeStyle = "#8d9aaf66";
            c.lineWidth = 0.25;
            for (let x = 0; x <= s.width * 8; x += 8) {
                c.beginPath();
                c.moveTo(x, 0);
                c.lineTo(x, s.height * 8);
                c.stroke();
            }
            for (let y = 0; y <= s.height * 8; y += 8) {
                c.beginPath();
                c.moveTo(0, y);
                c.lineTo(s.width * 8, y);
                c.stroke();
            }
        }
        for (const event of s.events)
            if (["enemy", "boss", "item"].includes(event.kind)) {
                const p = eventWorld(event);
                c.strokeStyle =
                    event.id === eventId
                        ? "#ffbd66"
                        : event.kind === "item"
                          ? "#d591ff"
                          : "#54d8c4";
                c.lineWidth = 0.75;
                c.strokeRect(p.x - 4, p.y - 4, 8, 8);
            }
    }, [s, a, dmg, grid, eventId, game]);
    const paint = (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!draft.current || !a) return;
        const bounds = event.currentTarget.getBoundingClientRect(),
            p = {
                x: clamp(
                    Math.floor(
                        ((event.clientX - bounds.left) * stage.width * 8) /
                            bounds.width,
                    ),
                    0,
                    stage.width * 8 - 1,
                ),
                y: clamp(
                    Math.floor(
                        ((event.clientY - bounds.top) * stage.height * 8) /
                            bounds.height,
                    ),
                    0,
                    stage.height * 8 - 1,
                ),
            };
        if (tool === "event") {
            const target = stage.events.find((e) => e.id === eventId);
            if (!target || !["enemy", "boss", "item"].includes(target.kind))
                return;
            const q = worldToScreen(
                game,
                stage,
                cameraAtEventFrame(game, stage, target.frame),
                p.x,
                p.y,
            );
            if (stage.loopMap) {
                if (stage.scrollAxis === "horizontal") {
                    while (q.x < -32) q.x += stage.width * 8;
                    while (q.x > 192) q.x -= stage.width * 8;
                } else {
                    while (q.y < -32) q.y += stage.height * 8;
                    while (q.y > 176) q.y -= stage.height * 8;
                }
            }
            draft.current.events = draft.current.events.map((e) =>
                e.id === eventId
                    ? { ...e, x: clamp(q.x, -32, 192), y: clamp(q.y, -32, 176) }
                    : e,
            );
        } else {
            const step = tool === "destructible" ? 16 : 8,
                cell = { x: Math.floor(p.x / step), y: Math.floor(p.y / step) };
            for (const point of linePoints(lastCell.current ?? cell, cell)) {
                if (tool === "destructible") {
                    const x = point.x * 2,
                        y = point.y * 2;
                    if (x + 2 > stage.width || y + 2 > stage.height) continue;
                    if (!erase && !selectedType) continue;
                    const data = draft.current.destructibles ?? {
                            types: [],
                            objects: [],
                        },
                        existing = data.objects.find(
                            (o) => o.x === x && o.y === y,
                        );
                    if (!erase && !existing && data.objects.length >= 512)
                        continue;
                    data.objects = data.objects.filter(
                        (o) => o.x !== x || o.y !== y,
                    );
                    if (!erase && selectedType)
                        data.objects.push({
                            id: existing?.id ?? uid("bg-object"),
                            type: selectedType.id,
                            x,
                            y,
                        });
                    draft.current.destructibles = data;
                } else {
                    const index = point.y * stage.width + point.x;
                    if (tool === "wall")
                        draft.current.walls[index] = wall ? 1 : 0;
                    else
                        draft.current.tiles[index] = Math.min(
                            tile,
                            (a.width * a.height) / 64 - 1,
                        );
                }
            }
            lastCell.current = cell;
        }
        setView(clone(draft.current));
    };
    if (!a) return <p className="hint">タイルセットを選択してください。</p>;
    return (
        <>
            <div className="toolbar map-tools">
                {[
                    ["tile", "タイル"],
                    ["wall", "壁"],
                    ["destructible", "破壊BG"],
                    ["event", "出現位置"],
                    ["pan", "手のひら"],
                ].map(([id, label]) => (
                    <button
                        key={id}
                        className={tool === id ? "active" : ""}
                        onClick={() => setTool(id)}
                    >
                        {label}
                    </button>
                ))}
                <label>
                    マップ倍率{" "}
                    <select
                        aria-label="マップ倍率"
                        value={scale}
                        onChange={(e) => setScale(Number(e.target.value))}
                    >
                        {[1, 2, 3, 4].map((n) => (
                            <option key={n} value={n}>
                                {n}倍
                            </option>
                        ))}
                    </select>
                </label>
                {tool === "tile" ? (
                    <label>
                        タイル番号{" "}
                        <input
                            type="number"
                            min={0}
                            max={(a.width * a.height) / 64 - 1}
                            value={tile}
                            onChange={(e) =>
                                setTile(
                                    clamp(
                                        Number(e.target.value),
                                        0,
                                        (a.width * a.height) / 64 - 1,
                                    ),
                                )
                            }
                        />
                    </label>
                ) : tool === "wall" ? (
                    <label>
                        <input
                            aria-label="壁を置く"
                            type="checkbox"
                            checked={wall}
                            onChange={(e) => setWall(e.target.checked)}
                        />
                        壁を置く（OFFで消去）
                    </label>
                ) : tool === "destructible" ? (
                    <>
                        <select
                            aria-label="配置する破壊BG"
                            value={selectedType?.id ?? ""}
                            onChange={(e) => setStamp(e.target.value)}
                        >
                            {!types.length && (
                                <option value="">右側で種類を追加</option>
                            )}
                            {types.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name}
                                </option>
                            ))}
                        </select>
                        <label>
                            <input
                                aria-label="破壊BGを消去"
                                type="checkbox"
                                checked={erase}
                                onChange={(e) => setErase(e.target.checked)}
                            />
                            消去
                        </label>
                        <span>
                            {s.destructibles?.objects.length ?? 0}個配置 /
                            上限512
                        </span>
                    </>
                ) : tool === "event" ? (
                    <span>イベントを選択 → マップをクリック</span>
                ) : (
                    <span>ドラッグして上下左右へ移動（中ボタンでも移動）</span>
                )}
            </div>
            {tool === "tile" && (
                <TilePalette
                    game={game}
                    asset={a}
                    dmg={dmg}
                    selected={Math.min(tile, (a.width * a.height) / 64 - 1)}
                    onSelect={setTile}
                />
            )}
            <div className="canvas-well map" ref={well}>
                <canvas
                    ref={ref}
                    width={stage.width * 8}
                    height={stage.height * 8}
                    aria-label="ステージマップ編集キャンバス"
                    style={{
                        width: stage.width * 8 * scale,
                        height: stage.height * 8 * scale,
                        cursor: tool === "pan" ? "grab" : "crosshair",
                    }}
                    onPointerDown={(e) => {
                        if (e.button !== 0 && e.button !== 1) return;
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        if (e.button === 1 || tool === "pan") {
                            if (well.current)
                                pan.current = {
                                    x: e.clientX,
                                    y: e.clientY,
                                    left: well.current.scrollLeft,
                                    top: well.current.scrollTop,
                                };
                            return;
                        }
                        lastCell.current = null;
                        draft.current = clone(stage);
                        paint(e);
                    }}
                    onPointerMove={(e) => {
                        if (pan.current && well.current) {
                            well.current.scrollLeft =
                                pan.current.left + pan.current.x - e.clientX;
                            well.current.scrollTop =
                                pan.current.top + pan.current.y - e.clientY;
                        } else if (e.buttons && draft.current) paint(e);
                    }}
                    onPointerUp={() => {
                        pan.current = null;
                        if (draft.current) onChange(draft.current);
                        draft.current = null;
                        lastCell.current = null;
                        setView(null);
                    }}
                    onPointerCancel={() => {
                        pan.current = null;
                        draft.current = null;
                        lastCell.current = null;
                        setView(null);
                    }}
                />
            </div>
            <p className="hint">
                赤は接触すると被弾する壁、黄枠は破壊BG。破壊BGの「自機に当たる地形」がOFFなら自機は上を飛べます。描画1ストロークごとに元に戻せます。
            </p>
        </>
    );
}
