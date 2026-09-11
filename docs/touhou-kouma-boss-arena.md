# touhou-kouma：BG弾幕とボス演出（2026-09-11）

この文書はv0.6時点の記録。現在の64発・短時間カットイン・画像修正と性能検証は [v0.7改修記録](touhou-kouma-v07.md) を参照。

`touhou-kouma` を7ステージ・55アセットへ拡張した。ルーミアの道中／ボス曲2曲、12点の新規画像、全7ボスのHPフェーズ用カットイン、リザルトの入力待ちを含む。旧保存版と復旧データは `.cache/kouma-expansion/baseline/` に退避し、作業開始後にどちらも変更されていないことを照合してから、未保存の最新編集を引き継いだ。無関係なNOVA SPEAR・エディターの既存変更は保持した。

## 仕様と編集箇所

| 設定 | 保存形式 | 今回の設定 |
|---|---|---|
| ボス戦の背景 | `boss.battle.background` | 全7ボス `bg-bullets`。`stage` / `blank` も選択可 |
| BG敵弾数 | `boss.battle.maxBullets` | 128、許容1〜128 |
| フェーズ告知 | `phase.intro` | `enabled`, `background`, `spellName`, `seconds` |
| カットイン時間 | `phase.intro.seconds` | 3秒、許容1〜10 |
| 弾幕名 | `phase.intro.spellName` | 最大36文字、18文字×2行。漢字は同梱フォントで検証 |
| リザルト待ち | `stage.presentation.clearWaitSeconds` | 集計完了後2秒、許容1〜10。省略も2秒 |

背景なしのボス出現時に通常敵・既存弾を除去し、スクロールと地形衝突を止める。ボスは1体。BGモードの敵弾は白い2×2ドットで2ドット刻みに表示し、当たり判定も同じ位置と大きさに合わせる。素材の形・色・アニメーションはこのモードの敵弾には反映しない。プレイヤー、自弾、ボス、爆発はスプライトを使う。HUDはBG内に残る。

HPしきい値を跨ぐ被弾はしきい値で止め、即座に無敵にする。同じ更新内の複数弾で告知を飛ばさない。次のフェーズ開始時に自弾・敵弾を消去し、バストアップ＋弾幕名を表示する。カットイン中はボスHP、プレイヤー位置、弾、ゲーム時計を停止し、BGMとVBlankによる表示時間だけ進める。ボタンでは飛ばせない。終了時にBG弾幕用のVRAMとボス画像を再ロードする。

リザルトの連打は集計を早められるが、待ち時間中の押下は消費される。待ち時間終了後に新しい押下が必要で、押しっぱなしも受理しない。待ちはループ回数ではなく `sys_time` の経過VBlankを使用し、DMGのHUD更新負荷で秒数が倍にならないようにした。

## 実装とハードウェア予算

