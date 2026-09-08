import React, { useEffect, useRef } from "react";
import { type Asset, type Game, DMG_COLORS } from "../shared/model";

export function TilePalette({
    game,
    asset,
    dmg,
    selected,
    onSelect,
}: {
    game: Game;
    asset: Asset;
    dmg: boolean;
    selected: number;
    onSelect: (tile: number) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const columns = asset.width / 8,
        count = (asset.width * asset.height) / 64;
    useEffect(() => {
        const ctx = canvas.current?.getContext("2d");
        if (!ctx) return;
        const colors = dmg ? DMG_COLORS : game.palettes[asset.palette].colors;
        asset.frames[0].pixels.forEach((pixel, index) => {
            ctx.fillStyle = colors[pixel];
            ctx.fillRect(
                index % asset.width,
                Math.floor(index / asset.width),
                1,
                1,
            );
        });
        ctx.strokeStyle = "#5ee2bf";
        ctx.lineWidth = 1;
        ctx.strokeRect(
            (selected % columns) * 8 + 0.5,
            Math.floor(selected / columns) * 8 + 0.5,
            7,
            7,
        );
    }, [game, asset, dmg, selected]);
    return (
        <div className="toolbar wrap" style={{ alignItems: "flex-start" }}>
            <div>
                <strong>タイルパレット</strong>
                <p className="hint">
                    画像をクリックして選択
                    <br />
                    選択 {selected} / {count - 1}
                    <br />
                    矢印キーでも選べます
                </p>
            </div>
            <canvas
                ref={canvas}
                width={asset.width}
                height={asset.height}
                tabIndex={0}
                aria-label={`タイルパレット、選択 ${selected}`}
                role="grid"
                style={{
                    width: asset.width * 3,
                    height: asset.height * 3,
                    imageRendering: "pixelated",
                    cursor: "crosshair",
                }}
                onPointerDown={(e) => {
                    e.currentTarget.focus();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = Math.floor(
                        ((e.clientX - rect.left) * asset.width) /
                            rect.width /
                            8,
                    );
                    const y = Math.floor(
                        ((e.clientY - rect.top) * asset.height) /
                            rect.height /
                            8,
                    );
                    onSelect(Math.max(0, Math.min(count - 1, y * columns + x)));
                }}
                onKeyDown={(e) => {
                    const delta: Record<string, number> = {
                        ArrowLeft: -1,
                        ArrowRight: 1,
                        ArrowUp: -columns,
                        ArrowDown: columns,
                    };
                    if (delta[e.key] !== undefined) {
                        onSelect(
                            Math.max(
                                0,
                                Math.min(count - 1, selected + delta[e.key]),
                            ),
                        );
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }}
            />
        </div>
    );
}
