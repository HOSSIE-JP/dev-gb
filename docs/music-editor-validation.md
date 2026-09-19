# 音楽エディターの検証記録

対象: MIDI取り込み、編集用楽譜、ピアノロール、音符表、試聴、保存、ROM生成。2026-09-20、Windowsの固定済みNode.js / Electron / GBDKで検証。

## 変換・保存

- 東方の登録済み14曲を、一般MIDI取り込み機能で再変換。従来の専用変換と、音符・タイ・休符・強弱・テンポを全ステップ照合しました。同じ入力・設定で同じ結果になります。
- 既存スコアに編集を加えない場合は生成Cが一致。1曲だけ編集した場合は、その曲のデータだけが変わります。
- SMF 0/1、PPQ、running status、単音化ポリシー、オクターブ、範囲外、破損ファイル、終了しない音符、無効テンポを検査しました。
- 長さ変更、休符、小節境界をまたぐタイ、ピアノロールの移動・伸縮・削除、移動中の音量変化保持、別の声の不変を検査しました。
- 実際の元MIDIコピー、SHA-256、通常保存、復旧、作品複製、保存競合、元ファイル変更の拒否を検査しました。
- 非ループの編集曲を撃破ファンファーレに指定でき、ループ曲ではエラーになります。

詳細: `editor/tests/music-editor.test.mjs`、`midi-soundtrack.test.mjs`。最終の関連テストは12件成功。ログ: `.cache/music-editor/focused-tests.log`。

## 標準コマンドとROM

| 検証 | 結果 |
|---|---|
| `doctor.cmd` | 成功、doctor判定の警告0件 |
| `clean.cmd hello-gb` / `build.cmd hello-gb -Configuration Debug` | 成功 |
| `test.cmd` | 全185件成功、失敗・省略0件（ピアノロール追加前の全体検査） |
| ピアノロール追加後の `test:core` | 全179件成功、失敗・省略0件 |
| star-caravan Debug / Release | 成功、静的RAM＋shadow OAM 7154 byte |
| touhou-kouma Debug / Release | 成功、4 MiB。両ROMのSHA-256一致 |
| 実UIで保存した編集曲を含むDMG/CGB共通作品 | Debug / Release成功、256 KiB、静的RAM＋shadow OAM 7163 byte。1024 byte以上のスタック予約を維持 |
| 上記編集曲のゲーム内再生 | BoytaceanのDMG / CGBで曲ID・3声・音声出力・連射中の進行・ポーズを確認 |
| 14曲の診断ROM | BoytaceanとBGBでDMG / CGBそれぞれ全曲のループを検査 |
| 東方の通常ROM | メニュー入力から7面×道中／ボスの14経路。各3声の音声出力、連射、停止・再開、魔理沙ボムの効果音を検査 |
| BGBの東方通常ROM | 7面の道中・ボスへ実メニュー入力で到達して進行を検査。フレーム落ちがあるため一定60fpsの証明ではない |

標準検査のclean処理に備え、既存ビルド1748ファイルを退避し、検査で消えた1714ファイルをハッシュ確認付きで復元しました。既存の版付きROMも保持しています。doctorではサンドボックス内のGitユーザーignore参照にPermission deniedが出ましたが、doctor検査自体は警告0・成功です。恒久設定は変更していません。

ログ／機械可読結果は `.cache/music-editor/` の `standard-results.json`、`core-tests.log`、`edited-rom/results.json`、`music-dmg-stream/results.json`、`music-native/results.json`、`kouma-production/results.json`、`kouma-bgb/results.json` にあります。

## 実画面

`test:music-ui` は実Electronのレンダラー、preload、IPC、保存先ファイル、WebAudioを使用します。OSのファイル選択／確認ダイアログだけを検査用に制御し、画面操作はネイティブのマウス／キーボード入力です。テスト内で音声バッファを観測しますが、音声処理を模造していません。

音楽画面と既存作品操作の最終結果は `.cache/music-editor/ui/results.json` と `.cache/project-ui-result.json` に記録します。ピアノロール画像は `.cache/music-editor/ui/music-piano.png`、音符表は `music-pattern.png` です。

最終版の両実UIテストはPASSです。ピアノロールでの追加・音程／開始位置移動・右端の伸縮（1ステップの短音を含む）・Delete・矢印キー・Undo・声部切り替えを操作し、音符表と通常保存・再読込への反映を確認しました。反復試聴の音声出力、停止、作品切り替え時の音声終了、MIDI選択のキャンセル、最小ウィンドウ幅でのレイアウトも確認しています。

ピアノロールで6ステップへ伸ばして保存したC5は、最終の生成Cにも音符1個＋タイ5個として反映されます。同じ保存データから2回生成して全23ファイルのSHA-256が一致することを確認しました。この結果は `.cache/music-editor/final-results.json` に記録しています。前節の編集曲ROMは音符表で編集・保存した作品を使用した検証であり、最終ピアノロール操作後のROMを別途全ビルドしたという意味ではありません。

## 未確認事項

- Emuliciousは固定版2026-03-27で、star-caravanとtouhou-koumaを個別に起動しDAP接続を試行。接続後の`evaluate`がエミュレーター内の`NullPointerException`になり、実行内容を検証できませんでした。成功として扱っていません。詳細は `emulicious-star/results.json`、`emulicious-kouma/results.json`。
- 実機DMG/CGB、人による聴感・音量バランス・アレンジの良し悪しは未確認です。
- WebAudio試聴はGB音色の近似です。ROMのAPU再生検査とは区別しています。
