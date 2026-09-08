import React, { useEffect, useRef, useState } from "react";
import {
    type Game,
    type Asset,
    type Stage,
    type Screen,
    type Motion,
    type Point,
    clone,
    clamp,
} from "../shared/model";
import { dmgColors } from "../shared/palette";
import { drawAsset } from "../shared/simulation";
import { TilePalette } from "./tile-palette";
import { type ImportResult } from "../shared/bridge";
import { linePoints, paintStroke } from "../shared/pixel-tools";

const pos = (
    event: React.PointerEvent<HTMLCanvasElement>,
    width: number,
    height: number,
) => {
    const r = event.currentTarget.getBoundingClientRect();
    return {
        x: clamp(
            Math.floor(((event.clientX - r.left) * width) / r.width),
            0,
            width - 1,
        ),
        y: clamp(
            Math.floor(((event.clientY - r.top) * height) / r.height),
            0,
            height - 1,
        ),
    };
};
export function AssetCanvas({
    game,
    asset,
    frame,
    onChange,
    dmg,
    grid,
    zoom,
    error,
}: {
    game: Game;
    asset: Asset;
    frame: number;
    onChange: (a: Asset) => void;
    dmg: boolean;
    grid: boolean;
    zoom: number;
    error: (s: string) => void;
}) {
    const ref = useRef<HTMLCanvasElement>(null),
        [tool, setTool] = useState("pencil"),
        [color, setColor] = useState(3),
        [draft, setDraft] = useState<number[] | null>(null),
        [selection, setSelection] = useState<{
            x: number;
            y: number;
            w: number;
            h: number;
        } | null>(null),
        [imported, setImported] = useState<ImportResult | null>(null),
        [transparent, setTransparent] = useState("");
    const drawing = useRef(false),
        importGeneration = useRef(0),
        start = useRef<Point>({ x: 0, y: 0 }),
        previous = useRef<Point>({ x: 0, y: 0 }),
        working = useRef<number[]>([]),
        clip = useRef<{ w: number; h: number; pixels: number[] } | null>(null);
    const f = asset.frames[Math.min(frame, asset.frames.length - 1)],
        colors = dmg ? dmgColors(game) : game.palettes[asset.palette].colors;
    useEffect(() => {
        ++importGeneration.current;
        drawing.current = false;
        setDraft(null);
        setImported(null);
    }, [asset, frame]);
    useEffect(() => {
        setSelection(null);
    }, [asset.id, asset.width, asset.height, frame]);
    useEffect(() => {
        const c = ref.current?.getContext("2d");
        if (!c) return;
        const data = imported?.pixels ?? draft ?? f.pixels;
        c.clearRect(0, 0, asset.width, asset.height);
        for (let y = 0; y < asset.height; y++)
            for (let x = 0; x < asset.width; x++) {
                const v = data[y * asset.width + x];
                c.fillStyle =
                    asset.kind === "sprite" && !v
                        ? (x + y) % 2
                            ? "#26333e"
                            : "#1b2630"
                        : colors[v];
                c.fillRect(x, y, 1, 1);
            }
        if (grid) {
            c.strokeStyle = "#65717b80";
            c.lineWidth = 0.06;
            for (let x = 0; x <= asset.width; x++) {
                c.beginPath();
                c.moveTo(x, 0);
                c.lineTo(x, asset.height);
                c.stroke();
            }
            for (let y = 0; y <= asset.height; y++) {
                c.beginPath();
                c.moveTo(0, y);
                c.lineTo(asset.width, y);
                c.stroke();
            }
            c.strokeStyle = "#afbac6";
            c.lineWidth = 0.12;
            for (let x = 8; x < asset.width; x += 8) {
                c.beginPath();
                c.moveTo(x, 0);
                c.lineTo(x, asset.height);
                c.stroke();
            }
            for (let y = 8; y < asset.height; y += 8) {
                c.beginPath();
                c.moveTo(0, y);
                c.lineTo(asset.width, y);
                c.stroke();
            }
        }
        c.lineWidth = 0.25;
        if (selection) {
            c.strokeStyle = "#fff";
            c.strokeRect(selection.x, selection.y, selection.w, selection.h);
        }
        if (tool === "hitbox") {
            c.strokeStyle = "#ff657d";
            c.strokeRect(
                asset.hitbox.x,
                asset.hitbox.y,
                asset.hitbox.w,
                asset.hitbox.h,
            );
        }
        if (tool === "origin" || tool === "emitter") {
            c.fillStyle = "#58e2cd";
            c.fillRect(asset.origin.x - 0.5, asset.origin.y - 2, 1, 4);
            c.fillRect(asset.origin.x - 2, asset.origin.y - 0.5, 4, 1);
            c.fillStyle = "#ffbd66";
            asset.emitters.forEach((p) =>
                c.fillRect(p.x - 0.5, p.y - 0.5, 1, 1),
            );
        }
    }, [asset, f, draft, colors, grid, selection, tool, imported]);
    const commit = (pixels: number[]) =>
        onChange({
            ...asset,
            frames: asset.frames.map((x) =>
                x.id === f.id ? { ...x, pixels } : x,
            ),
        });
    const paint = (p: Point) => {
        const shape = tool === "line" || tool === "rectangle";
        working.current = paintStroke(
            shape ? f.pixels : working.current,
            asset.width,
            asset.height,
            shape ? start.current : previous.current,
            p,
            tool === "erase" ? 0 : color,
            tool === "rectangle" ? "rectangle" : "line",
        );
        previous.current = p;
        setDraft([...working.current]);
    };
    const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.button !== 0 || imported) return;
        const p = pos(e, asset.width, asset.height);
        previous.current = p;
        start.current = p;
        e.currentTarget.setPointerCapture(e.pointerId);
        working.current = [...f.pixels];
        if (tool === "pick") {
            setColor(f.pixels[p.y * asset.width + p.x]);
            return;
        }
        if (tool === "origin") {
            onChange({ ...asset, origin: p });
            return;
        }
        if (tool === "emitter") {
            onChange({ ...asset, emitters: [...asset.emitters, p].slice(-4) });
            return;
        }
        if (tool === "fill") {
            const old = working.current[p.y * asset.width + p.x];
            if (old === color) return;
            const stack = [p.y * asset.width + p.x];
            while (stack.length) {
                const i = stack.pop()!;
                if (working.current[i] !== old) continue;
                working.current[i] = color;
                const x = i % asset.width,
                    y = Math.floor(i / asset.width);
                if (x) stack.push(i - 1);
                if (x + 1 < asset.width) stack.push(i + 1);
                if (y) stack.push(i - asset.width);
                if (y + 1 < asset.height) stack.push(i + asset.width);
            }
            commit(working.current);
            return;
        }
        drawing.current = true;
        if (tool === "select" || tool === "hitbox")
            setSelection({ x: p.x, y: p.y, w: 1, h: 1 });
        else paint(p);
    };
    const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawing.current) return;
        const p = pos(e, asset.width, asset.height);
        if (tool === "select" || tool === "hitbox")
            setSelection({
                x: Math.min(p.x, start.current.x),
                y: Math.min(p.y, start.current.y),
                w: Math.abs(p.x - start.current.x) + 1,
                h: Math.abs(p.y - start.current.y) + 1,
            });
        else paint(p);
    };
    const up = () => {
        if (!drawing.current) return;
        drawing.current = false;
        if (tool === "hitbox" && selection)
            onChange({ ...asset, hitbox: selection });
        else if (tool !== "select") commit(working.current);
        setDraft(null);
    };
    const transform = (vertical: boolean) => {
        const data = [...f.pixels],
            s = selection ?? { x: 0, y: 0, w: asset.width, h: asset.height };
        for (let y = 0; y < s.h; y++)
            for (let x = 0; x < s.w; x++)
                data[(s.y + y) * asset.width + s.x + x] =
                    f.pixels[
                        (s.y + (vertical ? s.h - 1 - y : y)) * asset.width +
                            s.x +
                            (vertical ? x : s.w - 1 - x)
                    ];
        commit(data);
    };
    return (
        <>
            <div className="toolbar wrap">
                {[
                    ["pencil", "鉛筆"],
                    ["erase", "消しゴム"],
                    ["line", "直線"],
                    ["rectangle", "矩形"],
                    ["fill", "塗りつぶし"],
                    ["select", "矩形選択"],
                    ["pick", "スポイト"],
                    ["hitbox", "当たり判定"],
                    ["origin", "原点"],
                    ["emitter", "発射位置"],
                ].map(([id, label]) => (
                    <button
                        className={tool === id ? "active" : ""}
                        aria-pressed={tool === id}
                        key={id}
                        onClick={() => setTool(id)}
                    >
                        {label}
                    </button>
                ))}
                <span className="spacer" />
                {colors.map((c, i) => (
                    <button
                        key={i}
                        title={`色 ${i}${i === 0 ? "（スプライト透明）" : ""}`}
                        className={`swatch ${i === color ? "chosen" : ""}`}
                        style={{ background: c }}
                        onClick={() => setColor(i)}
                    >
                        {i}
                    </button>
                ))}
            </div>
            <div className="canvas-well">
                <canvas
                    ref={ref}
                    aria-label="ピクセル編集キャンバス"
                    width={asset.width}
                    height={asset.height}
                    style={{
                        width: asset.width * zoom,
                        height: asset.height * zoom,
                    }}
                    onPointerDown={down}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={() => {
                        drawing.current = false;
                        setDraft(null);
                    }}
                />
            </div>
            <div className="toolbar wrap">
                <button onClick={() => transform(false)}>左右反転</button>
                <button onClick={() => transform(true)}>上下反転</button>
                <button
                    disabled={!selection}
                    onClick={() => {
                        const s = selection!;
                        clip.current = {
                            w: s.w,
                            h: s.h,
                            pixels: Array.from(
                                { length: s.w * s.h },
                                (_, i) =>
                                    f.pixels[
                                        (s.y + Math.floor(i / s.w)) *
                                            asset.width +
                                            s.x +
                                            (i % s.w)
                                    ],
                            ),
                        };
                    }}
                >
                    選択をコピー
                </button>
                <button
                    onClick={() => {
                        const c = clip.current;
                        if (!c) return;
                        const out = [...f.pixels],
                            p = selection ?? { x: 0, y: 0 };
                        for (let y = 0; y < c.h; y++)
                            for (let x = 0; x < c.w; x++)
                                if (
                                    x + p.x < asset.width &&
                                    y + p.y < asset.height
                                )
                                    out[(y + p.y) * asset.width + x + p.x] =
                                        c.pixels[y * c.w + x];
                        commit(out);
                    }}
                >
                    貼り付け
                </button>
                <button
                    onClick={() =>
                        window.caravan
                            .exportPng(asset, frame)
                            .catch((e) => error(e.message))
                    }
                >
                    PNG書出
                </button>
                <button
                    onClick={() => {
                        const generation = ++importGeneration.current;
                        void window.caravan
                            .importPng(
                                asset,
                                game.palettes[asset.palette].colors,
                                transparent
                                    ? parseInt(transparent.replace("#", ""), 16)
                                    : -1,
                            )
                            .then((result) => {
                                if (generation === importGeneration.current)
                                    setImported(result);
                            })
                            .catch((e) => error(e.message));
                    }}
                >
                    PNG取込
                </button>
                <input
                    title="透明にするRGB色（空欄ならアルファのみ）"
                    placeholder="透明色 #RRGGBB"
                    value={transparent}
                    onChange={(e) => setTransparent(e.target.value)}
                    style={{ width: 135 }}
                />
            </div>
            {imported && (
                <div className="notice">
                    取込プレビュー：{imported.sourceWidth}×
                    {imported.sourceHeight} / {imported.uniqueColors}色 → 4色 /
                    減色{imported.reduced}画素。
                    {imported.cropped
                        ? "右端・下端を切り取ります。"
                        : "不足領域は色0です。"}{" "}
                    8×8タイル {asset.width / 8}×{asset.height / 8}
                    <button
                        onClick={() => {
                            commit(imported.pixels);
                            setImported(null);
                        }}
                    >
                        この画像を取り込む
                    </button>
                    <button onClick={() => setImported(null)}>
                        キャンセル
                    </button>
                </div>
            )}
            <p className="hint">
                色0はスプライトでは透明。鉛筆・直線・矩形はドラッグで描画します。1回の描画は1回の元に戻す操作で取り消せます。矩形選択でコピー／反転、原点・発射位置はクリックで配置します。
            </p>
        </>
    );
}
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
        [tile, setTile] = useState(0),
        [wall, setWall] = useState(false),
        [tool, setTool] = useState("tile");
    const draft = useRef<Stage | null>(null),
        lastTile = useRef<Point | null>(null),
        [view, setView] = useState<Stage | null>(null);
    const s = view ?? stage,
        a = game.assets.find((a) => a.id === s.tileset)!;
    useEffect(() => {
        draft.current = null;
        lastTile.current = null;
        setView(null);
    }, [stage]);
    useEffect(() => {
        setTile(0);
    }, [stage.id, stage.tileset]);
    useEffect(() => {
        const c = ref.current?.getContext("2d");
        if (!c || !a) return;
        const colors = dmg ? dmgColors(game) : game.palettes[a.palette].colors,
            p = a.frames[0].pixels;
        for (let row = 0; row < s.height; row++)
            for (let x = 0; x < 20; x++) {
                const t = s.tiles[row * 20 + x],
                    tx = (t % (a.width / 8)) * 8,
                    ty = Math.floor(t / (a.width / 8)) * 8;
                for (let py = 0; py < 8; py++)
                    for (let px = 0; px < 8; px++) {
                        c.fillStyle = colors[p[(ty + py) * a.width + tx + px]];
                        c.fillRect(x * 8 + px, row * 8 + py, 1, 1);
                    }
                if (s.walls[row * 20 + x]) {
                    c.fillStyle = "#f25c6c70";
                    c.fillRect(x * 8, row * 8, 8, 8);
                }
            }
        if (grid) {
            c.strokeStyle = "#8d9aaf66";
            c.lineWidth = 0.25;
            for (let x = 0; x <= 160; x += 8) {
                c.beginPath();
                c.moveTo(x, 0);
                c.lineTo(x, s.height * 8);
                c.stroke();
            }
            for (let y = 0; y <= s.height * 8; y += 8) {
                c.beginPath();
                c.moveTo(0, y);
                c.lineTo(160, y);
                c.stroke();
            }
        }
        for (const e of s.events)
            if (e.kind === "enemy" || e.kind === "boss") {
                const y = e.y + Math.floor(e.frame * s.scrollSpeed);
                if (y >= 0 && y < s.height * 8) {
                    c.strokeStyle = e.id === eventId ? "#ffbd66" : "#54d8c4";
                    c.lineWidth = 0.75;
                    c.strokeRect(e.x - 4, y - 4, 8, 8);
                }
            }
    }, [s, a, dmg, grid, eventId]);
    const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const p = pos(e, 160, stage.height * 8);
        if (!draft.current) return;
        if (tool === "event") {
            draft.current.events = draft.current.events.map((event) =>
                event.id === eventId
                    ? {
                          ...event,
                          x: p.x,
                          y: clamp(
                              p.y - Math.floor(event.frame * stage.scrollSpeed),
                              -32,
                              176,
                          ),
                      }
                    : event,
            );
        } else {
            const cell = { x: Math.floor(p.x / 8), y: Math.floor(p.y / 8) };
            for (const point of linePoints(lastTile.current ?? cell, cell)) {
                const index = point.y * 20 + point.x;
                if (tool === "wall") draft.current.walls[index] = wall ? 1 : 0;
                else
                    draft.current.tiles[index] = Math.min(
                        tile,
                        (a.width * a.height) / 64 - 1,
                    );
            }
            lastTile.current = cell;
        }
        setView(clone(draft.current));
    };
    return (
        <>
            <div className="toolbar">
                <button
                    className={tool === "tile" ? "active" : ""}
                    onClick={() => setTool("tile")}
                >
                    タイル
                </button>
                <button
                    className={tool === "wall" ? "active" : ""}
                    onClick={() => setTool("wall")}
                >
                    壁
                </button>
                <button
                    className={tool === "event" ? "active" : ""}
                    onClick={() => setTool("event")}
                >
                    出現位置
                </button>
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
                            type="checkbox"
                            checked={wall}
                            onChange={(e) => setWall(e.target.checked)}
                        />
                        壁を置く（OFFで消去）
                    </label>
                ) : (
                    <span>タイムラインで敵を選択 → マップをクリック</span>
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
            <div className="canvas-well map">
                <canvas
                    ref={ref}
                    width={160}
                    height={stage.height * 8}
                    aria-label="ステージマップ編集キャンバス"
                    style={{ width: 480, height: stage.height * 24 }}
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        lastTile.current = null;
                        draft.current = clone(stage);
                        paint(e);
                    }}
                    onPointerMove={(e) => {
                        if (e.buttons && draft.current) paint(e);
                    }}
                    onPointerUp={() => {
                        if (draft.current) onChange(draft.current);
                        draft.current = null;
                        lastTile.current = null;
                        setView(null);
                    }}
                    onPointerCancel={() => {
                        draft.current = null;
                        lastTile.current = null;
                        setView(null);
                    }}
                />
            </div>
            <p className="hint">
                赤は壁。自機が接触すると被弾し、両陣営の弾は消滅します。敵は地形を通過します。
            </p>
        </>
    );
}
export function ScreenCanvas({
    game,
    screen,
    onChange,
    glyphs,
    dmg,
    selected,
    onSelect,
}: {
    game: Game;
    screen: Screen;
    onChange: (s: Screen) => void;
    glyphs: Record<string, number[]>;
    dmg: boolean;
    selected: string;
    onSelect: (id: string) => void;
}) {
    const ref = useRef<HTMLCanvasElement>(null),
        height = screen.id === "hud" ? 16 : 144;
    useEffect(() => {
        const c = ref.current?.getContext("2d");
        if (!c) return;
        drawScreen(c, game, screen, glyphs, dmg);
        c.strokeStyle = "#7f90a344";
        c.lineWidth = 0.3;
        for (let x = 0; x <= 160; x += 8) {
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x, height);
            c.stroke();
        }
        for (let y = 0; y <= height; y += 8) {
            c.beginPath();
            c.moveTo(0, y);
            c.lineTo(160, y);
            c.stroke();
        }
        const t = screen.items.find((i) => i.id === selected);
        if (t) {
            c.strokeStyle = "#ffbd66";
            c.strokeRect(t.x * 8, t.y * 8, Math.max(8, t.text.length * 8), 8);
        }
    }, [game, screen, glyphs, dmg, selected]);
    const dragging = useRef(""),
        grab = useRef({ x: 0, y: 0 });
    return (
        <>
            <div className="canvas-well">
                <canvas
                    ref={ref}
                    width={160}
                    height={height}
                    style={{ width: 640, height: height * 4 }}
                    onPointerDown={(e) => {
                        const p = pos(e, 160, height),
                            x = Math.floor(p.x / 8),
                            y = Math.floor(p.y / 8),
                            hit = [...screen.items]
                                .reverse()
                                .find(
                                    (t) =>
                                        t.y === y &&
                                        x >= t.x &&
                                        x < t.x + Math.max(t.text.length, 5),
                                );
                        dragging.current = hit?.id ?? selected;
                        const target =
                            hit ?? screen.items.find((t) => t.id === selected);
                        grab.current = {
                            x: x - (target?.x ?? x),
                            y: y - (target?.y ?? y),
                        };
                        if (hit) onSelect(hit.id);
                        e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        if (!e.buttons || !dragging.current) return;
                        const p = pos(e, 160, height);
                        onChange({
                            ...screen,
                            items: screen.items.map((t) =>
                                t.id === dragging.current
                                    ? {
                                          ...t,
                                          x: Math.max(
                                              0,
                                              Math.min(
                                                  19,
                                                  Math.floor(p.x / 8) -
                                                      grab.current.x,
                                              ),
                                          ),
                                          y: Math.max(
                                              0,
                                              Math.min(
                                                  height / 8 - 1,
                                                  Math.floor(p.y / 8) -
                                                      grab.current.y,
                                              ),
                                          ),
                                      }
                                    : t,
                            ),
                        });
                    }}
                    onPointerUp={() => (dragging.current = "")}
                />
            </div>
            <p className="hint">
                文字をドラッグして8px単位で配置。英数字・ひらがな・カタカナを使用できます。
            </p>
        </>
    );
}
export function drawScreen(
    c: CanvasRenderingContext2D,
    g: Game,
    s: Screen,
    glyphs: Record<string, number[]>,
    dmg: boolean,
    values: Record<string, string> = {},
) {
    const colors = dmg ? dmgColors(g) : g.palettes[s.palette].colors;
    c.fillStyle = colors[0];
    c.fillRect(0, 0, 160, s.id === "hud" ? 16 : 144);
    const background = g.assets.find((a) => a.id === s.background);
    if (background) drawAsset(c, g, background, 0, 0, 0, dmg);
    for (const item of s.items) {
        const palette = dmg ? dmgColors(g) : g.palettes[item.palette].colors,
            text =
                item.text +
                (item.binding === "none"
                    ? ""
                    : (values[item.binding] ??
                      (item.binding === "highscores" ? "1  00000" : "00000")));
        const drawText = (text: string, tx: number, ty: number) =>
            [...text.normalize("NFC")].forEach((char, i) => {
                const pixels = glyphs[char];
                for (let y = 0; y < 8; y++)
                    for (let x = 0; x < 8; x++) {
                        c.fillStyle = palette[pixels?.[y * 8 + x] ?? 0];
                        c.fillRect((tx + i) * 8 + x, ty * 8 + y, 1, 1);
                    }
            });
        drawText(text, item.x, item.y);
        if (item.binding === "highscores")
            for (let rank = 2; rank <= 5; rank++)
                drawText(
                    `${rank}  00000`,
                    item.x + item.text.normalize("NFC").length,
                    item.y + (rank - 1) * 2,
                );
    }
}
export function MotionCanvas({
    motion,
    onChange,
}: {
    motion: Motion;
    onChange: (m: Motion) => void;
}) {
    const ref = useRef<HTMLCanvasElement>(null),
        drag = useRef(-1);
    useEffect(() => {
        const c = ref.current?.getContext("2d");
        if (!c) return;
        c.fillStyle = "#121b26";
        c.fillRect(0, 0, 320, 288);
        c.strokeStyle = "#334451";
        for (let x = 0; x <= 320; x += 16) {
            c.beginPath();
            c.moveTo(x, 0);
            c.lineTo(x, 288);
            c.stroke();
        }
        for (let y = 0; y <= 288; y += 16) {
            c.beginPath();
            c.moveTo(0, y);
            c.lineTo(320, y);
            c.stroke();
        }
        c.strokeStyle = "#55d8c1";
        c.beginPath();
        motion.points.forEach((p, i) => {
            if (i) c.lineTo(p.x + 160, p.y + 80);
            else c.moveTo(p.x + 160, p.y + 80);
        });
        c.stroke();
        motion.points.forEach((p, i) => {
            c.fillStyle = "#ffbd66";
            c.fillRect(p.x + 156, p.y + 76, 8, 8);
            c.fillStyle = "#fff";
            c.font = "11px sans-serif";
            c.fillText(`${i + 1}: ${p.frame}f`, p.x + 166, p.y + 80);
        });
    }, [motion]);
    return (
        <>
            <div className="canvas-well">
                <canvas
                    width={320}
                    height={288}
                    style={{ width: 640, height: 576 }}
                    ref={ref}
                    onPointerDown={(e) => {
                        const p = pos(e, 320, 288);
                        drag.current = motion.points.findIndex(
                            (q) =>
                                Math.abs(q.x + 160 - p.x) < 8 &&
                                Math.abs(q.y + 80 - p.y) < 8,
                        );
                        e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                        if (drag.current < 0 || !e.buttons) return;
                        const p = pos(e, 320, 288);
                        onChange({
                            ...motion,
                            kind: "path",
                            points: motion.points.map((q, i) =>
                                i === drag.current
                                    ? { ...q, x: p.x - 160, y: p.y - 80 }
                                    : q,
                            ),
                        });
                    }}
                    onPointerUp={() => (drag.current = -1)}
                />
            </div>
            <p className="hint">
                経路の四角をドラッグ。座標は出現位置からの相対値です。各点の通過時刻は右側で編集します。
            </p>
        </>
    );
}
