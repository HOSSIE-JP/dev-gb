# 起動動画

ロゴの後に事前変換動画を再生し、タイトルへ進む。展示ループでロゴへ戻るたびに再生する。ロゴでいずれかのボタンを押すと、そのロゴだけを終了して次のロゴへ進む。最後のロゴからは動画へ進み、動画が無効ならタイトルへ進む。動画中の新しいボタン入力で動画を終了してタイトルへ進む。同じボタンを押し続けても次のロゴや動画を連続でスキップせず、ゲーム開始にも流さない。無入力時の自動送りとフェードは従来どおり。

## 形式

`Game.startupMovie` に `enabled`、フレーム配列、4bit PCM を保存する。画像・音声は base64 でプロジェクトに含まれるため、作品の複製や移動でも外部パスに依存しない。エディターでは起動動画の有効／無効を切り替える。MP4 の実行時デコードではない。

| 項目 | GBC | GB |
| --- | --- | --- |
| 映像 | 160×96、上下余白 | 112×64、中央配置 |
| 色 | 8×8タイルごと4色、7パレット | 4階調 |
| バッファ | VRAMバンク0/1、各240タイル | 同一バンク内、各112タイル |
| 更新 | 6 VBlankごと、約9.95fps | 同左 |
| 音声 | CH3、8192Hz、4bit、モノラル | 同左 |

現在の形式は1～36フレーム（最大約3.616秒）。音声は16バイト単位で波形RAMへ送り、単一ROMバンクに収める。より長い映像にはPCMデータの分割と再生形式の拡張が必要。原映像のフルRGB色、原音の音質を保持する方式ではない。

`movie.c` は非ゲームシーン15だけでエンティティ領域を借りる。フレーム管理データはバンク化し、タイマー割り込みだけROM0に配置する。画像は隠れたバッファへ6回に分割して転送する。音声割り込みはROMバンクを保存・復元する。終了／スキップ時はタイマー、割り込み、CH3、スクロール、VRAMバンクを戻し、通常のタイトル読み込みで画面とBGMを再構築する。

## 素材取り込み

適切な範囲だけを抽出した入力クリップを用意し、メタデータを除去する。元ファイルは変更しない。

```powershell
.\.tools\node\node.exe editor/build.mjs
.\.tools\node\node.exe editor/scripts/import-startup-movie.cjs . touhou-kouma APPROVED_EXCERPT.mp4 FFMPEG.exe 3.6
.\build.cmd touhou-kouma -Configuration Debug
```

変換用PNG、音声、設定を作品のdesignフォルダーへ保存し、`readGame` / revision付き`saveGame`で取り込む。入力映像の再配布権を新たに付与するものではない。動画ファイルはGit対象外。

## 検証

`startup-movie.test.mjs` は形式・属性・パレット・PCM長と保存／複製を検査する。
`startup-movie.acceptance.mjs ROM OUT` は実ROMでDMG/CGBの表示画素を変換データと比較し、再生時間、音声転送数、転送遅延、先頭／途中／末尾でのスキップ、BGM復帰、キャラクター選択を確認する。
`startup-sequence.acceptance.mjs ROM OUT` は複数ロゴと動画を持つ実ROMで、8種類のボタン、読み込み・フェード中の入力、1画面ずつの送り、押しっぱなし、動画完走、展示ループからの再開を確認する。`startup-sequence-native.acceptance.mjs ROM INPUT_OUT OUT` はそこで記録した入力を同一ROMのBGBで再生して確認する。
`startup-movie-native.acceptance.mjs ROM OUT` はBGBの実行トレースで再生とタイトル復帰を確認する。
負荷分析用には`startup-movie-benchmark.cjs`で本番の`movie.c`を使った専用ROMを作り、`startup-movie-profile.mjs .cache/movie-benchmark/movie`で測定する。ゲーム本体の検証を代替するものではない。音声転送の共有ポインター更新と属性の除算を除去し、専用ROMではGBの325 VBlank／GBCの690 VBlankから217／216 VBlankへ短縮した（開始・終了境界の観測差を含む）。フレーム更新の期限超過は両機種0になった。
展示ループは既存の`attract.acceptance.mjs`も実行する。実機の音質・発音ノイズ・操作感は別途確認が必要。

仕様の根拠: [Pan Docs Audio Registers](https://gbdev.io/pandocs/Audio_Registers.html)、[Timer Registers](https://gbdev.io/pandocs/Timer_and_Divider_Registers.html)、[VRAM](https://gbdev.io/pandocs/Accessing_VRAM_and_OAM.html)。
