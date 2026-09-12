import type {Game, Presentation, Stage} from "./model";

/** Shared epilogue pictures can be reused, with a route keyed by stable player ID. */
export function resolveEnding(game: Game, character = 0) {
    const id = game.player.characters?.[character - 1]?.id;
    return (id && game.ending?.characterSlides?.find(v => v.character === id)?.slides) || game.ending?.slides || [];
}

/** Base pages belong to the default player. Extra players may override both scenes. */
export function resolvePresentation(game: Game, stage: Stage, character = 0): Presentation | undefined {
    const base = stage.presentation;
    const id = game.player.characters?.[character - 1]?.id;
    const variant = id && base?.characterDialogues?.find(v => v.character === id);
    if (!variant || !base) return base;
    return {...base, enabled: variant.before.enabled, dialogueBackground: variant.before.background,
        dialoguePortrait: variant.before.portrait, dialogue: variant.before.pages, victoryDialogue: variant.after};
}

/** Portrait assets store a replacement left panel in their top-left 80x96 area.
 * Copying the whole panel also erases the previous player's silhouette. */
export function dialoguePixels(game: Game, background: string, portrait?: string): number[] | undefined {
    if (!portrait) return undefined;
    const base = game.assets.find(a => a.id === background), left = game.assets.find(a => a.id === portrait);
    if (!base || !left) return undefined; // Validation reports the missing reference.
    const pixels = [...base.frames[0].pixels];
    for (let y = 0; y < 96; y++) for (let x = 0; x < 80; x++) pixels[y * 160 + x] = left.frames[0].pixels[y * 160 + x];
    return pixels;
}
