import React, { useState, useRef, useEffect } from "react";
import type { Boss, Game } from "../shared/model";
import { MotionCanvas, drawScreen } from "./canvases";
export function BossCanvas({
    boss,
    onChange,
    game, glyphs, dmg,
}: {
    boss: Boss;
    onChange: (boss: Boss) => void;
    game: Game;
    glyphs: Record<string, number[]>;
    dmg: boolean;
}) {
    const [index, setIndex] = useState(0),
        selected = Math.min(index, boss.phases.length - 1),
        phase = boss.phases[selected];
    const canvas = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const ctx = canvas.current?.getContext("2d"), intro = phase?.intro;
        if (!ctx || !intro?.enabled || !game.assets.some(a => a.id === intro.background)) return;
        const name = [...intro.spellName];
        drawScreen(ctx, game, {id:"clear",name:"カットイン",background:intro.background,palette:0,dock:"top",items:[
            {id:"spell-1",text:name.slice(0,18).join(""),x:1,y:14,palette:0,binding:"none"},
            {id:"spell-2",text:name.slice(18).join(""),x:1,y:16,palette:0,binding:"none"}
        ]}, glyphs, dmg);
    }, [phase, game, glyphs, dmg]);
    if (!phase)
        return (
            <p className="notice">攻撃フェーズを1つ以上設定してください。</p>
        );
    return (
        <>
            <div className="toolbar">
                <label>
                    経路を編集する攻撃フェーズ{" "}
                    <select
                        value={selected}
                        onChange={(e) => setIndex(Number(e.target.value))}
                    >
                        {boss.phases.map((p, i) => (
                            <option key={p.id} value={i}>
                                {i + 1} · {p.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {phase.intro?.enabled && <div className="canvas-well">
                <canvas ref={canvas} width={160} height={144} style={{width:320,height:288,imageRendering:"pixelated"}} aria-label="弾幕名カットインプレビュー" />
                <p>{phase.intro.seconds}秒間、戦闘を停止して表示します。</p>
            </div>}
            <MotionCanvas
                motion={phase.motion}
                onChange={(motion) =>
                    onChange({
                        ...boss,
                        phases: boss.phases.map((p, i) =>
                            i === selected ? { ...p, motion } : p,
                        ),
                    })
                }
            />
        </>
    );
}
