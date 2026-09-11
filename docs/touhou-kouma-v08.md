# touhou-kouma v0.8：フェーズ破壊・HP回復・撃破後会話

2026-09-11。保存済みv0.7を基に変更。作品ID、7ステージ、55アセット、64発のBG弾幕とBGMを維持した。変更前の編集データとエンジンは `.cache/kouma-v08/baseline/` に保存。

## 実装した流れ

攻撃フェーズのHPが0になると、その衝突処理で敵弾・自弾を消去し、ボスを無敵にする。次の更新で爆発を1個だけ18VBlank再生する。爆発がボスの24×24スプライトに隠れないよう、この間は本体の描画を休止。続いて32VBlankかけてX80・Y36へ移動し、到着姿勢を表示する。

爆発・復帰中のHPは0。到着後に次フェーズのHPへ回復し、画像と弾幕名を72VBlank（設定上1.20秒）表示して戦闘再開。移動・自機操作・敵弾発射・ゲーム内時計は演出中に停止し、BGMは継続する。カットインの画像転送・画面復帰時間は表示秒数と別にかかる。登場用の時間フェーズから初弾幕への切替では爆発を出さない。

過剰ダメージでHPを削り切っても、次のフェーズへダメージを持ち越さず、途中のフェーズを飛ばさない。最後の攻撃フェーズだけが撃破に進む。初期登場フェーズは無敵で、下表の最初のHPを予告表示する。

| ボス | 第1攻撃 | 第2攻撃 | 第3攻撃 | 合計 |
|---|---:|---:|---:|---:|
| ルーミア | 20 | 20 | 20 | 60 |
| チルノ | 30 | 30 | 30 | 90 |
| 美鈴 | 37 | 37 | 36 | 110 |
| パチュリー | 45 | 46 | 44 | 135 |
| 咲夜 | 53 | 55 | 52 | 160 |
| レミリア | 63 | 65 | 62 | 190 |
| フランドール | 75 | 76 | 74 | 225 |

各合計はv0.7の通算HPと同じ。既存プロジェクトは `phase.hp` 未指定／0で従来のHP・条件値を使う。

## 音と勝利会話

