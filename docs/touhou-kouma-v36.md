# 東方 紅魔巡礼 GB v0.36 — 紅魔館の近景・遠景

6面の左右と中央が同じ赤煉瓦になっていたため、形・大きさ・明暗で描き分けた。

- 左右32px：大きな尖頭窓、太い赤い柱、縁飾りのあるゴシック外壁。近い建物として縦方向の形を強調。
- 中央56px：暗いえんじ色の屋根。小さな斜めの鱗状瓦を繰り返し、左右より遠い面として表現。
- 左右は対称配置。中央の半速スクロールを維持し、異なる模様の動きとして分かるようにした。
- GB版は共通の輝度しきい値28／42／80で変換。暗い屋根にも2階調の模様を残し、カラーを除いても外壁との差が残る。

背景の40タイル、視差更新の8タイル、画面レイアウト、スクロール係数は変更していない。エンジンの変更もない。速度改善を目的とする変更ではなく、追加の毎フレーム処理もない。他の6面とゲーム設定は元のデータと一致している。

## 元画像と再現手順

`projects/touhou-kouma/touhou-kouma-design/v36-mansion/` に保存。

- `masters/facade.png`：左右の赤いゴシック外壁。
- `masters/roof.png`：中央の暗い屋根。
- `generation.json`：内蔵image_genで使用した全プロンプト。
- `import.cjs`：v35のプロジェクトから32×32の外壁、32×16の屋根へ縮小し、40タイルに配置してエディターの保存APIから取り込む。
- `assets.json`：原画ハッシュ、入力／出力リビジョン、タイル予算。
- `comparison.png`：左からGBC旧／新、GB旧／新の素材プレビュー。エミュレーターのキャプチャとは区別する。

編集用の完成素材は `assets-src/images/map-roof-v36.png` と `map-roof-v36-cgb.png`。v35以前の素材は保持している。

## 検証

最終ROM、ビルドとテストの結果、実行画面は `touhou-kouma-design/qa-v36.json` に記録する。

全7面をGB／GBCのROMで起動する既存テストにより、中央のVRAMパターン変化・カメラ進行・右HUD固定を確認する。BGBでは6面を実入力で選択し、完成した表示フレームの外壁・屋根を目視確認する。

物理DMG／GBCでの確認はしていない。エミュレーターの結果は実機の証拠とは区別する。

## 最終結果

- ROM：`build/Release/touhou-kouma-v36.gb`（2MiB）、DebugとReleaseは一致。
- SHA-256：`5c0cf836fa8ffd3a78d7421ee7f2ce0b108108100cce31dd3d57bb440da17782`。
- Doctorは警告0、hello-gb Debug、star-caravan Debug／Release、157回帰テスト、TypeScriptチェックが成功。コンパイラー警告0。静的WRAM＋shadow OAMは7,161 bytesで変更なし。
- GB／GBCの全7面で、視差のVRAM更新・カメラ進行・右HUD固定が成功。6面のBGB画面を両機種・同一入力・2時点で目視確認。
- 霊夢ボムはGB／GBC・道中／ボスの4条件で、17,280ピクセルすべてが元画像と一致。前版の欠け修正を維持。
- EmuliciousはDAP評価時の `NullPointerException` により独立した動作確認ができていない。

実際のROM画面の比較は `v36-mansion/native-comparison.png`。上段GBC、下段GB、各行の左がv35・右がv36。
