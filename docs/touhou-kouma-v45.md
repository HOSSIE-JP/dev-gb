# v0.45 ロゴを1画面ずつ送る

ロゴ中のボタン入力は表示中の1枚だけを終了し、次のロゴへ進む。最後のロゴからは起動動画へ進み、動画中に新しくボタンを押すとタイトルへ進む。同じボタンを押し続けても、次のロゴ・動画・タイトル操作へ入力を流さない。起動時とランキング後の展示ループに共通で適用する。動画が無効な作品は最後のロゴからタイトルへ進む。

## 実装

- `flow.c` はスキップ状態をロゴごとに解除し、直前のボタン状態を次のロゴへ引き継ぐ。
- `render.c` のロゴ読み込み中の入力も同じ押下判定を使い、短い入力を保持する。
- `mainloop.c` はロゴを送った場合も動画処理へ進む。
- `movie.c` は開始時の押下状態を記録し、前画面からの長押しで終了しない。
- `cgb-layout.ts` の動画作業領域の表示を780 bytesへ更新。SDCCのデバッグ情報にある実際の構造体サイズと照合済み。完成ROMのメモリレポートは同じ公式計算関数で再生成した（`.cache/startup-step/refresh-memory.mjs`）。ROMのバイト列には影響しない。

共通エンジンの修正。作品の画像・動画・音楽・ゲーム設定・セーブIDは変更していない。東方作品の設定revisionは `08de5fbf108095f653603ca77dccdd041c72cc63fe46e3be83c2b0b893ae62bf` のまま。

## 確認用ROM

- `projects/touhou-kouma/build/Release/touhou-kouma-v45.gb`
- GBC専用、4,194,304 bytes。Debug／Releaseのバイト列は同一。
- SHA-256: `f78e29a20b67c418228cbfb9495767c21514af0e94297bb32fdce43537f8c13e`
- ベースコミット: `eeb2e4b83c133071182e3442e9fc0446caa95723` ＋今回の変更。

## 動作検証

`doctor.cmd` は警告0件。`clean.cmd hello-gb` と `build.cmd hello-gb -Configuration Debug`、`test.cmd star-caravan`（186件成功、失敗0、スキップ0）、STAR CARAVANと東方作品のDebug／Releaseビルドが成功した。エディターの再ビルドとTypeScript検査も成功。今回の対象外作品のReleaseや過去版ROMを消さないため、標準テストのクリーン対象はSTAR CARAVANに限定した。

実ROMをBoytaceanで実行し、RAMの書換えをせず実際のjoypad入力で確認した。

- ロゴのみの専用ROM: GB／GBCで28ケース。8ボタン、読み込み中の短押し、フェード、自然な自動送り、後続ロゴの表示、ランキング往復、ゲーム開始。
- 複数ロゴ＋36フレーム動画の専用ROM: GB／GBCで38ケース。各ロゴの読み込み・フェード中の入力、長押し、動画完走、展示ループからの再開。
- 東方作品そのままのROM: GBCで16ケース。2枚のロゴを順に送り、動画を表示し、押し直しでタイトルへ進み、さらに新しいSTARTで機体選択へ進む。
- 東方作品の動画: 400/400フレームの画素一致、フレーム期限超過0、動画先頭・中間・255/256/399フレームのスキップ、タイトルBGM・LCDC・タイマー復帰。
- BGB: ロゴ専用ROMで2ケース、GB／GBCの動画付き専用ROMで6ケース、東方作品で3ケース。長押しで後続画面を飛ばさず、動画完走と展示ループ復帰を確認。BGBとBoytaceanの起動時間・LCD停止中の入力記録方式が異なるため、BGB自身の最初のロゴ表示時点で保存したステートから入力時点を合わせる。ROM／RAMへのパッチは使用しない。

主な再実行コマンド（リポジトリルート、Nodeは `.tools/node/node.exe`）:

```text
node editor/tests/startup.acceptance.mjs .cache/startup-step/logos
node editor/tests/startup-native.acceptance.mjs .cache/startup-step/logos/fixture/projects/startup-test/build/Debug/startup-test.gb .cache/startup-step/logos-bgb
node editor/tests/startup-sequence.acceptance.mjs projects/touhou-kouma/build/Debug/touhou-kouma.gb .cache/startup-step/production
node editor/tests/startup-sequence-native.acceptance.mjs projects/touhou-kouma/build/Debug/touhou-kouma.gb .cache/startup-step/production .cache/startup-step/production-bgb
node editor/tests/startup-movie.acceptance.mjs projects/touhou-kouma/build/Debug/touhou-kouma.gb .cache/startup-step/movie
```

動画付き専用ROMの生成手順は `.cache/startup-step/build-movie-fixture.cjs`。ロゴ専用ROMの設定に、現在の作品の動画の先頭36フレームと対応PCM、展示設定を追加したもの。作品そのもののGB対応を示す検証ではない。

## 検証範囲

Emuliciousは起動・DAP接続後の状態取得で `NullPointerException` が発生したため、動作確認済みに含めない。物理実機・人間による操作感／音質確認・全ステージ通しプレイは今回実施していない。ブラウザー配布版の書出しや公開は行っていない。

環境由来の診断: Gitのユーザー設定側ignoreファイルに読取り権限警告があるが、リポジトリ内の差分・ignore検査は実行できている。メモリレポート再計算時のTypeScript直接読込みではNodeのモジュール種別自動判定の警告が出た。いずれもゲームのコンパイル警告ではない。

詳細ログ・画面・入力列は `.cache/startup-step/`、要約は `projects/touhou-kouma/touhou-kouma-design/qa-v45.json`。
