# BG一斉生成の改善（東方 v0.30）

v0.29 / `601564e` を基準に、弾数・敵・攻撃設定を変えず、BG弾の一斉生成を改善した。保留中のv27/v28ブランチは取り込まず、mainのDMG/GBC両対応を維持する。

## 原因の実測

BGB 1.6.6で、変更していないROMの関数入口・出口を追跡する `bg-deadline-profile.mjs` を追加した。ROM/RAMへのホスト書込みはしない。CPU内に計測処理を追加しないため、ログ出力にかかるPC側の時間は測定対象ではない。BGBのTOTALCLKSから表示フレーム単位の時間を求め、割り込み時間も含めて比較する。

40発の同一負荷試験のtick 120～399では、変更前は280更新中21更新が2表示フレームを消費した。21回すべてに16発分の生成呼び出しがあった。BG移動以外のゲーム更新は、通常更新で平均0.176表示フレーム、遅れた更新で0.543表示フレームを占めた。

当初疑った「VBlank内なのにもう一度VBlankを待つ」現象はこの区間では発生しなかった。変更前後とも追加待ちは0回、転送処理への入口はLY=145。したがって、VRAM転送の待ち条件やOAM同期は変更していない。

## 実装

- `ce_shoot`でBG弾と通常のスプライト弾を一度だけ振り分ける。
- `bg-volley.h`の`ce_bg_shoot`が、BG弾管理と同じROMバンクで一斉生成する。1発ごとのバンク間呼び出しをやめ、同じバンク内の`spawn_shot`を呼ぶ。
- 寿命・ダメージ・誘導設定を一斉生成につき一度、発射位置を発射口につき一度設定する。
- 満杯なら残りの生成失敗数をまとめて加算し、位置・角度・速度の計算を省く。
- 受理された弾が生成直後に画面外や被弾で消える場合を維持する。最初の空き枠数で発射数を切り詰めず、各弾の生成後に満杯かを判定する。

新しい配列は追加しない。静的WRAM＋OAMは7,166バイト、ROM0空きは77バイトで変更前と同じ。今回の主な改善はCコードの処理単位とROMバンク呼び出し回数の整理で、既存のSM83更新・描画カーネルは維持する。

## 同一弾幕での結果

いずれも上限・ピーク40発。ゲーム更新tick 120～999の880更新を測る。BGBは静止入力、Boytaceanは途中に移動入力を含むため、両エミュレーター間の値を直接比較しない。

| 環境 | v0.29 更新/秒 | v0.30 更新/秒 |
|---|---:|---:|
| BGB / GBC | 55.56 | **59.59** |
| Boytacean / GBC | 56.01 | **59.63** |
| BGB / DMG | 24.54 | 24.56 |
| Boytacean / DMG | 25.00 | 25.03 |

BGBのGBC動作は約7.3%改善した。別途追跡した280更新では、2フレームを使った更新が**21回から1回**に減った。残るtick 378は8発を実際に生成した更新であり、転送前の通常待ちに間に合わなかった。880更新の測定にも2フレームの更新は残る。全更新での60fps保証ではない。

BoytaceanではGB/GBCそれぞれ1,000更新について、トレース・弾の生存枠/座標/速度/寿命・OAMが変更前と完全一致した。画面上のBG弾のピクセルも毎更新、実弾配列から作った期待値と一致した。被弾・復帰は両方とも4回。BGB側でも同じ入力に対する弾数・被弾・残機が一致した。

## 生成境界の検査とトレードオフ

`bg-volley.acceptance.mjs`のROM内テストループで、満杯時の失敗数の16bit桁あふれ、1つ目/2つ目の発射口で満杯、画面外生成、生成直後の被弾、誘導、左右同時/交互、下向き自機狙い、回転、固定位置、ボム中、通常敵弾、通常自弾、攻撃なしを検査する。17条件×生成直後＋32更新×2機種の**1,122状態**が一致した。誘導の内部状態、通常弾の描画用データ、プール数も含める。

| 生成の例（GBC、CPUサイクル） | 変更前 | 変更後 |
|---|---:|---:|
| 満杯への64発分の要求 | 119,896 | 2,508 |
| 7/20発から64発分の要求 | 145,568 | 50,468 |
| 生成直後の画面外消去を含む | 154,944 | 67,688 |
| 通常の敵スプライト弾 | 307,440 | 298,180 |
| 通常の自機スプライト弾 | 65,704 | 63,940 |
| 空き枠への誘導弾4発 | 24,800 | 27,252 |
| 空き枠への下向き自機狙い4発 | 43,792 | 46,144 |

