/** Advance one display-frame budget, also when the CGB CPU uses double speed.
 * Keep a bounded cycle budget so a ROM with its LCD disabled cannot hang the UI.
 */
export function clockRomFrame(gb: { multiplier(): number; clocks_cycles(cycles: number): bigint }) {
    return gb.clocks_cycles(70224 * gb.multiplier());
}

/** Ordinary playback never advances unseen frames after a late host callback.
 * Faster-than-real-time debug playback is the explicit opt-in exception. */
export function playbackBudget(accumulated: number, speed: number) {
    const interval = 1000 / 59.7275;
    return {
        frames: Math.min(Math.floor(accumulated / interval), Math.max(1, Math.ceil(speed))),
        remainder: accumulated % interval,
    };
}
