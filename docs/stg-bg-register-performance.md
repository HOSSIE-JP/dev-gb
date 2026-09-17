# BG弾のレジスタ受渡し最適化（2026-09-17）

mainの既存SM83処理を軽量化した。BG弾の更新時間は短縮したが、**GBCの戦闘全体の改善は小幅で、常時60更新/秒には届いていない**。v27/v28のデータ構造変更やGBC専用化は取り込んでいない。

比較元は `e22cc52dfeeb18061bfe1d92fbd218bc5b3cab58`。保留した実験は `codex/stg-performance-hold` の `2f1d16c2aaaf5fea3768270ad47e15ab0c771eb1` にある。

## 変更

- `bg-state-kernels.h`：内部描画入口はD/EでX/Yを受け取り、座標のRAM読戻しを減らす。Cから呼ぶラッパーのレジスタ保存は維持。
- タイル内の弾位置を一度だけ計算する。単独弾・常駐2発タイルではセル番号をRAMに保存せず、動的合成が必要になった時だけ算出・保存する。
- `bg-update-kernel.h`：Yの更新結果をそのまま描画へ渡す。Xの一時保存は残し、追加のスタック操作を避ける。

弾数、スロット順、座標精度、寿命、被弾順、3×3自機の局所判定、画像・パレット・OAM構成、VRAM公開タイミングは変更していない。旧RAM領域は局所判定の作業領域としても使用するので削除していない。東方の静的WRAM＋OAMは **7,166 byteのまま**。

## 実測

GBDK 4.5.0、Boytacean 0.13.2、BGB 1.6.6。機種ごとに同じゲームデータ・入力・更新区間で比較し、ROM/RAMをホストから書き換えていない。数値はゲーム更新/秒で、PCでエミュレーターが動く速さではない。

40発のBG弾、ボス1体、発射間隔12更新の共通負荷シーンを使った。全描画・音声・待機を含む。

| 計測 | DMG 変更前→後 | GBC 変更前→後 |
|---|---:|---:|
| Boytacean、移動入力を含む880区間 | 22.50→25.00（+11.1%） | 55.30→56.01（+1.28%） |
| BGB、静止入力の880区間 | 22.27→24.54（+10.2%） | 55.21→55.56（+0.63%） |

両計測は入力が異なるので別々の比較として扱う。Boytaceanでは各機種1,000更新について弾・被弾/残機・OAMが新旧一致し、全セルの公開済み弾画像も期待マスクと一致した。4回の被弾を含む。BGBも同じ更新番号で弾数・被弾・残機が一致した。弾数を40発から減らして得た改善ではない。

同じ負荷のBG更新関数だけでは、GBC平均 **49,854→45,456 CPU T-cycle（−8.82%）**、DMGは51,769→47,657（−7.94%）。この関数の短縮率をゲーム全体の速度向上率として扱ってはいけない。

さらに、最大64発の隔離診断で次を検証した。32発の条件も16更新ごとの補充で前の弾と共存する。表の発数は一度の発射数である。

| 診断条件 | GBC BG更新の平均CPU時間削減 |
|---|---:|
| 格子状に32発 | 8.24% |
| 格子状に64発 | 9.36% |
| 2発ずつの重なり | 8.45% |
| 4発ずつの重なり | 7.56% |
| 同じ座標から32発 | 4.91% |
| 左右端・HUD境界・画面下端 | 9.71% |
| 局所判定での実被弾 | 4.54% |
| 広い自機判定の直接判定 | 5.23% |
| 大型BGモードの直接判定（合成描画を除く） | 6.89% |

9条件×64更新×2機種＝1,152更新で、画素・生存弾の座標/速度/寿命・発生時/移動時の被弾結果が新旧一致。DMGも全9条件で4.0～8.8%短縮。BGBの同じROMによる診断も両機種で一致し、GBCのGDMAがVBlank内で開始・完了することを確認した。割り込み位相の小差を含め、BGBでも同程度のCPU時間短縮を確認した。

## 限界と次の判断

GBCは1表示フレームで更新を終える区間が既に多く、CPU時間を減らしても待機が増えるだけの場合がある。2フレームかかる区間は残り、全体では約0.6～1.3%の改善に留まった。今回の変更は小さなコスト削減として採用する。

次に大きな効果を狙う場合は、2フレームになった更新に絞って、生成・BG合成/転送・その他の更新・VBlank待ちの内訳を記録し、実際に締切を超える部分を特定する必要がある。今回の結果から、描画入口だけのさらなるアセンブラ化で常時60fpsに達するとは判断できない。

東方の全7面・両機体を通した速度保証、大型ボスのBG合成自体の高速化、実機DMG/GBC、音の人による評価は対象外。EmuliciousはDAPのEvaluateRequestがNullPointerExceptionを返し、実行確認として扱えなかった。

## 再現

変更前エンジンを `.cache/bg-registers/before-engine/caravan/` に保存してから、リポジトリルートで実行する。ROM・ビルド出力・全フレームの生データは `.cache/bg-registers/` に保存し、Git対象外。

```powershell
.tools/node/node.exe editor/tests/bg-registers.acceptance.mjs .cache/bg-registers/before .cache/bg-registers/before-engine
.tools/node/node.exe editor/tests/bg-registers.acceptance.mjs .cache/bg-registers/after-fixed engine .cache/bg-registers/before/results.json
.tools/node/node.exe editor/tests/bg-registers-native.acceptance.mjs .cache/bg-registers/before/results.json .cache/bg-registers/after-fixed/results.json .cache/bg-registers/native-kernel
.tools/node/node.exe editor/tests/bg-local.acceptance.mjs .cache/bg-registers/before-engine/caravan .cache/bg-registers/gameplay
.tools/node/node.exe editor/tests/bg-local-native.acceptance.mjs .cache/bg-registers/gameplay/results.json .cache/bg-registers/native-gameplay
```

集計・ROM/ソースハッシュは [stg-bg-register-results.json](stg-bg-register-results.json)。東方v0.29の製品ROMと回帰確認は [qa-v29.json](../projects/touhou-kouma/touhou-kouma-design/qa-v29.json) に記録する。

## 製品ROMの最終確認

- 東方・STAR CARAVANのDebug/Releaseは成功し、それぞれ両構成のROMハッシュが一致。東方は2MiB、固定ROMの空きは77 byteで変更前と同じ。
- `doctor.cmd`は警告0。hello-gbのclean/Debug、`test.cmd star-caravan`の141件が成功し、失敗・スキップは0。
- 東方の通常ROMで、GB/GBCの道中HUD固定、ボス戦を含む自機・弾の常駐スプライト画像、動画後の描画モード復帰を確認。
- BGBのGB/GBC各30,000表示フレームで、複数回の道中→ボスカットイン→ランキング→ロゴ→動画のループを確認。初回の22,000フレーム検査はDMGの2回目のランキング中に終了したため、3回目のロゴを確認できず失敗した。ROMは変えず観測時間を延長して通過した。
- Emuliciousは前述のDAPエラーのため未確認。実機での動作・全編の体感速度は未確認。

製品ROM：`projects/touhou-kouma/build/Release/touhou-kouma-v29.gb`。SHA-256：`f5b81f1029ea062bc7f509a5562c9b59ce165fab046939ac8c87b3c78f78bc30`。
