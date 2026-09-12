import React, {useEffect, useRef, useState} from "react";
import type {Game, Stage} from "../shared/model";
import {resolvePresentation, dialoguePixels} from "../shared/presentation";
import {drawAsset} from "../shared/simulation";
import {drawScreen} from "./canvases";

export function VictoryDialogueCanvas({game, stage, glyphs, dmg, before=false}: {game: Game; stage: Stage; glyphs: Record<string, number[]>; dmg: boolean; before?:boolean}) {
    const ref=useRef<HTMLCanvasElement>(null),[selected,setSelected]=useState(0),[character,setCharacter]=useState(0);
    const currentCharacter=Math.min(character,game.player.characters?.length??0);
    const p=resolvePresentation(game,stage,currentCharacter),dialogue=before?p&&{enabled:p.enabled,background:p.dialogueBackground,portrait:p.dialoguePortrait,pages:p.dialogue}:p?.victoryDialogue;
    const pages=dialogue?.enabled?dialogue.pages:[],index=Math.min(selected,Math.max(0,pages.length-1)),page=pages[index],title=before?"戦闘前会話":"撃破後会話";
    useEffect(()=>{
        const c=ref.current?.getContext("2d");if(!c)return;c.fillStyle="#000";c.fillRect(0,0,160,144);if(!page||!dialogue)return;
        drawScreen(c,game,{id:"clear",name:title,background:dialogue.background,palette:0,dock:"top",items:[
            {id:"name",text:page.speaker,x:1,y:12,palette:0,binding:"none"},
            {id:"line1",text:page.line1,x:1,y:14,palette:0,binding:"none"},
            {id:"line2",text:page.line2,x:1,y:15,palette:0,binding:"none"},
            {id:"next",text:"A:つぎ START:スキップ",x:1,y:17,palette:0,binding:"none"}
        ]},glyphs,dmg);
        const art=game.assets.find(a=>a.id===dialogue.background),left=game.assets.find(a=>a.id===dialogue.portrait);
        if(art&&!dmg){c.save();c.beginPath();c.rect(80,0,80,96);c.clip();drawAsset(c,game,{...art,palette:p?.rightPalette??0},0,0,0,false);c.restore();}
        if(art&&left){const pixels=dialoguePixels(game,dialogue.background,dialogue.portrait)!;c.save();c.beginPath();c.rect(0,0,80,96);c.clip();drawAsset(c,game,{...art,palette:left.palette,frames:[{...art.frames[0],pixels}]},0,0,0,dmg);c.restore();}
    },[game,stage,glyphs,dmg,character,selected,before]);
    if(!stage.presentation)return null;
    return <details className="canvas-well" style={{display:"block",textAlign:"center",minHeight:0}}><summary>{title}プレビュー</summary>
        <label>機体 <select aria-label={title+"の機体"} value={currentCharacter} onChange={e=>{setCharacter(Number(e.target.value));setSelected(0);}}>
            {[{name:game.player.name??"PLAYER 1"},...(game.player.characters??[])].map((p,i)=><option key={i} value={i}>{p.name}</option>)}
        </select></label>
        <label>ページ <select aria-label={title+"ページ"} value={index} onChange={e=>setSelected(Number(e.target.value))}>{pages.map((p,i)=><option key={p.id} value={i}>{i+1} · {p.speaker}</option>)}</select></label>
        {!page&&<p>この機体の会話は無効です。</p>}
        <canvas ref={ref} width={160} height={144} style={{display:"block",margin:"12px auto",width:320,height:288,imageRendering:"pixelated"}} aria-label={title+"プレビュー"}/>
    </details>;
}
