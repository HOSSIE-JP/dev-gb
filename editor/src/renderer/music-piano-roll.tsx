import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    noteName,
    pianoNotes,
    type MusicTrack,
    type PianoNote,
} from "../shared/music-score";
import "./music-piano-roll.css";

const ROW = 16,
    KEY = 54,
    HEADER = 24;
const names = ["主旋律 · CH2", "副旋律 · CH1", "ベース · CH3"];
const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));
type Drag = {
    x: number;
    y: number;
    original: PianoNote | null;
    next: PianoNote;
    resize: boolean;
    moved: boolean;
};

export function MusicPianoRoll({
    song,
    voice,
    selectedRow,
    playRow,
    disabled,
    onVoice,
    onPage,
    onSelect,
    onEdit,
}: {
    song: MusicTrack;
    voice: number;
    selectedRow: number;
    playRow: number;
    disabled: boolean;
    onVoice: (voice: number) => void;
    onPage: (bar: number) => void;
    onSelect: (voice: number, note: PianoNote) => void;
    onEdit: (
        voice: number,
        originalStart: number | null,
        note: PianoNote | null,
    ) => void;
}) {
    const viewport = useRef<HTMLDivElement>(null),
        grid = useRef<HTMLDivElement>(null),
        gesture = useRef<Drag | null>(null);
    const [step, setStep] = useState(12),
        [preview, setPreview] = useState<Drag | null>(null);
    const total = song.bars.length * 16,
        first = Math.floor(selectedRow / 64) * 64,
        last = Math.min(total, first + 64),
        width = (last - first) * step;
    const notes = useMemo(
        () => [0, 1, 2].map((v) => pianoNotes(song, v)),
        [song],
    );
    const selected = notes[voice].find(
        (n) => n.start <= selectedRow && selectedRow < n.start + n.length,
    );
    useEffect(() => {
        gesture.current = null;
        setPreview(null);
    }, [song, voice, first, disabled]);
    useEffect(() => {
        const el = viewport.current;
        const pitch =
            notes[voice].find((n) => n.start >= first && n.start < last)
                ?.pitch ?? 37;
        if (el) {
            el.scrollTop = HEADER + (60 - pitch) * ROW - el.clientHeight / 2;
            el.scrollLeft = 0;
        }
    }, [song.id, voice, first]);
    const point = (e: React.PointerEvent) => {
        const r = grid.current!.getBoundingClientRect();
        return {
            start: clamp(
                first + Math.floor((e.clientX - r.left) / step),
                first,
                last - 1,
            ),
            pitch: clamp(60 - Math.floor((e.clientY - r.top) / ROW), 1, 60),
        };
    };
    const begin = (
        e: React.PointerEvent,
        original: PianoNote | null,
        resize = false,
    ) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        grid.current!.focus({ preventScroll: true });
        const p = point(e),
            next = original
                ? { ...original }
                : { ...p, length: 1, volume: voice === 2 ? 64 : 128 };
        const drag = {
            x: e.clientX,
            y: e.clientY,
            original,
            next,
            resize,
            moved: false,
        };
        gesture.current = drag;
        setPreview(drag);
        grid.current!.setPointerCapture(e.pointerId);
    };
    const move = (e: React.PointerEvent) => {
        const d = gesture.current;
        if (!d) return;
        const dx = Math.round((e.clientX - d.x) / step),
            dy = Math.round((e.clientY - d.y) / ROW);
        const next = { ...d.next };
        if (!d.original)
            next.length = clamp(
                point(e).start - next.start + 1,
                1,
                total - next.start,
            );
        else if (d.resize)
            next.length = clamp(
                d.original.length + dx,
                1,
                total - d.original.start,
            );
        else {
            next.start = clamp(
                d.original.start + dx,
                0,
                total - d.original.length,
            );
            next.pitch = clamp(d.original.pitch - dy, 1, 60);
        }
        const changed = { ...d, next, moved: d.moved || dx !== 0 || dy !== 0 };
        gesture.current = changed;
        setPreview(changed);
    };
    const cancel = () => {
        gesture.current = null;
        setPreview(null);
    };
    const finish = (e: React.PointerEvent) => {
        const d = gesture.current;
        if (!d) return;
        cancel();
        if (grid.current!.hasPointerCapture(e.pointerId))
            grid.current!.releasePointerCapture(e.pointerId);
        if (!d.original || d.moved)
            onEdit(voice, d.original?.start ?? null, d.next);
        else onSelect(voice, d.original);
    };
    const visible = (n: PianoNote) =>
        n.start < last && n.start + n.length > first;
    const style = (n: PianoNote): React.CSSProperties => ({
        left: (Math.max(first, n.start) - first) * step + 1,
        top: (60 - n.pitch) * ROW + 1,
        width:
            (Math.min(last, n.start + n.length) - Math.max(first, n.start)) *
                step -
            2,
        height: ROW - 2,
    });
    return (
        <section className="music-piano" aria-label="ピアノロール">
            <div className="music-toolbar">
                <strong>ピアノロール</strong>
                <label>
                    編集声部{" "}
                    <select
                        aria-label="ピアノロール声部"
                        value={voice}
                        disabled={disabled}
                        onChange={(e) => onVoice(+e.target.value)}
                    >
                        {names.map((n, i) => (
                            <option key={i} value={i}>
                                {n}
                            </option>
                        ))}
                    </select>
                </label>
                <button
                    disabled={first === 0 || disabled}
                    onClick={() => onPage(Math.max(0, first / 16 - 4))}
                >
                    前の4小節
                </button>
                <span>
                    {first / 16 + 1}〜{last / 16}小節
                </span>
                <button
                    disabled={last === total || disabled}
                    onClick={() => onPage(last / 16)}
                >
                    次の4小節
                </button>
                <label>
                    横幅{" "}
                    <select
                        aria-label="ピアノロール横幅"
                        value={step}
                        onChange={(e) => setStep(+e.target.value)}
                    >
                        <option value={12}>標準</option>
                        <option value={18}>広い</option>
                        <option value={24}>拡大</option>
                    </select>
                </label>
                <button
                    disabled={disabled || !selected}
                    onClick={() =>
                        selected && onEdit(voice, selected.start, null)
                    }
                >
                    選択音を削除
                </button>
            </div>
            <p className="piano-help">
                空白をクリック・横にドラッグして追加。音符をドラッグして移動、右端で長さ変更。右クリック／Deleteで削除。矢印で移動、Shift＋左右で長さ変更。同じ声の重なる範囲は置き換えます。
            </p>
            <div className="piano-viewport" ref={viewport}>
                <div
                    className="piano-sheet"
                    style={{ width: width + KEY, height: 60 * ROW + HEADER }}
                >
                    <div
                        className="piano-ruler"
                        style={{ width: width + KEY, height: HEADER }}
                    >
                        <span className="piano-corner">音程</span>
                        {Array.from({ length: (last - first) / 4 }, (_, i) => (
                            <span
                                key={i}
                                style={{
                                    left: KEY + i * 4 * step,
                                    width: 4 * step,
                                }}
                            >
                                {i % 4 === 0
                                    ? `${first / 16 + Math.floor(i / 4) + 1}小節`
                                    : `${(i % 4) + 1}`}
                            </span>
                        ))}
                    </div>
                    <div className="piano-keys" style={{ width: KEY }}>
                        {Array.from({ length: 60 }, (_, i) => {
                            const p = 60 - i;
                            return (
                                <div
                                    key={p}
                                    className={
                                        noteName(p).includes("♯")
                                            ? "black"
                                            : "white"
                                    }
                                    style={{ height: ROW }}
                                >
                                    {noteName(p)}
                                </div>
                            );
                        })}
                    </div>
                    <div
                        ref={grid}
                        className={`piano-grid voice-${voice}`}
                        aria-label="ピアノロール音符領域"
                        role="application"
                        tabIndex={0}
                        style={
                            {
                                left: KEY,
                                top: HEADER,
                                width,
                                height: 60 * ROW,
                                "--piano-step": `${step}px`,
                            } as React.CSSProperties
                        }
                        onPointerDown={(e) => begin(e, null)}
                        onPointerMove={move}
                        onPointerUp={finish}
                        onPointerCancel={cancel}
                        onLostPointerCapture={cancel}
                        onKeyDown={(e) => {
                            if (disabled) return;
                            if (e.key === "Escape") {
                                e.preventDefault();
                                cancel();
                                return;
                            }
                            if (!selected || e.ctrlKey || e.metaKey || e.altKey)
                                return;
                            if (["Delete", "Backspace"].includes(e.key)) {
                                e.preventDefault();
                                onEdit(voice, selected.start, null);
                            }
                            if (
                                [
                                    "ArrowLeft",
                                    "ArrowRight",
                                    "ArrowUp",
                                    "ArrowDown",
                                ].includes(e.key)
                            ) {
                                e.preventDefault();
                                const n = { ...selected },
                                    delta =
                                        e.key === "ArrowLeft" ||
                                        e.key === "ArrowDown"
                                            ? -1
                                            : 1;
                                if (
                                    e.key === "ArrowUp" ||
                                    e.key === "ArrowDown"
                                )
                                    n.pitch = clamp(
                                        n.pitch + delta * (e.shiftKey ? 12 : 1),
                                        1,
                                        60,
                                    );
                                else if (e.shiftKey)
                                    n.length = clamp(
                                        n.length + delta,
                                        1,
                                        total - n.start,
                                    );
                                else
                                    n.start = clamp(
                                        n.start + delta,
                                        0,
                                        total - n.length,
                                    );
                                onEdit(voice, selected.start, n);
                            }
                        }}
                    >
                        {Array.from({ length: 60 }, (_, i) => (
                            <div
                                key={i}
                                className={`piano-row ${noteName(60 - i).includes("♯") ? "black" : ""}`}
                                style={{ top: i * ROW, height: ROW }}
                            />
                        ))}
                        {[
                            ...notes.map((ns, v) =>
                                v !== voice
                                    ? ns
                                          .filter(visible)
                                          .map((n) => (
                                              <div
                                                  key={`${v}:${n.start}`}
                                                  className={`piano-note ghost voice-${v}`}
                                                  style={style(n)}
                                              />
                                          ))
                                    : [],
                            ),
                            notes[voice].filter(visible).map((n) => (
                                <div
                                    key={n.start}
                                    className={`piano-note voice-${voice} ${selected?.start === n.start ? "selected" : ""} ${preview?.original?.start === n.start ? "dragging" : ""}`}
                                    style={style(n)}
                                    data-start={n.start}
                                    data-pitch={n.pitch}
                                    data-length={n.length}
                                    role="button"
                                    aria-label={`${Math.floor(n.start / 16) + 1}小節 ${(n.start % 16) + 1}番 ${noteName(n.pitch)} 長さ${n.length}`}
                                    title={`${noteName(n.pitch)} / ${n.length}ステップ / 音量${voice === 2 ? ({ 32: 100, 64: 50, 96: 25 }[n.volume] ?? 0) + "%" : n.volume >> 4}`}
                                    onPointerDown={(e) => begin(e, n)}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        if (!disabled)
                                            onEdit(voice, n.start, null);
                                    }}
                                >
                                    {n.length * step >= 32 && (
                                        <span>{noteName(n.pitch)}</span>
                                    )}
                                    {n.start + n.length <= last && (
                                        <span
                                            className="piano-resize"
                                            aria-label="音符の右端"
                                            onPointerDown={(e) =>
                                                begin(e, n, true)
                                            }
                                        />
                                    )}
                                </div>
                            )),
                        ]}
                        {preview && visible(preview.next) && (
                            <div
                                className={`piano-note preview voice-${voice}`}
                                style={style(preview.next)}
                            />
                        )}
                        {playRow >= first && playRow < last && (
                            <div
                                className="piano-playhead"
                                style={{ left: (playRow - first) * step }}
                            />
                        )}
                    </div>
                </div>
            </div>
            <div className="piano-legend">
                {names.map((n, i) => (
                    <span key={i} className={`voice-${i}`}>
                        {n}
                        {i === voice ? "（編集）" : "（参照）"}
                    </span>
                ))}
                <span>
                    {preview
                        ? `${noteName(preview.next.pitch)} · ${preview.next.length}ステップ`
                        : selected
                          ? `${noteName(selected.pitch)} · ${selected.length}ステップ`
                          : "16分音符単位"}
                </span>
            </div>
        </section>
    );
}
