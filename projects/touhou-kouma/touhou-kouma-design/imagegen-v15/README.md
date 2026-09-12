# 起動ロゴ v0.15

組み込み順は `AI Slop Games` → `このゲームは東方Projectの二次創作STGです。` → タイトルです。

- `logo-ai-slop-pop-original.png`: 採用したPOP版。ゲームパッドを持った丸いロボットと太い文字。
- `logo-touhou-notice-original.png`: ゆっくり霊夢・魔理沙と指定の日本語案内。
- `*-gb.png`: 160×144・4階調の表示確認用画像。
- `logo-ai-slop-original.png`: 不採用の初案。ユーザー指示によりドロドロした表現を取りやめ、ゲームから差し替え済み。履歴用としてのみ保持。
- `prompts.md`: 初回の2枚の指示全文。`logo-pop-prompt.txt`: 採用版への修正指示全文。
- `convert.cjs`: 再現可能なGB形式変換。原画を変更せず、画素中心の最近傍縮小、黒へのアルファ合成、4階調化を行います。
- `manifest.json`: 採用原画と編集元PNGのSHA-256、タイル数。

制作: built-in `image_gen`。AI Slop Gamesのロゴは本依頼で制作したデザインです。案内画面は東方Projectのキャラクターの新規生成ファンアートであり、キャラクターの権利は原著作者に帰属します。既存ゲームROMからの画像抽出は行っていません。採用素材はこのプロジェクト内に保存し、編集元 `assets-src/images/logo-ai-slop.png` / `logo-touhou-notice.png` からビルドされます。

編集元PNGはエディターのインデックス表現のため単体では白黒が反転しています。確認には本フォルダの `*-gb.png`、エディター、または実ROMを使用してください。CGBでは既存のパレット7で青みのある4色表示になります。

変換確認: リポジトリ直下から `.tools/node/node.exe projects/touhou-kouma/touhou-kouma-design/imagegen-v15/convert.cjs --verify`
