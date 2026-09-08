import React, { useEffect, useRef, useState } from "react";
import { clone, type Stage } from "../shared/model";

export function Timeline({
    stage,
    selected,
    onSelect,
    onChange,
}: {
    stage: Stage;
    selected: string;
    onSelect: (id: string) => void;
    onChange: (s: Stage) => void;
}) {
    const canvas = useRef<HTMLCanvasElement>(null),
        drag = useRef(""),
        draft = useRef<Stage | null>(null),
        [view, setView] = useState<Stage | null>(null),
        width = Math.max(700, stage.duration * 10);
    const current = view ?? stage;
    useEffect(() => {
        draft.current = null;
        drag.current = "";
        setView(null);
    }, [stage]);
    const changeTime = (source: Stage, id: string, frame: number) => ({
        ...source,
        events: source.events.map((event) => {
            if (event.id !== id) return event;
            const tail =
                event.kind === "enemy" || event.kind === "boss"
                    ? Math.max(0, event.count - 1) * event.interval
                    : 0;
            return {
                ...event,
                frame: Math.max(
                    0,
                    Math.min(source.duration * 60 - 1 - tail, frame),
                ),
            };
        }),
    });
    useEffect(() => {
        const c = canvas.current?.getContext("2d");
        if (!c) return;
        c.fillStyle = "#131d28";
        c.fillRect(0, 0, width, 110);
        c.font = "11px sans-serif";
        for (let sec = 0; sec <= stage.duration; sec += 10) {
            const x = (sec / stage.duration) * width;
            c.fillStyle = "#253545";
            c.fillRect(x, 22, 1, 88);
            c.fillStyle = "#899bab";
            c.fillText(`${sec}s`, x + 3, 15);
        }
        current.events.forEach((e) => {
            const x = (e.frame / (stage.duration * 60)) * width,
                y =
                    30 +
                    ["enemy", "boss", "scroll", "end"].indexOf(e.kind) * 19;
            c.fillStyle =
                e.id === selected
                    ? "#ffbd66"
                    : e.kind === "boss"
                      ? "#ee6d8b"
                      : e.kind === "enemy"
                        ? "#57cbb5"
                        : "#8b9fd0";
            c.fillRect(x, y, Math.max(5, e.count * 2), 13);
        });
    }, [current, selected, width]);
    return (
        <div className="timeline">
            <div className="panel-title">
                ステージ・タイムライン{" "}
                <span>
                    敵 / ボス / 速度 /
                    終了　·　クリックで選択、ドラッグで時刻変更
                </span>
            </div>
            <div className="timeline-scroll">
                <canvas
                    width={width}
                    height={110}
                    ref={canvas}
                    tabIndex={0}
                    aria-label="ステージタイムライン。選択後、左右キーで15フレーム、Shift併用で60フレーム移動"
                    onKeyDown={(e) => {
                        const event = stage.events.find(
                            (event) => event.id === selected,
                        );
                        if (
                            !event ||
                            ![
                                "ArrowLeft",
                                "ArrowRight",
                                "Home",
                                "End",
                            ].includes(e.key)
                        )
                            return;
                        e.preventDefault();
                        e.stopPropagation();
                        const frame =
                            e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? stage.duration * 60 - 1
                                  : event.frame +
                                    (e.key === "ArrowLeft" ? -1 : 1) *
                                        (e.shiftKey ? 60 : 15);
                        onChange(changeTime(stage, selected, frame));
                    }}
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.currentTarget.focus();
                        const r = e.currentTarget.getBoundingClientRect(),
                            x = e.clientX - r.left,
                            y = e.clientY - r.top,
                            kind = Math.floor((y - 30) / 19);
                        const found = [...stage.events]
                            .sort(
                                (a, b) =>
                                    Math.abs(
                                        (a.frame / (stage.duration * 60)) *
                                            width -
                                            x,
                                    ) -
                                    Math.abs(
                                        (b.frame / (stage.duration * 60)) *
                                            width -
                                            x,
                                    ),
                            )
                            .find(
                                (v) =>
                                    ["enemy", "boss", "scroll", "end"].indexOf(
                                        v.kind,
                                    ) === kind &&
                                    Math.abs(
                                        (v.frame / (stage.duration * 60)) *
                                            width -
                                            x,
                                    ) < 12,
                            );
                        if (found) {
                            onSelect(found.id);
                            drag.current = found.id;
                            draft.current = clone(stage);
                            e.currentTarget.setPointerCapture(e.pointerId);
                        }
                    }}
                    onPointerMove={(e) => {
                        if (!e.buttons || !drag.current || !draft.current)
                            return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        const frame =
                            Math.round(
                                ((e.clientX - rect.left) / rect.width) *
                                    stage.duration *
                                    4,
                            ) * 15;
                        draft.current = changeTime(
                            draft.current,
                            drag.current,
                            frame,
                        );
                        setView(draft.current);
                    }}
                    onPointerUp={() => {
                        if (draft.current) onChange(draft.current);
                        drag.current = "";
                        draft.current = null;
                        setView(null);
                    }}
                    onPointerCancel={() => {
                        drag.current = "";
                        draft.current = null;
                        setView(null);
                    }}
                />
            </div>
        </div>
    );
}
