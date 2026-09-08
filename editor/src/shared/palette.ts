import { type Game, DMG_COLORS } from "./model";

/** Resolve each source pixel index through the Game Boy BGP/OBP register.
 * Sprite transparency is still determined by source index zero by callers. */
export function dmgColors(game: Pick<Game, "dmgPalette">): string[] {
    const mapping = game.dmgPalette ?? 0xe4;
    return [0, 1, 2, 3].map((index) => DMG_COLORS[(mapping >> (index * 2)) & 3]);
}
