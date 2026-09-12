import { type Game, type Stage, type Point, q4, hudHeight } from "./model";

export const horizontalStage = (stage: Stage) => stage.scrollAxis === "horizontal";
export const stageSpan = (stage: Stage) => (horizontalStage(stage) ? stage.width : stage.height) * 8;
export const initialCamera = (game: Game, stage: Stage) => !horizontalStage(stage) && stage.scrollDown ? q4(stageSpan(stage) - (144 - hudHeight(game))) : 0;
export function advanceCamera(game: Game, stage: Stage, camera: number, speed: number) {
    const span = q4(stageSpan(stage)), next = camera + (!horizontalStage(stage) && stage.scrollDown ? -speed : speed);
    // Do not truncate to uint16 before wrapping: a 512-tile map spans 65536 Q4 units.
    return stage.loopMap ? ((next % span) + span) % span : Math.max(0, Math.min(next, span - q4(horizontalStage(stage) ? 160 : 144 - hudHeight(game))));
}
/** Camera at the beginning of a playable tick, including prior scroll events. */
export function cameraAtFrame(game: Game, stage: Stage, frame: number) {
    let camera = initialCamera(game, stage), speed = q4(stage.scrollSpeed);
    const changes = new Map(stage.events.filter(e => e.kind === "scroll").map(e => [e.frame, q4(e.value)]));
    for (let tick = 0; tick < Math.max(0, Math.min(65535, frame)); tick++) {
        camera = advanceCamera(game, stage, camera, speed);
        speed = changes.get(tick) ?? speed;
    }
    return camera;
}
/** Spawns are processed after this tick's camera movement, before its speed event affects the next tick. */
export const cameraAtEventFrame = (game: Game, stage: Stage, frame: number) => cameraAtFrame(game, stage, frame + 1);
export function screenToWorld(game: Game, stage: Stage, camera: number, x: number, y: number): Point {
    const top = game.screens.find(s => s.id === "hud")?.dock === "top" ? hudHeight(game) : 0;
    return { x: x + (horizontalStage(stage) ? Math.floor(camera / 16) : 0), y: y - top + (horizontalStage(stage) ? 0 : Math.floor(camera / 16)) };
}
export function worldToScreen(game: Game, stage: Stage, camera: number, x: number, y: number): Point {
    const zero = screenToWorld(game, stage, camera, 0, 0);
    return { x: x - zero.x, y: y - zero.y };
}
export function stageCell(stage: Stage, x: number, y: number) {
    let tx = Math.floor(x / 8), ty = Math.floor(y / 8);
    if (stage.loopMap) {
        if (horizontalStage(stage)) tx = ((tx % stage.width) + stage.width) % stage.width;
        else ty = ((ty % stage.height) + stage.height) % stage.height;
    }
    return tx < 0 || ty < 0 || tx >= stage.width || ty >= stage.height ? -1 : ty * stage.width + tx;
}
export function destructibleIndex(stage: Stage) {
    return new Map((stage.destructibles?.objects ?? []).map((o, i) => [Math.floor(o.y / 2) * Math.ceil(stage.width / 2) + Math.floor(o.x / 2), i]));
}
export function resizeStage(stage: Stage, width: number, height: number): Stage {
    const horizontal = horizontalStage(stage);
    width = horizontal ? Math.max(20, Math.min(512, Math.trunc(width))) : 20;
    height = horizontal ? 18 : Math.max(18, Math.min(512, Math.trunc(height)));
    const reshape = (source: number[]) => Array.from({length: width * height}, (_, i) => {
        const x = i % width, y = Math.floor(i / width);
        return x < stage.width && y < stage.height ? source[y * stage.width + x] ?? 0 : 0;
    });
    return {...stage, width, height, tiles: reshape(stage.tiles), walls: reshape(stage.walls), ...(stage.destructibles ? {destructibles: {...stage.destructibles, objects: stage.destructibles.objects.filter(o => o.x + 2 <= width && o.y + 2 <= height)}} : {})};
}
