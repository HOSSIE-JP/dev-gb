import { type Game, normalMotion, uid } from "../shared/model";

/** New entities start independently; duplication is a separate explicit action. */
export function createEntity(game: Game, kind: string) {
    const sprite = game.assets.find((a) => a.kind === "sprite")?.id ?? "";
    const motion = normalMotion();
    switch (kind) {
        case "patterns":
            return {
                id: uid("pattern"),
                name: "新しい弾幕",
                asset: sprite,
                kind: "straight",
                speed: 1.5,
                angle: 90,
                count: 1,
                spread: 45,
                interval: 60,
                rotation: 0,
                repeats: 1,
                delay: 0,
                lifetime: 180,
                damage: 1,
            };
        case "enemies":
            return {
                id: uid("enemy"),
                name: "新しい敵",
                asset: sprite,
                hp: 3,
                score: 100,
                motion,
                pattern: game.patterns[0]?.id ?? "",
                attacks: [],
            };
        case "bosses":
            return {
                id: uid("boss"),
                name: "新しいボス",
                asset: sprite,
                hp: 100,
                score: 10000,
                motion,
                pattern: game.patterns[0]?.id ?? "",
                attacks: [],
                phases: [
                    {
                        id: uid("phase"),
                        name: "フェーズ 1",
                        until: "time",
                        threshold: 600,
                        pattern: game.patterns[0]?.id ?? "",
                        motion: normalMotion(),
                        attacks: [],
                    },
                ],
            };
        case "stages":
            return {
                id: uid("stage"),
                name: "新しいステージ",
                tileset:
                    game.assets.find((a) => a.kind === "tileset")?.id ?? "",
                width: 20,
                height: 36,
                tiles: Array(720).fill(0),
                walls: Array(720).fill(0),
                scrollSpeed: 0.5,
                loopMap: true,
                duration: 120,
                clearOnBoss: false,
                requireBoss: false,
                music: 0,
                events: [],
            };
        case "palettes":
            return {
                id: uid("palette"),
                name: "新しいパレット",
                colors: ["#e8f0d8", "#a8b890", "#586848", "#182818"],
            };
        default:
            return null;
    }
}
