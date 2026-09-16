# 起動動画候補：紹介PVの14秒抜粋

ユーザー指定の既存PVから61〜75秒を抽出。フランドール戦・カットイン・2文のナレーションが入る。

- `pv-excerpt-14s.mp4`: 1920x1080の元PV抜粋。
- `cgb-preview.mp4`: ゲーム領域を160x144、15fps、タイル4色・7パレットへ減色し、4倍で表示したPC用プレビュー。
- `dmg-preview.mp4`: 同じ映像を4階調化したPC用プレビュー。
- `analysis.json`: 元動画のSHA-256、切り出し位置、全210フレームのタイル数・減色誤差。
- `verification.json`: 全編デコード結果、各動画のハッシュ、映像・音声形式。

**これはROM内再生ではない。** 音声は元PVの仮Windowsナレーションを8kHzモノラルへ変換したプレビューで、GBのPCM再生の音質を再現してはいない。動画・中間フレームはGit管理外。サンプルPNG、測定値、変換スクリプトを保存する。

リポジトリルートで次を実行する。入力PVは隣の `pv-v22/touhou-kouma-v22-pv.mp4` に必要。

```powershell
./.tools/node/node.exe projects/touhou-kouma/touhou-kouma-design/video-v23/prepare.cjs 'FFmpegの絶対パス'
```

画質・ハードウェア転送・音声同期を分けた検討は [方式調査](../../../../docs/touhou-kouma-video-feasibility.md) を参照。
