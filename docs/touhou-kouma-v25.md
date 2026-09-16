# 東方紅魔郷 GB v0.25 — 動画終了後の描画復元

v0.24で追加した起動動画の終了処理が、LCDCのタイル参照方式とWindowマップ選択を復元していなかった。動画を再生した後は、道中のWindow/HUDがスクロール背景と同じマップを使い、BG弾幕のボス戦では背景タイルの転送先がOBJ画像と重なっていた。動画を通らずロゴをスキップした経路では再現しなかった。

`engine/caravan/movie.c`で再生前のLCDCを保存し、完走・途中スキップ共通の終了処理で復元する。復元時はLCDを停止したままにし、次の画面の転送・表示処理に引き継ぐ。動画の形式、弾幕、キャラクター画像は変更しない。作業領域の追加1バイトは既存の一時エンティティ領域内に収まり、静的RAMの増加はない。

## 回帰検証

- `display-restore.acceptance.mjs`: 本番ROMを通常起動し、動画→タイトル→道中→カットイン→BGボス戦まで自動進行。DMG/CGBで、霊夢・魔理沙・各ショットを含む常駐13アセットのVRAMを元データと直接照合。スクロール中のHUDマップ・文字タイルが固定されることも確認。RAM改変なし。
- 同じ検査を旧v0.24に適用すると、最初の道中でLCDCの復元検査が失敗する（実際値0x10、期待値0x40、マスク0x50）。
- DMG: 道中6,096サンプル、カメラ5,553位置、ボス戦120サンプル成功。CGB: 道中2,321サンプル、カメラ2,259位置、ボス戦120サンプル成功。
- `startup-movie.acceptance.mjs`: 両機種の全36動画フレーム、完走、ロゴスキップ、動画の先頭・中間・末尾スキップ、タイトルBGM復帰、キャラクター選択を確認。終了後のLCDC検査を追加。
- `color-oam.acceptance.mjs`: 両機種・両キャラクターの実OAM属性を確認。
- `display-restore-native.acceptance.mjs`: BGBで展示ループを動かし、道中・BGボス戦のLCDC復元、カットイン、ランキング、次ループの動画再生を確認する。

HUDの検査はWindowマップと文字画像の固定を対象とする。既存仕様でHUDと重なることがあるOBJは、この固定検査には含めない。エミュレーターのキャプチャでも道中・ボス戦の画像を確認した。

`doctor.cmd`は警告0、`test.cmd star-caravan`は141件成功・失敗0。hello-gbをclean後にDebugビルドし、東方とstar-caravanはDebug/Releaseをビルドした。東方のDebug/Releaseはバイト一致（2MiB、SHA-256 `744b901d5e28921db6817f3ba3f63c8e7f1c43fbc3268dc67b3f426aba0ed871`）。静的RAM＋OAMは7,164バイト、スタック予約は1,024バイト以上を維持する。

EmuliciousはDAPのEvaluateRequestがNullPointerExceptionとなり、実行検証の根拠にできなかった。実機DMG/CGBの表示と、人による操作・音声確認は未実施。詳細結果とROMハッシュは `projects/touhou-kouma/touhou-kouma-design/qa-v25.json` に記録する。
