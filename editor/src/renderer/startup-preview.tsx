import React, { useEffect, useRef, useState } from "react";
import type { Game } from "../shared/model";
import { drawScreen } from "./canvases";

export function StartupPreview({game, glyphs, dmg}: {game: Game; glyphs: Record<string, number[]>; dmg: boolean}) {
    const canvas = useRef<HTMLCanvasElement>(null), [selected, setSelected] = useState(0);
    const slides = game.startup?.slides ?? [], index = Math.min(selected, slides.length - 1);
    const slide = slides[index];
    useEffect(() => {
        const c = canvas.current?.getContext("2d");
        if (!c) return;
        c.fillStyle = "#000"; c.fillRect(0, 0, 160, 144);
        const asset = game.assets.find(a => a.id === slide?.background);
        if (asset) drawScreen(c, game, {id:"clear", name:"起動ロゴ", background:asset.id, palette:asset.palette, dock:"top", items:[]}, glyphs, dmg);
    }, [game, glyphs, dmg, slide]);
    return <details className="project-overview" open={slides.length > 0}>
        <summary>起動ロゴのプレビュー</summary>
        {slides.length ? <>
            <label>表示するページ <select aria-label="起動ロゴのプレビューページ" value={index} onChange={e => setSelected(Number(e.target.value))}>
                {slides.map((s, i) => <option key={s.id} value={i}>{i + 1}: {game.assets.find(a => a.id === s.background)?.name ?? s.background}</option>)}
            </select></label>
            <p>{game.startup?.enabled ? "起動時に表示" : "起動時の表示は無効"} · {slide.seconds}秒表示 · フェード片道 {game.startup?.fadeSeconds}秒</p>
            <canvas ref={canvas} width={160} height={144} aria-label="起動ロゴ画像プレビュー" style={{width:320, height:288, imageRendering:"pixelated"}}/>
        </> : <p>右の「起動ロゴ（タイトル前）」に画面画像を追加してください。未登録の場合はタイトルから始まります。</p>}
    </details>;
}
