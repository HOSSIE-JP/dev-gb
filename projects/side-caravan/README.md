# SIDE CARAVAN

ゲームボーイ／ゲームボーイカラー向けのオリジナル横スクロールSTGです。約180秒の道中で軌道施設、戦艦甲板、炉心区画へ進み、最後に3段階の攻撃を持つTRIPLE COREと戦います。時間切れはなく、ボス撃破でクリアします。時間は60回のゲーム更新を1秒とした値で、処理落ち中は実時間が長くなります。

```bat
editor.cmd side-caravan
build.cmd side-caravan -Configuration Debug
build.cmd side-caravan -Configuration Release
run.cmd side-caravan -Configuration Release -Emulator BGB
run.cmd side-caravan -Configuration Release -Emulator Emulicious
```

| 操作 | 動作 |
| --- | --- |
| 十字キー | 自機移動 |
| A長押し | ショットを連射 |
| B | ボムを1個使用。離して押し直すと再使用 |
| START | 開始／ポーズ・再開 |
| タイトルでSELECT | 上位5件のランキング |

Pで通常→2連→3方向→5方向、Sで移動速度が1.5→1.75→2→2.25ピクセル／更新になります。Bはボム＋1、1は1UP、＋は500点。初期3機・ボム2個、最大はそれぞれ9です。ミスするとショットが1段階下がり、速度は維持。60更新後に復帰し、150更新の無敵時間とボム2個で再開します。

背景の281個のパネル・コンテナは自機が通過できます。ショットで壊すと40〜100点となり、補給コンテナからはアイテムも出ます。密集パネルは1画面64個以上。ボムでも画面内を一掃し、通常得点を獲得できます。壊したBGはミスやボム演出後にも戻りません。道中後半へボムを残すか、密集区間で得点に換えるかを選べます。

全敵・ボス・BGと全得点アイテムを取った場合の得点上限は34,320点。スコア上位5件は作品専用のSRAMランキングへ保存します。ROMはMBC5＋8KiB RAM＋バッテリー仕様です。テスト用セーブは配布物へ含めません。

制作データは`assets-src/game.json`と`assets-src/images/*.png`です。新規作品テンプレート、複製、通常の保存・ビルドに対応します。元の4色ピクセル絵と初期配置を作成する手動レシピは`editor/scripts/create-side-caravan.cjs`です。このレシピは既存プロジェクトへの上書きを拒否し、通常の編集・ビルドでは実行されません。

[共通機能の編集方法](../../docs/horizontal-stg.md) / [素材の出典](assets-src/README.md) / [検証報告](../../docs/side-caravan-validation.md)
