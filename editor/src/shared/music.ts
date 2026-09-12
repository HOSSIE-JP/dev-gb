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
    { id: 9, label: "GERONEKO · Tuna Launch" },
    { id: 10, label: "GERONEKO · Candy Orbit" },
    { id: 11, label: "GERONEKO · Mofu Nebula" },
    { id: 12, label: "GERONEKO · Chikuwa Cosmos" },
    { id: 13, label: "GERONEKO · Ninja Dance" },
    { id: 14, label: "GERONEKO · Mofu Friends" },
    { id: 15, label: "GERONEKO · One More Flight" },
    { id: 16, label: "紅魔巡礼 · 朱い夜への巡礼" },
    { id: 17, label: "紅魔巡礼 · 鉄門に舞う花" },
    { id: 18, label: "紅魔巡礼 · 紅蓮の歩法" },
    { id: 19, label: "紅魔巡礼 · 六曜の書塵" },
    { id: 20, label: "紅魔巡礼 · 月の余白" },
    { id: 21, label: "紅魔巡礼 · 秒針の迷廊" },
    { id: 22, label: "紅魔巡礼 · 一瞬の銀" },
    { id: 23, label: "紅魔巡礼 · 胸壁の上の月" },
    { id: 24, label: "紅魔巡礼 · 夜潮の冠" },
    { id: 25, label: "紅魔巡礼 · 灯らぬ七つの窓" },
    { id: 26, label: "紅魔巡礼 · 暁の外の遊戯室" },
    { id: 27, label: "紅魔巡礼 · 夜明けの静かな神社" },
    { id: 28, label: "紅魔巡礼 · 灯へ帰る" },
    { id: 29, label: "紅魔巡礼 · 封印がほどける" },
    {id: 30, label: "紅魔・湖：こおりぼしのさざなみ"},
    {id: 31, label: "紅魔・チルノ：あさつゆのこおりあそび"},
    {id: 32, label: "紅魔・宵闇の森：宵闇の散歩道"},
    {id: 33, label: "紅魔・ルーミア：月を隠すリボン"},
    {id: 34, label: "紅魔巡礼 · おかえり、夜明けの空（エンディング）"},
] as const;

export type MusicTrack = (typeof MUSIC_TRACKS)[number]["id"];
export type Soundtrack = {
    title: number;
    boss: number;
    clear: number;
    gameover: number;
    victory?: number;
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