GBのOAMは40個、1走査線10個なので、128発の敵弾をスプライトへ割り当てる構成にはできない。[Pan Docs: OAM](https://raw.githubusercontent.com/gbdev/pandocs/master/src/OAM.md)

`engine/caravan/bg-bullets.c` に128発専用の位置・速度・寿命配列を置く。内部座標はQ8.8、生成要求は既存のQ12.4から変換する。更新・消滅・当たり判定・タイル内占有マスクの生成をSM83コードへまとめた。既存の通常弾SoAカーネルは通常ステージと自弾に使用する。

画面は20×18タイル、1タイルに2×2ドット位置が16個ある。単独弾は事前生成した16種類のタイルを使い、複数弾が重なるセルだけ合成する。複合セルの一覧を保持し、画面全体を再探索しない。128発なら複合セルは最大64個なので、HUD最大128＋単独16＋複合64＝208タイルに収まる。

BGの2ビットプレーンと2枚のタイルマップを交互に使う。見えていないプレーンだけを書き、VBlank後にマップとパレットを切り替える。スプライト用画像は `$8000` 側へ移し、BGには符号付きタイル参照の領域を使う。[Pan Docs: Tile Data](https://raw.githubusercontent.com/gbdev/pandocs/master/src/Tile_Data.md)

`bg-kernels.h` のVRAM書き込みは割り込みを止めたSTAT確認と2バイト書き込みを一組にする。Mode 3で書かない。OAMは従来どおり完成済みリストをVBlank DMAで転送してから次の更新を許す。[Pan Docs: VRAM/OAM access](https://raw.githubusercontent.com/gbdev/pandocs/master/src/Accessing_VRAM_and_OAM.md)

ボス専用画像は最大1体分のVRAM領域を共有し、出現・画面復帰時に必要な画像を読み込む。自機・敵・弾・爆発と兼用される素材は常駐する。結果、7体を含めても使用スプライトタイルは74/128。追加RAMは通常モードでも確保され、固定WRAM＋シャドウOAMは4,009→6,766バイトになった。8KiB中1,426バイトが残り、ビルド時の1,024バイト以上のスタック予約検査に合格した。

ROM0の容量を確保するため、イベント展開とボス出現・撃破演出をバンク付き処理へ移動した。SDCCの自動バンク対象に `static BANKED` を付けると仮番号255への呼び出しが残る不具合を命令トレースで発見し、同一バンク内の通常呼び出しに修正した。

参考は `dangan.gb` の「BGを弾の画面に使う」考え方。今回のコード、タイル合成方式、素材、BGMは独自実装で、参考ROMから取り出したコードや素材を組み込んでいない。前段のROM調査は [STG性能調査](stg-performance-investigation.md) を参照。

## 実測

GBDK 4.5.0／Boytacean 0.13.2。DMG通常速、CGB倍速。速度はPPUフレーム差から求めた論理更新/秒で、液晶の走査周波数ではない。

| 条件（128発） | DMG | CGB |
|---|---:|---:|
| 分散した静止弾 | 14.93 | 29.86 |
| タイル内に2発ずつ重なる配置 | 8.53 | 14.93 |
| 左右へ0.5pxずつ移動 | 11.95 | 21.48 |

各ケースで33更新を観測し、独立に計算した全512ドットと実VRAMの表示が一致した。見えていないプレーン／マップへの切り替え、OAM転送、スクロール停止、Window非表示も確認した。最終分散試験には、128枠満杯・129発目拒否・寿命切れ・画面外消去・プレイヤーとの衝突のSM83側検査を追加した。

1px精度・3×3形状で全弾を合成した初期試作はDMG約2.6更新/秒だった。2px表示への仕様変更、単独弾タイルの共有、アセンブリ化、Q8.8座標化、複合セル一覧により上表まで改善した。初期試作とは表示仕様が違うので同一品質での速度比較ではない。**128発で60fps、または重なり方によらず一定速度という目標は達成していない。**

改変していない完成ROMでも森→会話→ルーミアの最初のカットイン→最大128発まで到達した。64発以上の観測区間は、DMGが560画面で104更新（約11.09更新/秒）、CGBが295画面で104更新（約21.06更新/秒）。道中は射撃し、ボス戦では射撃を止めて弾数を増やす入力で、最終的にゲームオーバーになった。これは通常条件のクリア試験ではない。

## 検証と再実行

- `doctor.cmd`、`clean.cmd hello-gb`、`build.cmd hello-gb -Configuration Debug`：成功。
- `test.cmd`：全プロジェクトDebug、ROM smoke、型検査、エディター・DMG/CGB統合・BGBを含む63件成功。
- `build.cmd star-caravan -Configuration Release`、`build.cmd touhou-kouma -Configuration Release`：成功。両プロジェクトのDebugも成功。
- `node --test editor/tests/music-runtime.acceptance.mjs`：DMG/CGBで全曲のループ・タイミング・PCMを確認、新曲32/33も対象。
- `node editor/tests/bg-bullets.acceptance.mjs .cache/bg-qa spread`：128発、実VRAM、寿命・衝突。末尾を `pairs` / `motion` にして別配置を測定。
- `node editor/tests/boss-presentation.acceptance.mjs`：HP3の短縮ルーミアで3枚それぞれ180VBlank、HPとゲーム時計の停止、無敵、弾消去、リザルト待ち、60VBlank保持後の新規押下を検証。
- `node editor/tests/kouma-campaign.acceptance.mjs`：HP・しきい値・出現時刻を短縮し、ボスを静止、自弾を高速化、プレイヤー無敵を1024 tick、撃破爆発を無効にした7ステージで21枚のカットイン、7組の会話・リザルト、エンディング到達。元の画像・会話・BGM・敵弾設定を使用。
- `editor/tests/boss-ui.acceptance.cjs`：同梱Electronで隔離した作品を開き、実キー入力によるフェーズ選択、カットイン描画、BG方式と待ち時間の設定を確認。日本語フォントも読み込んだ。
- BGB 1.6.6の公式headless/demoで、完成ROMの森、検証ROMのカットイン、128発BGを実行・BMP保存。通常のCGB自動選択で終了コード0。

生データと画面は `.cache/kouma-expansion/`：`test-final.log`, `bg-qa-final/results.json`, `bg-qa-pairs/results.json`, `bg-qa-motion/results.json`, `presentation-qa/results.json`, `campaign-qa/results.json`, `original-play.json`, `bgb/results.json`, `editor-boss.png`。`.cache` とROM・生成物はコミット対象外。

Emuliciousは初期化に応答したが `launch` が15秒でタイムアウトし、プレイ合格とはしていない。全編の通常条件クリア、難易度の人による調整、音の試聴、ネイティブコントローラー、DMG/CGB実機は未確認。短縮キャンペーンと自動入力の結果で代用しない。

## 成果物

Debug／Releaseはいずれも524,288バイト、同一ROM SHA-256：

`ee0fdca4234f69729f6b26c6f702d73d45f0919735bdbb277357349294f60a3d`

編集データのリビジョン：`e3df1038693e7e2fbd81a88450ffee0646832913fba689d5ef8138c4f2454162`。

ROMは `projects/touhou-kouma/build/Release/touhou-kouma.gb`、使い方は [プロジェクトREADME](../projects/touhou-kouma/README-JA.md)。追加画像の原稿・出典・変換条件は同プロジェクトの `assets-src/originals/` と `assets-src/expansion-provenance.json` に保存した。
