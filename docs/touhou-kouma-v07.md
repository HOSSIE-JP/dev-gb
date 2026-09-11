# touhou-kouma v0.7：画像統一・短いカットイン・GBC性能改善

2026-09-11。保存済みv0.6（リビジョン `e3df1038693e7e2fbd81a88450ffee0646832913fba689d5ef8138c4f2454162`）を基に改修。元データは `.cache/kouma-v07/baseline/` に退避した。作品ID・7ステージ・55アセットを維持している。

## 画像と演出

ルーミアの会話画像を「左に既存の霊夢、右に全身のルーミア」、敗北画像を「右で膝をついて落ち込むルーミア」に作り直した。既存の美鈴の構図・階調・余白を参照し、霊夢は既存ピクセルをそのまま使用。追加指示に従い腕を水平にし、右手（画面左側）をグーにした。

チルノは24×24の実表示を前提に、顔と目、リボン、ドレス、羽を大きく整理。面積平均で4階調へ縮小し、GBの戦闘画面でも確認した。

前回の画像12点・原稿・出典とBGM 32/33の譜面を `projects/touhou-kouma/touhou-kouma-design/imagegen-v06/` に保存。今回の原稿、手の修正前後、プロンプト、採用ピクセル、比較画像は `imagegen-v07/`。`convert-v07.cjs` で変換を再現できる。取り込み元のSHA-256は `assets-src/revision-v07-provenance.json`。曲自体は変更していない。

全21カットインの表示時間は0.75秒。エディターでは0.1〜10秒を小数で入力でき、実機コードとプレビューは `round(seconds * 60)` で一致させた。従来の前後24フレームずつのフェードを除き、復帰時も見えないスクロール背景のロードを省略する。表示開始にパルス1のスイープ効果音を鳴らす。無敵・弾消去・ゲーム時計停止は維持した。秒数は画像が表示される時間で、画像転送・画面復帰の時間は別にかかる。

リザルト集計後の2秒待ち、新たな押下だけで進む仕様も維持し、連打・60フレームの押しっぱなしで消えないことを再確認した。

## 難易度

全ボスのBG敵弾上限を128から64へ削減した。ルーミアはHP90→60、しきい値40/20、弾速0.375px/更新、6〜8発を48更新ごとに発射、寿命240更新に調整。ほかのボスも発射間隔を延ばした。実時間の移動速度は更新速度の改善でも変わるため、難易度の最終判断には人によるプレイが必要。

## ボトルネックと変更

- 64発へ減らすだけでは、旧エンジンの重なり配置はCGBでも29.86更新/秒だった。
- 位置・速度・寿命の専用配列を64枠へ縮小。SM83内で移動・消滅・当たり判定・描画準備を統合し、二重の座標読み出しやレジスター退避を削減した。自機の近くにない弾は短い判定で抜ける。
- 単独セルは16種類の共有タイルを使い、重なった時だけ占有マスクを作る。毎フレームの720バイト初期化を廃止した。
- HUDが80タイル以下のCGBでは、全120種類の「2発が重なるタイル」も常駐させる。3発以上だけを動的合成する。HUD最大80＋常駐136＋動的最大21＝237タイル。大きいHUDは16種類＋動的最大32の経路へ戻る。
- 動的タイル合成とタイルマップの整形もSM83化。合成後に不要になる占有配列をDMAのマップ転送元として再利用する。
- CGBはVBlankでGDMAを行い、完成した非表示マップへ切り替える。最大512バイトの動的タイル＋576バイトのマップを転送。16バイト境界と符号付きBGタイル番号128のアドレス境界を扱う。DMGは従来の非表示ビットプレーン／マップへの安全な書き込みを維持する。
- 連続発射は前回の割り当て位置から空き枠を探す。満杯時は即座に拒否し、各弾で配列先頭から探索し直さない。