カットイン音はパルス1の明るい音とノイズ4のクラッシュを重ね、ハードウェアのエンベロープで減衰させる。NR12=`F4`、NR42=`C4`。エンベロープの64Hzクロックに対して減衰間隔4、初期音量15／12という設定。パルス2・波形3のBGMを継続する。[Pan Docs: Audio Registers](https://raw.githubusercontent.com/gbdev/pandocs/master/src/Audio_Registers.md)

APUのPCMをDMG/CGB両方で採取し、開始後25〜35表示フレームでも初期RMSの10%以上の信号、終盤の減衰を確認した。初期RMSの5%以上は49フレーム目まで続いた。NR52のチャネルONビットだけを音の長さの根拠にはしていない。試聴WAVはBGM2/3をエミュレーター側でミュートし、低振幅のPCMを試聴用に正規化したもの。人による音色の評価は未実施。

撃破後は既存の爆発・ファンファーレ→勝者／敗者会話→スコア計算へ進む。全7人に新規4ページずつ、計28ページを追加。既存の敗北画像を使い、霊夢とのやり取りで次の場所へつなぐ。Aで次ページ、STARTでスキップ。射撃ボタンを押し続けても最初の会話ページは進まない。既存のリザルト集計後2秒待ちも維持する。

原稿と演出仕様は `projects/touhou-kouma/touhou-kouma-design/v08-victory-dialogue.json`、`brief-v08.json`。今回、画像や楽曲データ本体は変更していない。

## エディターと互換性

- ボスに復帰位置X/Y、フェーズに専用HPを追加。正数HPを指定するとHP切替条件を0にそろえる。次フェーズのない無敵時間フェーズは検証エラーにする。
- カットインの小数秒編集を維持し、新規初期値も1.20秒に変更。
- ステージに撃破後会話の有効化・背景・ページ・話者・2行のセリフを追加。対応文字で各行18文字、最大8ページ。
- 会話プレビューは編集途中の状態に追従し、保存・ROMビルドを不要にした。
- プレビューでも弾消去、爆発、HP0の無敵復帰、次HP回復の順序を合わせた。
- `CE_Entity` の25バイト構造と弾幕ASMの配列構造は維持。演出はbankedコードへ置き、生成Cはコンパイラーから出力する。

## 検証

検証用ROMは通常プレイと区別する。フェーズ演出試験はルーミアのみ、フェーズHP2/3/1、ダメージ20の過剰ダメージ射撃、移動ボス、低速の実BG弾を使う。全編接続試験は道中を省略し、各フェーズHP1・無敵延長・固定ボス・撃破連続爆発省略とした。いずれもソースから別ディレクトリへビルドし、実行中のROM／RAMは書き換えていない。

- `doctor.cmd`：警告0。`clean.cmd hello-gb`、`build.cmd hello-gb -Configuration Debug`：成功。
- `test.cmd`：全プロジェクトDebug、型検査、ROM smoke、DMG/CGB・BGBを含む標準65件。
- `boss-presentation.acceptance.mjs`：DMG/CGBで各72フレームの3カットイン、過剰ダメージ、爆発1個、弾消去、HP0での無敵復帰、位置80/36、次HP回復。会話4ページ→スコアの順序と、60フレームの押しっぱなし、集計待ちを検証。
- `kouma-campaign.acceptance.mjs`：DMG/CGBそれぞれ7会話・21カットイン・7撃破後会話・7集計・エンディングへ到達。
- `boss-audio.acceptance.mjs ROM.gb OUTDIR`：実APUの減衰をPCMで確認してWAVを保存。
- `boss-ui.acceptance.cjs`：隔離作品を使い、実Electronで1.20秒・フェーズHP・復帰位置・撃破後会話を操作。セリフを入力し、未保存・ビルドなしでプレビューの画素が変わることを確認。
- `bg-bullets.acceptance.mjs OUTDIR pairs 64`：64発・256ドットを独立した期待値と比較。CGBは33更新で1表示フレーム/更新（59.7275更新/秒）、DMGは3表示フレーム/更新。割当周回、満杯拒否、寿命、画面外、当たり判定、DMA範囲も確認。
- `bg-bgb.acceptance.mjs ROM.gb OUTDIR`：ネイティブBGBで64発の時間とVBlank内DMAを照合。
- `boss-bgb.acceptance.mjs ROM.gb OUTDIR`：BGBでも初回告知＋2回の爆発／復帰と、撃破後会話へ到達。A押下継続ではスコアへ進まない。

生ログ・スクリーンショット・検証ROMは `.cache/kouma-v08/` に保存。全場面の60fps、通常難易度での全編クリア、実機・ネイティブコントローラーは未確認。

改変していない作品ROMでも森→登場会話→ルーミア戦を確認。通常難易度のHP20→0→20の切替2回と、最終撃破・ファンファーレ・撃破後会話への到達を自動入力で確認した。道中はA、ボス戦はBの集中射撃とボス位置への横移動で、ROM／RAMへのパッチはない。残機1での到達であり、人による難易度評価や全7ステージの通常クリアを意味しない。

別の発射を止めた測定では最大33発、CGBは151表示フレームで151更新、DMGは325表示フレームで152更新だった。BGBの64発検証も254更新、更新間隔35,112倍速NOP相当（観測点の±4揺れ）、DMA開始LY146／終了LY148でVBlank内。

- [通常ROMのフェーズ切替録画（無音GIF）](../.cache/kouma-v08/phase-transition.gif)
- [通常ROMのルーミア撃破後会話](../.cache/kouma-v08/CGB-original-victory.png)
- [カットイン効果音のAPU試聴WAV（音量正規化）](../.cache/kouma-v08/audio/CGB-phase-announcement.wav)
- 最終標準検査：`.cache/kouma-v08/test-final.log`。演出：`presentation/results.json`。全7人：`campaign/results.json`。通常作品：`original-phases.json`, `original-play.json`。BGB：`bgb-presentation/result.json`, `bgb-timing/timing.json`。UI：`.cache/boss-ui-result.json`。

Emuliciousの初期化は成功。旧プローブが未対応の `configurationDone` を送っていた点を修正し、起動応答を60秒待つ再試行も行ったが、`launch` が応答しなかった。実行検証は未完了で、BGB/Boytaceanの結果と区別する。調査時の公式設定仕様は [Emulicious Debugger](https://github.com/Calindro/emulicious-debugger) を参照。

## 完成ビルド

Debug／Releaseとも524,288バイト、内容一致。WRAM＋シャドウOAMは6,811/8,192バイトで、1,024バイト以上のスタック予約検査に合格。touhou-koumaとstar-caravanのDebug／Releaseをビルド済み。標準65件と追加の演出・音・UI検証は成功。

編集リビジョン：`76d1d8211a7d4ad6b0f07a9cf5d8d3668093f8ac790c99686e80c43b4dcdebec`。版付きROM：`projects/touhou-kouma/build/Release/touhou-kouma-v08.gb`。SHA-256：

`1eaf8ae30e3b8ed9ec3871f721fe35ed6648a9edc062bad48343fbc6cf58007e`

画像・弾幕定義はv0.7の読み込みデータと完全一致、各ボスの必要ダメージ合計も照合済み。版と検証記録を `workflow.json` に保存し、前版記録を保持した。製品版としてのユーザー承認は未取得。
