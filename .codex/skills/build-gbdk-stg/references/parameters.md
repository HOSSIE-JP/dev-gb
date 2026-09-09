# Prompt → brief

ユーザーは自然文で指定できる。下記JSONを必須にしない。未指定の通常値は仮定を伝えて進める。

例：
> $build-gbdk-stg を使って「ORBIT LANCER」というGB/GBCの縦STGを作ってください。4面、宇宙遺跡、爽快な雑魚編隊と手ごたえのあるボス、残機5、時間制限なし、被弾後1.5秒復帰。A拡散・B集中。まずROMとブラウザー試遊版をください。私が完成と判断したら、箱・ラベル・30秒の宣伝動画まで作ってください。

```json
{
  "id": "orbit-lancer",
  "title": "ORBIT LANCER",
  "template": "nova-spear",
  "stageCount": 4,
  "mode": "campaign",
  "timeLimit": false,
  "lives": 5,
  "respawnFrames": 90,
  "bossCelebration": true,
  "stageFade": true,
  "creative": {
    "theme": "宇宙遺跡",
    "difficulty": "中級、弱い雑魚の連続撃破区間と段階的なボス攻撃",
    "weapons": "A拡散・B集中",
    "art": "白とシアンの機体、太い輪郭、DMGでも見分けられる形",
    "music": "疾走感のあるオリジナルBGMとボス撃破ファンファーレ"
  },
  "release": {
    "boxMm": [100, 125, 22],
    "labelMm": [42, 37],
    "trailerSeconds": 30,
    "approvalRequired": true
  }
}
```

Scaffold helper handles id/title/template/stageCount/mode/timeLimit/lives/respawnFrames/bossCelebration/stageFade. `creative` and `release` remain instructions for the authoring phases, not automatically generated art or video. Preserve the entire brief. When omitted: NOVA SPEAR, 3 stages, campaign, untimed, 5 lives, 90 update respawn, victory effects and fades enabled. For a specifically requested timed caravan, set timeLimit=true and use the user's duration. Do not remove the timer from timed games silently.

Current engine limits: 1–16 stages, 1–9 lives, 0–600 respawn updates. Seconds are game updates / 60 and stretch during slowdown. ID is stable ASCII `[A-Za-z0-9][A-Za-z0-9_-]{0,47}`; do not change it for each build because save identity uses the game name. Title text must pass the repository font validator. Rich Japanese/kanji logos can be authored as bitmap screen art; do not silently pretend unsupported glyphs work. Box title can use a separate full display name.

Other useful prompt parameters: story/motif, palette, boss count/phases, encounter density, score routes, desired stage length, shot styles, BGM mood, control changes, accessibility, physical shell dimensions, paper size, trailer aspect ratio. Consult current model.ts for unsupported requests. Explain and implement an engine extension only when actually needed; do not silently approximate a materially different genre.
