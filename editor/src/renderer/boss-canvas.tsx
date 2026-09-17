import React, { useState, useRef, useEffect } from "react";
import type { Boss, Game } from "../shared/model";
import { MotionCanvas, drawScreen } from "./canvases";
import {cutinPresentation} from "../shared/presentation";
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
        drawScreen(ctx, game, cutinPresentation(intro), glyphs, dmg);
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
            <div className="toolbar">
                <label>モード制限時間（秒・0で無制限） <input aria-label="モード制限時間" type="number" min={0} max={99} value={phase.timeLimitSeconds ?? 0} onChange={e=>onChange({...boss,phases:boss.phases.map((p,i)=>i===selected?{...p,timeLimitSeconds:Number(e.target.value)}:p)})}/></label>
                <label>モード撃破点（空欄は従来方式） <input aria-label="モード撃破点" type="number" min={0} max={65534} value={phase.score ?? ""} onChange={e=>onChange({...boss,phases:boss.phases.map((p,i)=>i===selected?{...p,score:e.target.value===""?undefined:Number(e.target.value)}:p)})}/></label>
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
