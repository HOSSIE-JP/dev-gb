# 東方 紅魔巡礼 GB v0.11 実装・検証報告

2026-09-12。霊夢／魔理沙それぞれの機体選択画像・ゲームオーバー画像と、選択機体に対応した全7ボスの戦闘前後会話を実装した試遊版です。

## ROMと操作

- ROM: [touhou-kouma-v11.gb](C:/homebrew/projects/dev-gb/projects/touhou-kouma/build/Release/touhou-kouma-v11.gb)、1,048,576 bytes、DMG/CGB共通。
- SHA-256: `eaaedcd26a621430eae7d59ca96f1312e42f8f835423b5591bffee349cec5a8d`
- 編集データrevision: `7a692f06d03b3aeb2331d50977787cfd5034431154beae34b67c2b33f9428943`
- Debug／Releaseは同じバイト列です。
- タイトルからA/STARTで機体選択。左右で切替、A/STARTで決定、Bで戻る。
- 十字キーで移動、Aで通常射撃、Bで低速・集中射撃、A+Bでボム、STARTで一時停止。

## 画像と会話

選択画面を、霊夢の大きなリボンと笑顔、魔理沙の帽子に手を添えた笑顔のバストアップへ変更しました。大きな瞳と表情が160×144でも残るように調整しています。左右の画像矢印だけを添え、性能・番号・キャラクター名・文字ヘルプは表示しません。

ゲームオーバーは、リボンや帽子が崩れ、すす汚れ・涙・ため息を見せる各機体の専用画像です。画面には `GAME OVER` と現在スコアを表示します。入力するまで画面を保持し、タイトルに戻って次のゲームを始めると選択の初期値は霊夢です。

![霊夢の選択画面](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/verification-v11/CGB-reimu-selection.png)
![魔理沙の選択画面](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/verification-v11/CGB-marisa-selection.png)
![霊夢のゲームオーバー](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/verification-v11/CGB-reimu-gameover.png)
![魔理沙のゲームオーバー](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/verification-v11/CGB-marisa-gameover.png)

霊夢の既存会話を保持し、魔理沙には7ボスそれぞれの戦闘前4ページ・撃破後4ページ、合計56ページを書きました。話者名の置換だけでなく、寄り道、魔法、箒、光や星を軸に、各ボスとの掛け合いを変えています。

| ボス | 魔理沙の会話の軸 |
|---|---|
| ルーミア | 迷子ではなく寄り道。闇を越えて進む |
| チルノ | 氷と光の勝負 |
| 美鈴 | 門の向こうにある本への好奇心 |
| パチュリー | 魔法と本を借りる約束 |
| 咲夜 | 時間、箒、片付けの掛け合い |
| レミリア | 紅い霧を晴らして星を見せる |
| フランドール | 壊さずに星で遊ぶ約束 |

魔理沙では会話画面左上80×96のパネルを専用立ち絵へ差し替え、戦闘前は帽子に手を添えた姿、撃破後はウィンクした姿を使います。右のボスは元の登場・敗北画像です。撃破後の会話を経て、スコア計算画面にも選択機体の勝利姿を引き継ぎます。

![魔理沙とルーミアの戦闘前会話](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/verification-v11/CGB-marisa-stage-forest-before.png)
![魔理沙とルーミアの撃破後会話](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/verification-v11/CGB-marisa-stage-forest-after.png)

## エディターと保存データ

自機設定に「機体選択の画像（文字なし）」「ゲームオーバーの専用画像」を追加しました。霊夢・追加機体それぞれに指定でき、中央の機体別プレビューで切り替えて確認できます。

ステージの「会話とクリア演出」に「追加機体の会話」を追加。対象機体ID、戦闘開始前／撃破後の有効設定、背景、左立ち絵、各ページの話者・台詞を編集できます。既存の会話は標準機体用で、追加機体の設定がない場合はそこへ戻ります。機体IDで関連付けるため、追加機体の並べ替えで話が入れ替わりません。存在しない機体、同一機体の重複設定、画像参照切れ、18文字を超える行などは検証エラーになります。

戦闘前・撃破後のプレビューには機体とページの選択を追加しました。保存前の台詞編集を即座に反映し、ROMのビルドは不要です。

