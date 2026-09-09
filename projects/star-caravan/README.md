# STAR CARAVAN

オリジナルのキャラバン型縦STG。DMG/GBC共通ROM、ゲーム内120秒、3機、敵3種、コアボス、タイトル／ゲーム／ゲームオーバー／クリア／上位5件スコアボードを収録。GB Studioは使用しません。

```bat
editor.cmd star-caravan
build.cmd star-caravan -Configuration Debug
build.cmd star-caravan -Configuration Release
run.cmd star-caravan -Configuration Release -Emulator BGB
run.cmd star-caravan -Configuration Release -Emulator Emulicious
```

十字キーで移動、A/B押し続けで連射、STARTで開始／ポーズ、タイトルのSELECTでスコアボード。全滅でゲームオーバー、ボス撃破または時間満了でクリア。敵100／150／250点、ボス5000点、クリア2000点。65535で飽和し、上位5件は2スロット＋CRC付きSRAMに保存し、再起動後に復元します。

作品データは`assets-src/game.json`とPNG、実行エンジンは共通の`engine/caravan`です。`png2asset`と美咲ゴシックの文字抽出から生成したCをビルドします。

出力は`build/Debug/star-caravan.gb`または`build/Release/star-caravan.gb`。32KiBでもスコア保存用にMBC5＋8KiB RAM＋バッテリーを使用します。CGBフラグは0x80です。

**動作上の制約**：負荷が高い場面では処理落ちがあり、ゲーム内120秒と実時間120秒の一致は保証できません。OAM40以内でも走査線10超過で欠けます。配布ROMは実機でも動作を確認してください。

[編集ガイド](../../docs/caravan-editor.md) / [素材の出典](assets-src/README.md)
