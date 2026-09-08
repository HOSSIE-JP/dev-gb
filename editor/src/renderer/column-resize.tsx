import React, { useEffect, useRef, useState } from "react";
import { readPreference, writePreference } from "./workspace";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export function useColumns(inspectorVisible: boolean) {
    const ref = useRef<HTMLDivElement>(null);
    const [widths, setWidths] = useState(() => {
        const stored = readPreference("columns", [220, 320]);
        return Array.isArray(stored) && stored.length === 2 && stored.every(n => typeof n === "number" && Number.isFinite(n))
            ? [clamp(stored[0], 160, 420), clamp(stored[1], 240, 600)] : [220, 320];
    });
    const [available, setAvailable] = useState(window.innerWidth);
    useEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
        observer.observe(element);
        return () => observer.disconnect();
    });
    useEffect(() => writePreference("columns", widths), [widths]);
    // Reserve the editing canvas first; shrink side panes when the window narrows.
    const budget = Math.max(400, available - 360 - (inspectorVisible ? 12 : 6));
    let left = Math.min(widths[0], budget - (inspectorVisible ? 240 : 0));
    let right = inspectorVisible ? Math.min(widths[1], budget - left) : 0;
    const resize = (index: number, value: number) => setWidths(old => {
        const next = [...old];
        next[index] = clamp(value, index === 0 ? 160 : 240,
            Math.min(index === 0 ? 420 : 600, budget - (index === 0 ? right : left)));
        return next;
    });
    const separator = (index: number) => <div
        className="column-resizer" role="separator" tabIndex={0}
        aria-label={index === 0 ? "エクスプローラーの幅" : "インスペクターの幅"}
        aria-orientation="vertical" aria-valuenow={Math.round(index === 0 ? left : right)}
        aria-valuemin={index === 0 ? 160 : 240} aria-valuemax={index === 0 ? 420 : 600}
        title="ドラッグ・左右キーで幅を変更／ダブルクリックで初期幅"
        onDoubleClick={() => setWidths([220, 320])}
        onKeyDown={e => {
            if (!["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) return;
            e.preventDefault();
            if (e.key === "Home") { setWidths([220, 320]); return; }
            resize(index, (index === 0 ? left : right) + (e.key === "ArrowRight" ? 16 : -16) * (index === 0 ? 1 : -1));
        }}
        onPointerDown={e => {
            if (e.button !== 0) return;
            e.preventDefault();
            const element = e.currentTarget, start = e.clientX, initial = index === 0 ? left : right;
            element.setPointerCapture(e.pointerId);
            const move = (event: PointerEvent) => resize(index, initial + (event.clientX - start) * (index === 0 ? 1 : -1));
            const end = () => {
                element.removeEventListener("pointermove", move);
                element.removeEventListener("lostpointercapture", end);
                element.removeEventListener("pointerup", release);
                element.removeEventListener("pointercancel", release);
            };
            const release = (event: PointerEvent) => { if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId); end(); };
            element.addEventListener("pointermove", move);
            element.addEventListener("lostpointercapture", end);
            element.addEventListener("pointerup", release);
            element.addEventListener("pointercancel", release);
        }}
    />;
    return { ref, style: { gridTemplateColumns: inspectorVisible
        ? `${left}px 6px minmax(0, 1fr) 6px ${right}px`
        : `${left}px 6px minmax(0, 1fr)` }, separator };
}
