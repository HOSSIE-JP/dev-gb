import type {Game, Presentation, Stage, Screen} from "./model";

/** The portrait remains above the reserved three-row continue menu. */
export function gameOverPresentation(game: Game, character = 0) {
    const player = character ? game.player.characters![character - 1] : game.player;
    const base = game.screens.find(s => s.id === "gameover")!;
    const background = player.gameoverBackground || base.background;
    const asset = game.assets.find(a => a.id === background);
    let screen: Screen = {...base, background};
    let pixels: number[] | undefined;
    if (game.continue?.enabled) {
        pixels = asset ? [...asset.frames[0].pixels] : Array(160 * 144).fill(0);
        pixels.fill(0, 160 * 104);
        const palette = asset?.palette ?? base.palette;
        screen = {...screen, palette, items:[...base.items.filter(i => i.y < 13 && i.binding !== "highscores"),
            {id:"continue-score",text:"SCORE ",x:4,y:13,palette,binding:"score",digits:5},
            {id:"continue-time",text:"CONTINUE? ",x:4,y:15,palette,binding:"time",digits:2},
            {id:"continue-input",text:"A:つづける B:おわる",x:2,y:17,palette,binding:"none"}]};
    }
    return {screen, pixels};
}

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
