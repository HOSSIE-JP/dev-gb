# v0.15 POPブランドロゴと二次創作案内

[DMG/CGB共通ROM](../projects/touhou-kouma/build/Release/touhou-kouma-v15.gb) — 1048576 bytes、Debug/Release同一。

SHA-256: `ef365100ce9f2891c18d88360081dbdc92337ced00634a2421f32e524311402a`

## 追加した画面

1. **AI Slop Games**: ゲームパッドを持ったかわいいロボット、ハートと星、太いPOP文字。初案のドロドロ表現は取りやめました。2.5秒表示。
2. **このゲームは東方Projectの二次創作STGです。**: ゆっくり霊夢・魔理沙の顔と指定文を3行で配置。5秒表示。

各ページの前後に片道0.4秒のフェードを入れ、2枚目の後はタイトルへ進みます。任意のボタンで残りをスキップできます。秒数・順番はエディターの「プロジェクト」→「起動ロゴ（タイトル前）」から調整できます。外部編集を反映するにはプロジェクトを開き直してください。

両画面160×144・4階調。固有タイルは161枚と254枚（上限255）。CGBは既存パレット7を使います。元PNGのインデックス表現は見た目が反転するため、確認用画像またはROMで見てください。

## 保存物

- [採用原画・GB用画像・指示全文・変換方法](../projects/touhou-kouma/touhou-kouma-design/imagegen-v15/README.md)
- [起動設定](../projects/touhou-kouma/touhou-kouma-design/startup-v15.json)
- [検証結果](../projects/touhou-kouma/touhou-kouma-design/qa-v15.json)

## 確認結果

- doctor: 警告0。hello-gb clean/Debug、star-caravan Debug/Release、touhou-kouma Debug/Release成功。
- 標準テスト86件成功。
- 実際に配布するROMをDMG/CGBで6ケース確認。2画像の全画素、表示順、150/300 VBlankの表示時間、フェード段階、各ページからのスキップ、押しっぱなし防止、機体選択とタイトル復帰を確認。テスト用ROMやRAM書換えは使用していません。
- BGB 1.6.6 CGBで自動送り・スキップの2ケース。表示順、画面番号、フェード、表示時間、タイトル遷移を読み取りログで確認。
- 保存後の再読込と設定一致を確認。既存画像76枚のSHA-256がすべて不変。ゲーム設定は新規2アセット・起動設定以外が一致し、戦闘・会話・BGM・エンディング設定を保持。

実機と通常条件での全編クリアは今回未確認。Emuliciousは起動応答がタイムアウトし、実行確認に数えていません。

Electronでも2ページの設定とプレビュー切替を実操作で確認しました。初回の並列検証では標準テストによる出力の掃除がReleaseビルドと競合したため、標準テスト→Releaseビルドの順で実行し直し、上記の成功結果を確認しています。
