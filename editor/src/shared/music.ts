/** Stable built-in soundtrack IDs shared with engine/caravan/music.h. */
export const MUSIC_TRACKS = [
    { id: 0, label: "なし" },
    { id: 1, label: "NOVA SPEAR · 出撃待機" },
    { id: 2, label: "Orbital Dawn · 軌道戦" },
    { id: 3, label: "Iron Convoy · 機動艦隊" },
    { id: 4, label: "Reactor Run · 中枢突入" },
    { id: 5, label: "Last Vector · ボス戦" },
    { id: 6, label: "Homeward Signal · クリア" },
    { id: 7, label: "Lost Contact · ゲームオーバー" },
    { id: 8, label: "Victory Flare · ボス撃破ファンファーレ" },
] as const;

export type MusicTrack = (typeof MUSIC_TRACKS)[number]["id"];
export type Soundtrack = {
    title: number;
    boss: number;
    clear: number;
    gameover: number;
};

export const SILENT_SOUNDTRACK: Soundtrack = {
    title: 0,
    boss: 0,
    clear: 0,
    gameover: 0,
};

export function validMusicTrack(value: unknown): value is MusicTrack {
    return Number.isInteger(value) && MUSIC_TRACKS.some((track) => track.id === value);
}
