/** Advance one display-frame budget, also when the CGB CPU uses double speed.
 * Keep a bounded cycle budget so a ROM with its LCD disabled cannot hang the UI.
 */
export function clockRomFrame(gb: { multiplier(): number; clocks_cycles(cycles: number): bigint }) {
    return gb.clocks_cycles(70224 * gb.multiplier());
}
