import React,{useEffect,useRef,useState} from "react";
import type {Game,Screen} from "../shared/model";
import {resolveEnding} from "../shared/presentation";
import {drawScreen} from "./canvases";

export function PlayerPresentationCanvas({game,glyphs,dmg}:{game:Game;glyphs:Record<string,number[]>;dmg:boolean}){
    const [slide,setSlide]=useState(0),ending=useRef<HTMLCanvasElement>(null);
    const [character,setCharacter]=useState(0),selection=useRef<HTMLCanvasElement>(null),over=useRef<HTMLCanvasElement>(null);
    const players=[{...game.player,name:game.player.name??"PLAYER 1"},...(game.player.characters??[])],p=players[Math.min(character,players.length-1)];
    useEffect(()=>{
        const slides=resolveEnding(game,character),asset=game.assets.find(a=>a.id===slides[Math.min(slide,slides.length-1)]?.background);
        const panels:[React.RefObject<HTMLCanvasElement|null>,Screen][]=[[selection,{id:"clear",name:"機体選択",background:p.selectionBackground??"",palette:0,dock:"top",items:[]}],[over,{...game.screens.find(s=>s.id==="gameover")!,background:p.gameoverBackground||game.screens.find(s=>s.id==="gameover")!.background}]];
        if(asset)panels.push([ending,{id:"clear",name:"エンディング",background:asset.id,palette:asset.palette,dock:"top",items:[]}]);
        else {const c=ending.current?.getContext("2d");if(c){c.fillStyle="#000";c.fillRect(0,0,160,144);}}
        for(const [ref,screen]of panels){
            const c=ref.current?.getContext("2d");if(!c)continue;c.fillStyle="#000";c.fillRect(0,0,160,144);drawScreen(c,game,screen,glyphs,dmg,{score:"00000"});
        }
    },[game,glyphs,dmg,character,slide]);
    return <div className="canvas-well" style={{display:"block",textAlign:"center"}}>
        <label>機体 <select aria-label="機体別画面のプレビュー" value={Math.min(character,players.length-1)} onChange={e=>setCharacter(Number(e.target.value))}>{players.map((p,i)=><option key={i} value={i}>{p.name}</option>)}</select></label>
        <p>機体選択</p><canvas ref={selection} width={160} height={144} aria-label="機体選択画像プレビュー" style={{width:320,height:288,imageRendering:"pixelated"}}/>
        <p>ゲームオーバー</p><canvas ref={over} width={160} height={144} aria-label="機体別ゲームオーバープレビュー" style={{width:320,height:288,imageRendering:"pixelated"}}/>
        <p>エンディング <select aria-label="エンディング画像のプレビュー" value={Math.min(slide,resolveEnding(game,character).length-1)} onChange={e=>setSlide(Number(e.target.value))}>{resolveEnding(game,character).map((s,i)=><option key={s.id} value={i}>{i+1}: {game.assets.find(a=>a.id===s.background)?.name??s.background}</option>)}</select></p>
        <canvas ref={ending} width={160} height={144} aria-label="機体別エンディングプレビュー" style={{width:320,height:288,imageRendering:"pixelated"}}/>
    </div>;
}
