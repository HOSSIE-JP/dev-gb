# Touhou Kouma v0.40 — supplied 40-second opening

## 成果物

- 連結動画: `projects/touhou-kouma/assets-src/movie/opening-40s.mp4`
- Release ROM: `projects/touhou-kouma/build/Release/touhou-kouma-v40.gb`
- ROM SHA-256: `d368acf51fd3c3f03ac8c47ddb3882991cf46bd54e5de7198e652c8c85017a23`
- ROM容量: 4,194,304 bytes（4 MiB、MBC5）。DebugとReleaseは同一バイト列。
- 詳細検証記録: `projects/touhou-kouma/touhou-kouma-design/qa-v40.json`

## 変更内容

`01.mp4` → `02.mp4` → `03.mp4` → `04.mp4` の順で連結。各素材の実測尺は
10.125秒だったため、それぞれ全体を1.25%速めて10秒に揃えた。連結版は
960x544、24fps、40秒。元動画の音声は一切マッピングせず、`bgm.mp3` のみを
AAC音声として収録した。元の5ファイルは保持し、作成前後のSHA-256一致を確認。
再作成スクリプトと入力・出力情報は同フォルダの `assemble.cjs` / `assembly.json`。

既存GB起動動画を400フレームへ差し替えた。プロジェクトの `assets-src/game.json`
は `startupMovie` 以外の設定が差し替え前と一致する。ロゴ→新OP→既存タイトルの
順序、ボタンでのスキップを維持した。過去のv39 ROMも保持している。

GB用データはCGB 160x96・7パレット、DMG 112x64・4階調。1フレームを6 VBlankで
表示するため、400フレームの尺は40.182495秒。BGMもこの尺へ合わせて
8,192Hz・4bit・モノラルPCMに変換し、164,592 bytesを収録した。

従来の36フレーム制限を400へ拡張し、フレーム番号を16bit化。音声を16KiB以下の
バンクへ分割してタイマー割り込みで継続再生する。データ生成も1 ROMバンク以内の
Cファイルにまとめ、Windowsのコンパイラ引数長制限を回避した。画面転送が既に
VBlankを跨いだ場合は重ねて待たないようにし、長尺CGB再生中の余分な待ちを解消。

## 検証

- `doctor.cmd`: 警告0。
- `clean.cmd hello-gb` / `build.cmd hello-gb -Configuration Debug`: 成功。
- `test.cmd star-caravan`: 170件成功、失敗0、スキップ0。
- STAR CARAVAN Debug／Release: 成功。
- Touhou Kouma Debug／Release: 成功、コンパイラ診断0、ハッシュ一致。
- TypeScript型検査・起動動画の上限／不正データ検査: 成功。
- 最終ROMをBoytacean DMG／CGBで再生: 全400フレームの画素が取り込みデータと一致。
  待ち超過0、全11音声バンクのリンク後データ一致、PCM 10,287ブロック再生。
  タイトルBGM再開とSTARTによるキャラクター選択への移行も成功。
- ロゴ中、動画先頭、中間、255／256／399フレームでスキップ検査。
  ボタンを押し続けてもタイトルから誤ってゲームを開始しないこと、タイマー停止、
  通常画面モードへの復帰を確認。
- 最終ROMをネイティブBGB DMG／CGBで再生: 全400フレームを順に観測、
  2,400 VBlankのトレース、PCM 10,287ブロック、待ち超過0、タイトル復帰。

画面と集計は `touhou-kouma-design/movie-v40/boytacean-final` / `bgb-final`。
生ログ・エミュレーターの隔離実行物・ROM音声記録はリポジトリの `.cache/op-v40-*`。

## 未確認範囲

実機DMG/CGBと人間による聴感確認は未実施。Emuliciousは起動・接続を試したが
DAP評価のNullPointerException、CPUスタック未取得、launchタイムアウトのため
再生成功には数えていない。今回の検証は新OPとタイトルへの復帰が中心であり、
全ステージの通常プレイを新たに完走したという結果ではない。

GB音声・画面は上記のハードウェア向け変換品質であり、連結MP4の映像・音質とは異なる。
