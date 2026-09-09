import React, { useState } from "react";
import type { Boss } from "../shared/model";
import { MotionCanvas } from "./canvases";
export function BossCanvas({
    boss,
    onChange,
}: {
    boss: Boss;
    onChange: (boss: Boss) => void;
}) {
    const [index, setIndex] = useState(0),
        selected = Math.min(index, boss.phases.length - 1),
        phase = boss.phases[selected];
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
