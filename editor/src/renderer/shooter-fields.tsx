import React from "react";
import { type Game, type Stage, uid } from "../shared/model";
import { Field, Form, Select } from "./fields";

export function PowerUpFields({
    game,
    onChange,
}: {
    game: Game;
    onChange: (player: Game["player"]) => void;
}) {
    const player = game.player,
        power = player.powerUps;
    const change = (next: NonNullable<typeof power>) =>
        onChange({ ...player, powerUps: next });
    const rules = [
        { id: "down", name: "1段階下げる" },
        { id: "reset", name: "初期段階に戻す" },
        { id: "keep", name: "維持する" },
    ];
    return (
        <details open className="powerup-fields">
            <summary>パワーアップ段階</summary>
            <label className="check">
                <input
                    aria-label="パワーアップ段階を有効にする"
                    type="checkbox"
                    checked={!!power}
                    onChange={(e) => {
                        if (e.target.checked)
                            change({
                                shotWeapons: [player.weapon],
                                speedLevels: [player.speed],
                                shotOnMiss: "down",
                                speedOnMiss: "keep",
                            });
                        else {
                            const next = { ...player };
                            delete next.powerUps;
                            onChange(next);
                        }
                    }}
                />
                パワーアップ段階を有効にする
            </label>
            {power && (
                <>
                    <p className="hint">
                        先頭が初期段階です。取得効果の加算量だけ段階を進め、最終段階で止まります。
                    </p>
                    {power.shotWeapons.map((weapon, i) => (
                        <div className="row" key={i}>
                            <Field label={`ショット段階 ${i + 1}`}>
                                <Select
                                    value={weapon}
                                    options={game.patterns}
                                    onChange={(n) =>
                                        change({
                                            ...power,
                                            shotWeapons: power.shotWeapons.map(
                                                (v, j) => (j === i ? n : v),
                                            ),
                                        })
                                    }
                                />
                            </Field>
                            <button
                                disabled={power.shotWeapons.length <= 1}
                                aria-label={`ショット段階 ${i + 1} を削除`}
                                onClick={() =>
                                    change({
                                        ...power,
                                        shotWeapons: power.shotWeapons.filter(
                                            (_, j) => j !== i,
                                        ),
                                    })
                                }
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    <button
                        disabled={power.shotWeapons.length >= 8}
                        onClick={() =>
                            change({
                                ...power,
                                shotWeapons: [
                                    ...power.shotWeapons,
                                    power.shotWeapons.at(-1) ?? player.weapon,
                                ],
                            })
                        }
                    >
                        ＋ ショット段階を追加
                    </button>
                    {power.speedLevels.map((speed, i) => (
                        <div className="row" key={i}>
                            <Field label={`速度段階 ${i + 1}`}>
                                <input
                                    aria-label={`速度段階 ${i + 1}`}
                                    type="number"
                                    min={0.0625}
                                    max={8}
                                    step={0.0625}
                                    value={speed}
                                    onChange={(e) =>
                                        change({
                                            ...power,
                                            speedLevels: power.speedLevels.map(
                                                (v, j) =>
                                                    j === i
                                                        ? Number(e.target.value)
                                                        : v,
                                            ),
                                        })
                                    }
                                />
                            </Field>
                            <button
                                disabled={power.speedLevels.length <= 1}
                                aria-label={`速度段階 ${i + 1} を削除`}
                                onClick={() =>
                                    change({
                                        ...power,
                                        speedLevels: power.speedLevels.filter(
                                            (_, j) => j !== i,
                                        ),
                                    })
                                }
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    <button
                        disabled={power.speedLevels.length >= 8}
                        onClick={() =>
                            change({
                                ...power,
                                speedLevels: [
                                    ...power.speedLevels,
                                    Math.min(
                                        8,
                                        (power.speedLevels.at(-1) ??
                                            player.speed) + 0.5,
                                    ),
                                ],
                            })
                        }
                    >
                        ＋ 速度段階を追加
                    </button>
                    <Field label="ミス時のショット">
                        <Select
                            value={power.shotOnMiss}
                            options={rules}
                            onChange={(n) =>
                                change({
                                    ...power,
                                    shotOnMiss: n as typeof power.shotOnMiss,
                                })
                            }
                        />
                    </Field>
                    <Field label="ミス時の速度">
                        <Select
                            value={power.speedOnMiss}
                            options={rules}
                            onChange={(n) =>
                                change({
                                    ...power,
                                    speedOnMiss: n as typeof power.speedOnMiss,
                                })
                            }
                        />
                    </Field>
                </>
            )}
        </details>
    );
}

export function DestructibleFields({
    game,
    stage,
    onChange,
}: {
    game: Game;
    stage: Stage;
    onChange: (stage: Stage) => void;
}) {
    const data = stage.destructibles ?? { types: [], objects: [] };
    return (
        <details open className="destructible-fields">
            <summary>破壊できる背景（16×16）</summary>
            <p className="hint">
                種類を登録して、マップの「破壊BG」で配置します。タイル順は左上・右上・左下・右下です。
            </p>
            {data.types.map((type, i) => (
                <details open key={type.id}>
                    <summary>
                        {type.name}{" "}
                        <small>
                            {
                                data.objects.filter((o) => o.type === type.id)
                                    .length
                            }
                            個
                        </small>
                    </summary>
                    <Form
                        value={{ dropItem: "", ...type }}
                        omit={["tiles"]}
                        context="destructible"
                        game={game}
                        onChange={(next) =>
                            onChange({
                                ...stage,
                                destructibles: {
                                    ...data,
                                    types: data.types.map((v, j) =>
                                        j === i ? next : v,
                                    ),
                                },
                            })
                        }
                    />
                    <div className="stamp-tile-fields">
                        {type.tiles.map((tile, n) => (
                            <Field
                                key={n}
                                label={
                                    [
                                        "左上タイル",
                                        "右上タイル",
                                        "左下タイル",
                                        "右下タイル",
                                    ][n]
                                }
                            >
                                <input
                                    type="number"
                                    min={0}
                                    aria-label={`${type.name} ${["左上タイル", "右上タイル", "左下タイル", "右下タイル"][n]}`}
                                    value={tile}
                                    onChange={(e) =>
                                        onChange({
                                            ...stage,
                                            destructibles: {
                                                ...data,
                                                types: data.types.map((v, j) =>
                                                    j === i
                                                        ? {
                                                              ...v,
                                                              tiles: v.tiles.map(
                                                                  (t, k) =>
                                                                      k === n
                                                                          ? Number(
                                                                                e
                                                                                    .target
                                                                                    .value,
                                                                            )
                                                                          : t,
                                                              ) as typeof type.tiles,
                                                          }
                                                        : v,
                                                ),
                                            },
                                        })
                                    }
                                />
                            </Field>
                        ))}
                    </div>
                    <button
                        onClick={() =>
                            onChange({
                                ...stage,
                                destructibles: {
                                    types: data.types.filter(
                                        (t) => t.id !== type.id,
                                    ),
                                    objects: data.objects.filter(
                                        (o) => o.type !== type.id,
                                    ),
                                },
                            })
                        }
                    >
                        この種類と配置を削除
                    </button>
                </details>
            ))}
            <button
                disabled={data.types.length >= 32}
                onClick={() =>
                    onChange({
                        ...stage,
                        destructibles: {
                            ...data,
                            types: [
                                ...data.types,
                                {
                                    id: uid("destructible"),
                                    name: "新しい破壊BG",
                                    tiles: [0, 0, 0, 0],
                                    hp: 1,
                                    score: 10,
                                    solid: false,
                                    dropItem: "",
                                },
                            ],
                        },
                    })
                }
            >
                ＋ 破壊BGの種類を追加
            </button>
        </details>
    );
}
