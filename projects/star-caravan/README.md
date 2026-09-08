# STAR CARAVAN

オリジナルのキャラバン型縦STG。DMG/GBC共通ROM、ゲーム内120秒、3機、敵3種、コアボス、タイトル／ゲーム／ゲームオーバー／クリア／上位5件スコアボードを収録。GB Studioは使用しません。

```bat
editor.cmd star-caravan
build.cmd star-caravan -Configuration Debug
build.cmd star-caravan -Configuration Release
run.cmd star-caravan -Configuration Release -Emulator BGB
run.cmd star-caravan -Configuration Release -Emulator Emulicious
```

十字キーで移動、A/B押し続けで連射、STARTで開始／ポーズ、タイトルのSELECTでスコアボード。全滅でゲームオーバー、ボス撃破または時間満了でクリア。敵100／150／250点、ボス5000点、クリア2000点。65535で飽和し、上位5件は電源を切るまで保持します。BGM・SRAM保存はありません。

元の単一`src/main.c`を、`assets-src/game.json`・PNGと共通`engine/caravan`へ分離しました。移行前ソースはGit履歴に残ります。`png2asset`と美咲ゴシックの文字抽出から生成したCをビルドします。

出力は`build/Debug/star-caravan.gb`または`build/Release/star-caravan.gb`。初期作品は32KiB・MBCなし、CGBフラグ0x80。拡張時はMBC5へ自動変更します。

**未達**：DMGで処理落ちが残り、ゲーム内120秒と実時間120秒の一致は保証できません。OAM40以内でも走査線10超過で欠けます。実機確認は未実施です。

[編集ガイド](../../docs/caravan-editor.md) / [素材の出典](assets-src/README.md)
