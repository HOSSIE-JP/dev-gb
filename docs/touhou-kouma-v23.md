# 東方 紅魔巡礼 GB v0.23 — 展示用アトラクトデモ

## 変更

- 無操作で `ロゴ → タイトル → オートプレイ → ランキング → ロゴ` を繰り返す。
- タイトル12秒、ランキング8秒。実際の道中を自動射撃・左右移動で進行し、ボスのカットイン後15秒を目安にランキングへ移る。ボス撃破なら早めに終了する。
- ステージはデモ専用の乱数で選び、直前と同じステージを避ける。霊夢・魔理沙も自動選択する。
- 展示中は自機を無敵にして道中で終了しないようにし、会話のボタン待ちを省く。通常プレイの難易度は変更しない。
- デモのスコアをランキングやSRAMへ登録しない。異常時も5分でランキングへ戻る安全タイマーを持つ。
- デモ中はボタンでタイトルへ戻る。カットイン中の入力も記憶する。押しっぱなしでそのままゲーム開始しない。
- エディターのプロジェクト設定に「展示用オートプレイデモ」を追加。有効・タイトル待機・カットイン後戦闘・ランキング表示時間を編集できる。設定のない既存作品は従来通り。
- 手動で開いたランキングやクリア後ランキングも、展示モード有効時は時間経過でロゴに戻る。

## 動画

今回のROMに動画再生は入っていない。先行実装・ハードウェア仕様の調査と、指定された既存PVの14秒抜粋を使ったGB/GBC画質プレビューを作成した。[方式と制約](touhou-kouma-video-feasibility.md)を参照。

## 検証

ROM: `projects/touhou-kouma/build/Release/touhou-kouma-v23.gb`（1MiB、GB/GBC共通）。

SHA-256: `d6388fd757f6e4faeb9f5b2100552ab1144e5e437857a620dcdc0bf3a3d68418`

- `doctor.cmd`: 警告0。`clean.cmd hello-gb` とDebug再ビルド成功。
- `test.cmd`: 6プロジェクトのDebugビルド、140テスト成功、失敗0・スキップ0。
- 最終Touhou Debug/Releaseは同一バイト列。STAR CARAVAN Releaseも成功。
- Boytacean: 最終ROMをDMG/CGB各13周。両機種とも全7ステージの道中・カットイン・ランキング・ロゴ復帰を確認。合計約57分のハードウェア表示時間相当を進め、16bit時計の周回も跨いだ。
- 各周回でランキング非更新、タイトルBGMの進行を確認。デモ中・カットイン中の中断、押しっぱなし抑制、機体選択キャンセル後のステージ保持、魔理沙での通常開始も確認。
- BGB 1.6.6: 最終ROMをDMG/CGBで無入力実行。各モードでランキング3回、ロゴ3回以上を観測し、ランキング非更新を確認。
- Electron: 実際のプロジェクト設定で待機時間を12→18秒へ編集、保存後の再読込を確認。テストは隔離プロジェクトで実施し、本作品の初期値は12秒を保持。
- WRAM＋shadow OAM: 7164/8192byte（前版から13byte増加）。

機械可読の結果は `projects/touhou-kouma/touhou-kouma-design/qa-v23.json`、詳細は `qa-v23-final/`。標準ビルド後の最終修正も含め、最終ハッシュに対して周回・BGM・入力とBGB検証を再実施した。

再検証例（ルートから実行）:

```powershell
./build.cmd touhou-kouma -Configuration Release
./.tools/node/node.exe editor/tests/attract.acceptance.mjs projects/touhou-kouma/build/Release/touhou-kouma.gb .cache/attract-check --all-stages
./.tools/node/node.exe editor/tests/attract-native.acceptance.mjs projects/touhou-kouma/build/Release/touhou-kouma.gb .cache/attract-native-check
```

自動検証は実際のGB/GBC ROMを対象とし、デモ検証中にROM/RAMを書き換えず、ボタンを一切与えない周回を含む。実機・人の聴感確認とは区別する。EmuliciousはDAPの読み取りで例外が発生し、実行の裏付けが取れない。