GDMAはCPUを停止させ、VRAMの表示中アクセスを自動回避しない。そのため転送開始・完了の走査線も検証した。[Pan Docs: CGB registers](https://raw.githubusercontent.com/gbdev/pandocs/master/src/CGB_Registers.md)

WRAM＋シャドウOAMは作品ROMで6,808/8,192バイト。1,384バイトが残り、1,024バイト以上のスタック予約検査に合格。ROMは512KiB、スプライト常駐タイル予算にも合格した。

## 実測

GBDK 4.5.0、Boytacean 0.13.2。DMG通常速／CGB倍速。値はPPUフレーム差から計測した論理更新/秒。

| 64発の配置 | DMG | CGB |
|---|---:|---:|
| 分散 | 29.86 | 59.73 |
| タイルに2発ずつ | 19.91 | 59.73 |
| 左右移動 | 21.48 | 59.73 |
| 16発ずつの塊が移動 | 19.91 | 59.73 |

4配置それぞれ33更新で全256ドットを独立した幾何計算と照合。重なり・重複・移動後の描き残し、寿命、画面外消去、衝突、満杯拒否を確認した。最終版では200回の生成・消滅による割り当て位置の周回と32枠設定も追加検証。CGBは1表示フレーム/更新を検査する。

BGB 1.6.6でも最終64発の配置を254更新観測。更新間隔は35,112倍速NOP相当（割り込みによる観測点の±4 NOPの揺れあり）で、表示フレームの欠落なし。GDMA開始はLY146、完了はLY148、すべてVBlank内だった。

**改変していない作品ROM**でも森→会話→カットイン→ルーミア戦を自動入力で進めた。ボス戦で射撃を止め、24発以上の連続区間を測定。最大33発、CGBは153表示フレームで153更新（59.73更新/秒）、DMGは330表示フレームで154更新（27.87更新/秒）。この区間と専用64発テストで60fps相当へ到達したが、全ボス・あらゆるHUD・自弾密度での60fps保証ではない。自動入力は最後に被弾してゲームオーバーになり、通常条件での全編クリア試験ではない。

## 検証と再実行

- `doctor.cmd`：警告0。`clean.cmd hello-gb`、`build.cmd hello-gb -Configuration Debug`：成功。
- `test.cmd`：全プロジェクトDebugビルド、型検査、ROM smoke、DMG/CGB・BGBを含む標準63件成功。
- `build.cmd touhou-kouma -Configuration Release`、`build.cmd star-caravan -Configuration Release`：成功。両Debugも成功。
- `node editor/tests/bg-bullets.acceptance.mjs .cache/bg-check pairs 64`：64発・画素一致・割り当て周回・VBlank内のDMA・CGB毎フレーム更新。`pairs`を`spread` / `motion` / `cluster`へ替えて各配置を検査。32発も指定可。
- `node editor/tests/bg-bgb.acceptance.mjs .cache/bg-check/fixture/projects/bg-test/build/Release/bg-test.gb .cache/bg-bgb-check`：BGBの読取り専用watchpointで時間・DMA走査線を検証。
- `node editor/tests/boss-presentation.acceptance.mjs .cache/boss-check`：最終版DMG/CGBとも3枚各45フレーム、効果音チャネルの発音、無敵、HP・時計の停止、リザルト待ち118/119観測フレーム、押しっぱなしの拒否を確認。
- `node editor/tests/kouma-campaign.acceptance.mjs .cache/campaign-check`：短縮7ステージで会話7組・21カットイン・リザルト7枚・エンディング到達。HP3、しきい値短縮、ボス固定、道中省略、プレイヤー射撃加速・無敵延長、撃破爆発省略の専用fixture。元の画像・BGMを使用。
- 同梱Electronの `editor/tests/boss-ui.acceptance.cjs`：実際のエディターで0.75秒設定、BG方式、画像プレビュー、リザルト待ちを確認。
- BGBで作品の森・短縮fixtureのカットイン・64発描画を実行し、画面保存に成功。チルノの戦闘画像、ルーミアの会話・敗北画像もDMG/CGBで確認。

生ログ・画面・退避ROMは `.cache/kouma-v07/`。`test.log`, `release.log`, `bg-final/results.json`, `bg32-final/results.json`, `motion64-v4/results.json`, `cluster64-v4/results.json`, `spread64-v3/results.json`, `bgb-timing-final/timing.json`, `presentation-final/results.json`, `campaign-qa/results.json`, `original-play.json`。

Emuliciousは初期化に応答したが再び`launch`が15秒でタイムアウトし、プレイ検証は未完了。DMG/CGB実機、ネイティブコントローラー、効果音・BGMの人による試聴、通常条件の全編クリアは未確認。

## ROM

Debug／Releaseとも524,288バイト、SHA-256：

`2b90c7c0506b0a119bca434d88b25b557cf0962a8eb839ca922a3334ef3fdbba`

公式ビルド出力は `projects/touhou-kouma/build/Release/touhou-kouma.gb`。同一バイトの版付き試遊ROMを `touhou-kouma-v07.gb` として同じ場所に保存。製品版の承認・パッケージ制作は行っていない。