編集元は `assets-src/game.json` と `assets-src/images/`。6点の原寸生成画像・採用画像・指示全文・ハッシュ・再変換コードを [imagegen-v11](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/imagegen-v11/README.md) に保存しました。台詞は [dialogue-v11.json](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/dialogue-v11.json)、今回の実ROM画面は `verification-v11/` に保管しています。

## 実装と容量

コンパイラーが機体別の会話・スコア画面とゲームオーバー画面の参照表を生成し、ランタイムは選択機体に応じて参照します。会話の合成や画像の量子化はビルド前に済ませ、ゲーム中の弾幕更新に画像合成処理を追加していません。会話ページ間は従来どおり文字部分だけを更新します。

- アセット64件、今回の追加画像6件。選択背景は霊夢243／魔理沙245種類のタイルで、255の上限内です。
- ROMは512KiBから1MiBへ増加。機体ごとの画面と台詞をROMに持つためです。
- 静的WRAM＋シャドウOAMは6,949／8,192 bytes、OBJ素材80タイルで前版と同じ。1KiB以上のスタック予約を確保しています。
- 既存のゲーム設定は今回の画像・会話の追加とGAME OVER見出し以外が一致。既存画像69枚もバイト単位で一致しています。
- HP100×3、弾幕上限12〜40発、1.20秒カットイン、ボム、機体速度差、スコア集計後2秒の待ちは保持しています。

## 検証

| 検証 | 結果 |
|---|---|
| doctor、hello-gb clean／Debug | 成功、doctor警告0 |
| test.cmd | 77件成功、失敗・スキップ0。ROM・BGBを含む |
| star-caravan、touhou-kouma Debug／Release | 成功。touhouのDebug／Releaseは同一ハッシュ |
| TypeScript・エディタービルド | 成功 |
| 実ElectronのUI操作 | 画像と会話の機体切替、保存前反映、保存／再読込、既存ボス・弾幕・自機操作が成功 |
| 通常Release ROM、2機体×DMG/CGB | 選択・左右循環・キャンセル・実際の被弾による残機0・専用ゲームオーバー・再選択を確認 |
| 通常ROMの画像照合 | 選択とゲームオーバーの全23,040ピクセル、最初の戦闘前4ページをVRAMと照合 |
| 会話全経路の短縮ROM | 7ボス×前後8ページ×2機体×DMG/CGB＝224ページを全文・画像まで照合。スコアの勝利画像28件、全21カットインと最終到達も各機体／各モードで確認 |
| 既存ボムの通常ROM回帰 | 2機体×DMG/CGBで専用演出、OBJ保存、残数2→1→0、長押し時の再消費防止、次の残機で2へ補充 |
| BGB 1.6.6での機体別全経路 | CGBで両機体の全56ページずつとスコア7画面ずつ、最終到達を確認。上記短縮ROMを使用し、CPUブレークポイントで参照先を読み取り記録 |
| Emulicious | DAP初期化は成功。通常権限・GUI権限での再試行ともlaunchが60秒でタイムアウトし、ROM動作の裏付けにはしていない |

短縮ROMはボス登場をフレーム0、各HPを1、位置を固定し、自機武器・初期無敵を検証用に調整、撃破の連続爆発を無効にしています。画像・会話・BGM・段階切替・エンジンは同じです。入力操作のみで進め、エミュレーターRAMへの書き込みはしていません。これは通常難易度での全編クリアの証明ではありません。

結果の機械可読データは [qa-v11.json](C:/homebrew/projects/dev-gb/projects/touhou-kouma/touhou-kouma-design/qa-v11.json)。詳細ログと全画面は `.cache/kouma-v11/` にあります。検証スクリプトは `editor/tests/character-presentation.test.mjs`、`character-screens.acceptance.mjs`、`character-campaign.acceptance.mjs`、`character-native.acceptance.mjs`、`boss-ui.acceptance.cjs` です。

## 残る確認

エンディングは既存の共通スライドで、今回の機体別化の対象は選択・ゲームオーバー・ボス戦闘前後の会話と勝利表示です。通常条件での全編クリア、DMG/CGB実機、人による音・操作感・難易度評価は未確認です。

今回、弾幕の更新処理は変更せず、全21弾幕の性能測定も再実施していません。[v0.10の測定](C:/homebrew/projects/dev-gb/docs/touhou-kouma-v10.md)ではGBC約57.8〜59.7更新/秒、DMG約20〜30更新/秒でしたが、これは前版の実測値です。本版で常時60fpsを達成したという主張ではありません。
