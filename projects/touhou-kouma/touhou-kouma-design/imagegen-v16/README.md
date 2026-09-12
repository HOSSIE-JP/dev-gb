# AI SLOP GAMES 文字ロゴ v0.16

ユーザーの修正指示に従い、ロボットを取り除きました。太いPOP文字の「AI / SLOP / GAMES」とハート・星の構成です。前版の原画は `../imagegen-v15/` に履歴として保持しています。

- `logo-ai-slop-type-original.png`: built-in `image_gen`で作成した採用原画（1322×1190）。
- `logo-ai-slop-gb.png`: 160×144・4階調の表示確認用画像。
- `prompt.txt`: 今回の生成指示全文。
- `convert.cjs`: 再現可能なGB形式変換。黒へのアルファ合成、画素中心の最近傍縮小、4階調化。
- `manifest.json`: 原画・編集元PNGのSHA-256、サイズ、パレット、固有タイル数。

ロゴは本依頼で新規生成したデザインです。既存ゲームROMからの画像抽出は行っていません。編集元 `../../assets-src/images/logo-ai-slop.png` に組み込み、元データと採用データを本プロジェクト内に保存しています。

固有タイル149枚、CGBパレット7。編集元PNGはエディターのインデックス表現のため単体では白黒が反転します。確認には `logo-ai-slop-gb.png`、エディター、またはROMを使ってください。

リポジトリ直下で変換一致を確認できます。

```bat
.tools\node\node.exe projects/touhou-kouma/touhou-kouma-design/imagegen-v16/convert.cjs --verify
```
