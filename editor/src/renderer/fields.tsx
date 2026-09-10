import React from "react";
import { type Game, clone, uid } from "../shared/model";
import { MusicField, SoundtrackFields } from "./music-field";

const labels: Record<string, string> = {
    name: "名前",
    title: "ゲームタイトル",
    mode: "ゲームモード",
    seed: "乱数シード",
    startStage: "開始ステージ",
    clearBonus: "クリア加点",
    ending: "エンディング", slides: "スライド", seconds: "自動送り秒数", presentation: "会話とクリア演出", enabled: "有効", dialogueBackground: "会話の立ち絵背景",
    clearBackground: "クリアの立ち絵背景", rightPalette: "右側の立ち絵パレット",
    dialogue: "会話ページ", speaker: "話者（18文字まで）", line1: "セリフ1行目（18文字まで）", line2: "セリフ2行目（18文字まで）",
    clearEnabled: "クリア計算画面を表示", baseBonus: "ステージ基本点", lifeBonus: "残機1機あたり", noMissBonus: "ノーミス加点",
    parallax: "視差タイルアニメーション", firstTile: "開始タイル番号", divisor: "奥行き速度の除数（2〜8）",
    asset: "スプライト",
    weapon: "自機の弾幕",
    focusWeapon: "Bボタンの集中ショット",
    focusSpeed: "集中ショット中の速度 px / frame",
    scrollDown: "背景を上から下へ流す",
    requireBoss: "時間内のボス撃破を必須にする",
    dmgPalette: "DMG階調レジスター（0〜255）",
    speed: "速度 px / frame",
    lives: "残機",
    respawnDelay: "復帰待ち（ゲームフレーム）",
    timeLimit: "制限時間を有効にする",
    bossCelebration: "ボス撃破の連続爆発とファンファーレ",
    stageFade: "ステージ切替をフェード",
    invulnerability: "無敵時間（frame）",
    x: "X",
    y: "Y",
    w: "幅",
    h: "高さ",
    width: "画像幅",
    height: "画像高さ",
    palette: "パレット",
    origin: "原点",
    hitbox: "当たり判定",
    emitters: "発射位置",
    duration: "表示時間（frame）",
    hp: "耐久値",
    score: "撃破得点",
    motion: "移動",
    pattern: "弾幕",
    attacks: "追加弾幕レイヤー（独立した間隔・遅延）",
    provenance: "出典情報",
    kind: "種類",
    vx: "横速度 px / frame",
    vy: "縦速度 px / frame",
    amplitude: "横振幅 px",
    period: "周期（frame）",
    loop: "経路を繰り返す",
    points: "経路ポイント",
    frame: "時刻（frame）",
    angle: "基準角度（上=0 / 下=180）",
    count: "数",
    spread: "広がり（度）",
    interval: "間隔（frame）",
    rotation: "回転量（度）",
    repeats: "発射回数（0=無限）",
    delay: "発射開始（frame）",
    lifetime: "弾の寿命（frame）",
    damage: "ダメージ",
    phases: "攻撃フェーズ",
    battle: "ボス戦の表示", maxBullets: "BG敵弾の上限（1〜128）",
    intro: "フェーズ開始カットイン", spellName: "弾幕名（36文字まで）", clearWaitSeconds: "集計完了後の待ち時間（秒）",
    until: "次フェーズへの条件",
    threshold: "条件値（frame / HP）",
    tileset: "タイルセット",
    scrollSpeed: "スクロール px / frame",
    loopMap: "マップを繰り返す",
    clearOnBoss: "ボス撃破でステージクリア",
    background: "背景画像",
    dock: "HUD位置",
    text: "表示文字（英数字・かな）",
    binding: "動的表示",
    digits: "数値の桁数",
    rows: "HUD行数",
    ref: "出現キャラクター",
    spacing: "編隊間隔 X",
    value: "変更後スクロール速度",
    author: "作者",
    license: "ライセンス",
    source: "出典",
    colors: "CGB 4色パレット",
    effects: "エフェクト",
    explosion: "爆発スプライト",
};
const names: Record<string, string> = {
    caravan: "キャラバン",
    campaign: "通常・ステージ順",
    straight: "直線",
    bounce: "往復",
    wave: "波形",
    path: "経路",
    aimed: "狙い撃ち",
    fan: "扇状",
    ring: "円形",
    spiral: "回転連射",
    enemy: "敵",
    boss: "ボス",
    scroll: "スクロール変更",
    end: "終了",
    time: "時間",
    hp: "残HP",
    top: "上端",
    bottom: "下端",
    none: "なし",
    score: "スコア",
    lives: "残機",
    highscores: "スコア上位5件",
    sprite: "スプライト",
    tileset: "タイルセット",
    screen: "画面背景",
};
export function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <label className="field">
            <span>{label}</span>
            {children}
        </label>
    );
}
export function Select({
    value,
    options,
    onChange,
}: {
    value: string | number;
    options: { id: string | number; name: string }[];
    onChange: (value: string) => void;
}) {
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)}>
            {options.map((x) => (
                <option key={x.id} value={x.id}>
                    {x.name}
                </option>
            ))}
        </select>
    );
}
export function Form({
    value,
    onChange,
    game,
    omit = [],
    context = "",
}: {
    value: any;
    onChange: (value: any) => void;
    game: Game;
    omit?: string[];
    context?: string;
}) {
    const edit = (key: string, next: any) =>
        onChange({ ...value, [key]: next });
    return (
        <div className="form">
            {Object.entries(
                context === "player" ? { focusWeapon: "", focusSpeed: value.speed, respawnDelay: 0, ...value }
                : context === "stage" ? { requireBoss: false, scrollDown: false, music: 0, bossMusic: 0, presentation: { enabled: false, dialogueBackground: "", clearBackground: "", rightPalette: 0, dialogue: [], clearEnabled: false, baseBonus: game.clearBonus, lifeBonus: 200, noMissBonus: 1000 }, parallax: { enabled: false, firstTile: 0, width: 4, height: 2, divisor: 2 }, ...value }
                : "phases" in value ? {battle: {background: "stage", maxBullets: 128}, ...value}
                : context === "phase" ? {intro: {enabled: false, background: "", spellName: value.name, seconds: 3}, ...value}
                : context === "presentation" ? {clearWaitSeconds: 2, ...value}
                : value.id === "hud" ? { rows: 2, ...value }
                : "binding" in value ? { digits: 5, ...value }
                : value.schemaVersion === 1 ? { ending: { seconds: 6, slides: [] }, stageFade: true, timeLimit: true, bossCelebration: false, music: { title: 0, boss: 0, clear: 0, gameover: 0 }, dmgPalette: 228, ...value }
                : value
            )
                .filter(
                    ([key]) =>
                        ![
                            "id",
                            "pixels",
                            "frames",
                            "tiles",
                            "walls",
                            "events",
                            "items",
                            "image",
                            "stageOrder",
                            "schemaVersion",
                        ].includes(key) && !omit.includes(key),
                )
                .map(([key, v]: [string, any]) => {
                    if (key === "bossMusic") return <MusicField key={key} label="専用ボスBGM（なし＝共通ボス曲）" value={v} onChange={(n) => edit(key, n)} />;
                    if (key === "music") return typeof v === "number"
                        ? <MusicField key={key} value={v} onChange={(n) => edit(key, n)} />
                        : <SoundtrackFields key={key} value={v} onChange={(n) => edit(key, n)} />;
                    let choices:
                        { id: string | number; name: string }[] | undefined;
                    if (
                        [
                            "asset",
                            "explosion",
                            "weapon",
                            "focusWeapon",
                            "pattern",
                            "tileset",
                            "background",
                            "dialogueBackground",
                            "clearBackground",
                            "startStage",
                            "ref",
                        ].includes(key)
                    ) {
                        choices =
                            key === "weapon" || key === "focusWeapon" || key === "pattern"
                                ? game.patterns
                                : key === "startStage"
                                  ? game.stages
                                  : key === "ref"
                                    ? value.kind === "boss"
                                        ? game.bosses
                                        : game.enemies
                                    : game.assets.filter(
                                          (a) =>
                                              a.kind ===
                                              (key === "tileset"
                                                  ? "tileset"
                                                  : ["background", "dialogueBackground", "clearBackground"].includes(key)
                                                    ? "screen"
                                                    : "sprite"),
                                      );
                        if (["pattern", "background", "dialogueBackground", "clearBackground", "focusWeapon"].includes(key))
                            choices = [{ id: "", name: "なし" }, ...choices];
                    }
                    if (key === "background" && context === "battle") choices = [
                        {id: "stage", name: "ステージ背景を継続"}, {id: "blank", name: "背景なし・スプライト弾"}, {id: "bg-bullets", name: "背景なし・BG弾幕（単色2×2・2ドット刻み）"}
                    ];
                    if (key === "palette" || key === "rightPalette")
                        choices = game.palettes.map((p, i) => ({
                            id: i,
                            name: `${i} · ${p.name}`,
                        }));
                    const enums: Record<string, string[]> = {
                        mode: ["caravan", "campaign"],
                        until: ["time", "hp"],
                        dock: ["top", "bottom"],
                        binding: [
                            "none",
                            "score",
                            "lives",
                            "time",
                            "boss",
                            "highscores",
                        ],
                    };
                    if (key === "kind")
                        enums.kind =
                            context === "motion"
                                ? ["straight", "bounce", "wave", "path"]
                                : context === "event"
                                  ? ["enemy", "boss", "scroll", "end"]
                                  : context === "asset"
                                    ? ["sprite", "tileset", "screen"]
                                    : [
                                          "straight",
                                          "aimed",
                                          "fan",
                                          "ring",
                                          "spiral",
                                      ];
                    if (enums[key])
                        choices = enums[key].map((id) => ({
                            id,
                            name: names[id] ?? id,
                        }));
                    const label =
                        key === "seconds" && context === "intro" ? "表示時間（秒）" :
                        key === "background" && context === "battle" ? "描画方式" :
                        key === "duration" && context === "stage"
                            ? "制限時間（秒）"
                            : context === "stage" && key === "width"
                              ? "マップ横幅（タイル）"
                              : context === "stage" && key === "height"
                                ? "マップ高さ（タイル）"
                                : (labels[key] ?? key);
                    if (choices)
                        return (
                            <Field key={key} label={label}>
                                <Select
                                    value={v}
                                    options={choices}
                                    onChange={(n) =>
                                        edit(
                                            key,
                                            (key === "palette" || key === "rightPalette") ? Number(n) : n,
                                        )
                                    }
                                />
                            </Field>
                        );
                    if (typeof v === "boolean")
                        return (
                            <label className="check" key={key}>
                                <input
                                    type="checkbox"
                                    checked={v}
                                    onChange={(e) =>
                                        edit(key, e.target.checked)
                                    }
                                />
                                {label}
                            </label>
                        );
                    if (typeof v === "number" || typeof v === "string")
                        return (
                            <Field label={label} key={key}>
                                <input
                                    aria-label={label}
                                    type={
                                        typeof v === "number"
                                            ? "number"
                                            : "text"
                                    }
                                    step={
                                        [
                                            "speed",
                                            "focusSpeed",
                                            "vx",
                                            "vy",
                                            "scrollSpeed",
                                            "value",
                                        ].includes(key)
                                            ? 0.0625
                                            : 1
                                    }
                                    value={v}
                                    onChange={(e) =>
                                        edit(
                                            key,
                                            typeof v === "number"
                                                ? Number(e.target.value)
                                                : e.target.value,
                                        )
                                    }
                                />
                            </Field>
                        );
                    if (Array.isArray(v))
                        return (
                            <details open key={key}>
                                <summary>
                                    {label} <small>{v.length}</small>
                                </summary>
                                {v.map((item, i) => (
                                    <div
                                        className="array-item"
                                        key={item.id ?? i}
                                    >
                                        <div className="row">
                                            <span>{i + 1}</span>
                                            <button
                                                onClick={() => {
                                                    const arr = clone(v);
                                                    if (i) {
                                                        [arr[i - 1], arr[i]] = [
                                                            arr[i],
                                                            arr[i - 1],
                                                        ];
                                                        edit(key, arr);
                                                    }
                                                }}
                                            >
                                                ↑
                                            </button>
                                            <button
                                                onClick={() =>
                                                    edit(
                                                        key,
                                                        v.filter(
                                                            (
                                                                _: any,
                                                                n: number,
                                                            ) => n !== i,
                                                        ),
                                                    )
                                                }
                                            >
                                                削除
                                            </button>
                                        </div>
                                        {typeof item === "object" ? (
                                            <Form
                                                value={item}
                                                game={game}
                                                context={
                                                    key === "points"
                                                        ? "point"
                                                        : key === "phases"
                                                          ? "phase"
                                                          : key
                                                }
                                                onChange={(n) =>
                                                    edit(
                                                        key,
                                                        v.map(
                                                            (
                                                                x: any,
                                                                j: number,
                                                            ) =>
                                                                j === i ? n : x,
                                                        ),
                                                    )
                                                }
                                            />
                                        ) : (
                                            <input
                                                type={
                                                    key === "colors"
                                                        ? "color"
                                                        : "text"
                                                }
                                                value={item}
                                                onChange={(e) =>
                                                    edit(
                                                        key,
                                                        v.map(
                                                            (
                                                                x: any,
                                                                j: number,
                                                            ) =>
                                                                j === i
                                                                    ? e.target
                                                                          .value
                                                                    : x,
                                                        ),
                                                    )
                                                }
                                            />
                                        )}
                                    </div>
                                ))}
                                <button
                                    onClick={() => {
                                        const last = v.length
                                            ? clone(v[v.length - 1])
                                            : key === "slides" ? {id: uid("slide"), background: game.assets.find(a => a.kind === "screen")?.id ?? ""}
                                            : key === "dialogue" ? { id: uid("page"), speaker: "", line1: "", line2: "" }
                                            : key === "emitters"
                                              ? { x: 0, y: 0 }
                                              : key === "points"
                                                ? { x: 0, y: 0, frame: 0 }
                                                : key === "attacks"
                                                  ? {
                                                        id: uid("attack"),
                                                        pattern:
                                                            game.patterns[0].id,
                                                    }
                                                  : {};
                                        if (last.id) last.id = uid(key);
                                        if (key === "points") last.frame += 60;
                                        edit(key, [...v, last]);
                                    }}
                                >
                                    ＋ {label}を追加
                                </button>
                            </details>
                        );
                    if (v && typeof v === "object")
                        return (
                            <details open key={key}>
                                <summary>{label}</summary>
                                <Form
                                    value={v}
                                    onChange={(n) => edit(key, n)}
                                    game={game}
                                    context={key}
                                />
                            </details>
                        );
                    return null;
                })}
        </div>
    );
}
