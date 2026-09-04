# STAR CARAVAN

`STAR CARAVAN` は、GBDK-2020 で動くオリジナルの1ステージ縦スクロールSTGです。高速な連射、敵編隊、スコアアタックという古典的なキャラバン形式だけを着想元とし、既存作品のコード、画像、名称、音楽、ステージ構成は使用していません。

1本の `star-caravan.gb` が初代Game Boy（DMG）とGame Boy Color（CGB）の両方で動作します。DMGでは4階調、CGBでは実行時判定により専用の背景色・自機色・敵色・弾色を設定します。

## ビルドと起動

リポジトリルートから実行します。

```bat
build.cmd star-caravan -Configuration Debug
run.cmd star-caravan -Emulator BGB
```

Release ROMは次のコマンドで作成します。

```bat
build.cmd star-caravan -Configuration Release
```

出力先はそれぞれ次のとおりです。

```text
projects\star-caravan\build\Debug\star-caravan.gb
projects\star-caravan\build\Release\star-caravan.gb
```

`project.json` の `-Wm-yc`（末尾は小文字）は、ROMヘッダーを「CGB機能対応・DMG互換」の `0x80` に設定します。大文字の `-Wm-yC` が作るCGB専用ROMや、`.gbc` 専用ROMではありません。

## 遊び方

- タイトル画面: `A` または `START` で開始、`SELECT` でスコアボード
- ゲーム中: 十字キーで8方向移動
- 射撃: `A` または `B` を押し続けて自動連射
- ポーズ: `START`
- 結果画面: `A` / `B` / `START` でタイトル、`SELECT` でスコアボード

制限時間は2分、残機は3機です。前半は3種の敵編隊が徐々に加速し、残り1分でボスが出現します。ボス撃破、または残機を保ったまま時間満了でステージクリアです。全機を失うとゲームオーバーになります。

得点は敵種ごとに100、150、250点、ボスは5000点、時間満了時には2000点です。得点は16bitの上限65535で飽和します。上位5件をスコアボードへ登録しますが、初期サンプルではSRAMを使わないため、記録はROMを起動している間だけ保持されます。

## 画面構成

- タイトル画面
- 2行HUD付きゲーム画面（スコア、残り時間、残機、ボス耐久値）
- STARTポーズ表示
- ゲームオーバー画面
- ステージクリア画面
- 上位5件のスコアボード

## 実装上の方針

描画素材はすべて `src/main.c` 内の小さな5x7文字パターンと2bppタイルから生成され、外部画像を必要としません。`assets-src` と `generated` は将来 `png2asset` を使う場合のために予約しています。

Game Boyの制約に合わせ、次を守っています。

- ハードウェアスプライトは最大28個を使用し、OAM上限40個以内
- 8x8スプライト、自機のみ2枚、ボスのみ4枚のメタスプライト構成
- フレーム処理は8bit中心、得点のみ16bit、32bit演算・浮動小数点・動的メモリ・再帰は不使用
- VRAMへの大きな書き込みはLCD停止中、HUD更新はVBlank同期後
- 32x32背景マップを縦スクロールし、固定HUDはWindowレイヤーへ分離
- CGB固有のパレット・属性書き込みは `_cpu == CGB_TYPE` のときだけ実行

## ディレクトリ

```text
star-caravan\
├─ src\main.c          ゲーム、描画、入力、サウンド、コード内アセット
├─ include\.gitkeep    将来の公開ヘッダー用
├─ assets-src\.gitkeep 将来の編集用素材置き場
├─ generated\.gitkeep  自動生成物置き場
├─ project.json         共通ビルドスクリプト向け定義
└─ README.md            この説明
```

## 既知の制限

- ハイスコアはバッテリーバックアップされません。
- 音は短い効果音のみで、BGMはありません。
- 走査線あたり10スプライトという実機制限により、ボスと弾が横一列に重なった場合は一部が一時的にちらつくことがあります。
- エミュレータ確認に加え、最終配布前にはDMG/CGB実機または精度の高い複数エミュレータで入力、色、音、スプライト表示を確認してください。
