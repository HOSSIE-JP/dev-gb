import React, {useEffect, useRef, useState} from "react";
import type {Game, Stage} from "../shared/model";
import {drawAsset} from "../shared/simulation";
import {drawScreen} from "./canvases";

export function VictoryDialogueCanvas({game, stage, glyphs, dmg}: {game: Game; stage: Stage; glyphs: Record<string, number[]>; dmg: boolean}) {
    const ref = useRef<HTMLCanvasElement>(null), [selected, setSelected] = useState(0);
    const dialogue = stage.presentation?.victoryDialogue, pages = dialogue?.pages ?? [], index = Math.min(selected, Math.max(0, pages.length - 1)), page = pages[index];
    useEffect(() => {
        const c = ref.current?.getContext("2d"); if (!c || !page || !dialogue) return;
        drawScreen(c, game, {id:"clear", name:"撃破後会話", background:dialogue.background, palette:0, dock:"top", items:[
            {id:"name", text:page.speaker, x:1, y:12, palette:0, binding:"none"},
            {id:"line1", text:page.line1, x:1, y:14, palette:0, binding:"none"},
            {id:"line2", text:page.line2, x:1, y:15, palette:0, binding:"none"},
            {id:"next", text:"A:つぎ START:スキップ", x:1, y:17, palette:0, binding:"none"}
        ]}, glyphs, dmg);
        const art = game.assets.find(a => a.id === dialogue.background);
        if (art && !dmg) {c.save(); c.beginPath(); c.rect(80,0,80,96); c.clip();drawAsset(c,game,{...art,palette:stage.presentation?.rightPalette ?? 0},0,0,0,false);c.restore();}
    }, [game, stage, glyphs, dmg, dialogue, page]);
    if (!dialogue?.enabled || !page) return null;
    return <details className="canvas-well" style={{display:"block",textAlign:"center",minHeight:0}}><summary>撃破後会話プレビュー</summary>
        <label>ページ <select aria-label="撃破後会話ページ" value={index} onChange={e=>setSelected(Number(e.target.value))}>{pages.map((p,i)=><option key={p.id} value={i}>{i+1} · {p.speaker}</option>)}</select></label>
        <canvas ref={ref} width={160} height={144} style={{display:"block",margin:"12px auto",width:320,height:288,imageRendering:"pixelated"}} aria-label="撃破後会話プレビュー" />
    </details>;
}