満杯時と大量生成を大きく軽くする一方、少数の発射口から1発ずつ出すBG誘導弾は約9.9%、下向き自機狙いは約5.4%生成コストが増えた。追加の一斉生成呼び出しなどの固定費が残る。すべての種類の生成が高速化したわけではない。最初に試した共通ループ内の分岐追加案は通常ショットも重くしたため、最終版では専用ループへ分離した。

## 東方本編での比較

製品データはv0.29と同じ。最終面をステージ選択し、霊夢でAを押して道中を進め、登場会話をSTARTでスキップした後、入力を離してフランドールの第1パターンを600更新観測した。カットインを含め全600更新の状態が一致。定常区間tick 4262～4741の480更新ではピーク30発、変更前後とも59.72更新/秒で2フレーム更新は0回。元から間に合う区間では速度は増えない。

最初のステージの道中も、同じ機体・入力・tick 120～999で比較した。

| 環境 / 機体 | v0.29 更新/秒 | v0.30 更新/秒 |
|---|---:|---:|
| GBC / 霊夢 | 58.66 | 58.73 |
| GBC / 魔理沙 | 53.91 | 53.80 |
| DMG / 霊夢 | 44.85 | 44.85 |
| DMG / 魔理沙 | 32.77 | 32.79 |

道中はほぼ横ばいで、GBC魔理沙は880更新の消費フレームが975→977に増えた。道中全般の処理落ちを解決する変更とは扱わない。

## 再現と証拠

変更前の`engine/`を`.cache/bg-deadline/before-engine/`に保存する。基準コミットは`601564e`。ROM・全状態列・生ログはGit対象外の`.cache/bg-deadline/`へ保存し、集計とソースハッシュは[stg-bg-volley-results.json](stg-bg-volley-results.json)、製品ROMの検証は[qa-v30.json](../projects/touhou-kouma/touhou-kouma-design/qa-v30.json)へ保存する。

```powershell
.tools/node/node.exe editor/tests/bg-local.acceptance.mjs .cache/bg-deadline/before-engine/caravan .cache/bg-deadline/gameplay
.tools/node/node.exe editor/tests/bg-local-native.acceptance.mjs .cache/bg-deadline/gameplay/results.json .cache/bg-deadline/native-final
.tools/node/node.exe editor/tests/bg-deadline-profile.mjs .cache/bg-deadline/gameplay/current/projects/bg-local/build/Debug/bg-local.gb .cache/bg-deadline/profile-final 1500 fixture CGB
.tools/node/node.exe editor/tests/bg-volley.acceptance.mjs .cache/bg-deadline/volley-before .cache/bg-deadline/before-engine
.tools/node/node.exe editor/tests/bg-volley.acceptance.mjs .cache/bg-deadline/volley-final engine .cache/bg-deadline/volley-before/results.json
.tools/node/node.exe editor/tests/kouma-boss-performance.mjs .cache/bg-deadline/production-before/touhou-kouma.gb projects/touhou-kouma/build/Debug/touhou-kouma.gb .cache/bg-deadline/final-boss
```

計測ツールは観測範囲を明示する。プロファイラーの`fixture`はtick 120～399、`attract`は得られた完全なゲーム更新区間のみを集計する。途中でタイムアウトしたログを再解析するときは`reusedLog`を記録し、指定フレーム数を完走した証拠として扱わない。

## 製品ROMの最終検証

- `doctor.cmd`は警告0。hello-gbのclean/Debug、`test.cmd star-caravan`の141件は成功、失敗・スキップ0。
- 東方およびSTAR CARAVANのDebug/Releaseが成功し、それぞれ両構成のROMがバイト一致した。
- 東方の通常ROMでGB/GBCのHUD固定、常駐スプライトの画素、動画後の描画モード復帰、ボスカットインを確認した。
- 最終ROMのBGB検査はGB/GBC各15,000表示フレーム。各機種1回以上の道中→ボスカットイン→ランキング→ロゴ・動画への復帰を確認した。検査ツールの既定値は従来どおり2ループで、今回はエンジン変更の回帰範囲として1ループを明示指定している。

ROM：`projects/touhou-kouma/build/Release/touhou-kouma-v30.gb`（2MiB）。SHA-256：`e5f1aaaa3c9290744aa166c21b3a6e4b3d1954905e4745c61ebdc3fffa28558f`。

EmuliciousはDAPのEvaluateRequestがNullPointerExceptionを返し、接続成功だけでは動作検証としなかった。実機GB/GBC、音の聴感、全7面・全攻撃パターンの速度は未確認。次に取り組む場合は、残った実生成の重い更新と道中の魔理沙の負荷を別々に計測する。
