# 東方紅魔STG v47 — 第4面BGMリテイク

2026-10-13、提供ZIP `TOUHOU_GB_STAGE4_RETAKE_v4_compact.zip` から第4面の2曲を差し替えた。

| 場面 | 内部ステージID | 曲ID | 登録曲 |
| --- | --- | --- | --- |
| 第4面道中 | `stage-2` | 23 | 夜界を駆ける閃光 / Night-Sky Sprint — retake v4 |
| 第4面ボス | `stage-2` | 24 | 斜軸の氷冠 — Refracted Crown / retake 3 |

新しいUGE・イベント・譜面は `projects/touhou-kouma/assets-src/uge-stage4-retake-v4` に格納した。添付と同一バイトで、提供SHA256SUMSを照合した。UGEとイベントの全11,008セルも独立して照合し、一致した。旧曲は `assets-src/uge-bgm-v2` に保持している。

音楽以外のゲーム設定、7ステージの順序、全204画像、残り14曲、曲の場面割当、既存3リザルト曲はv46から変更していない。エンジン・ツール・GBC専用設定にも変更はない。提供READMEのGB Studio手順や添付ツールは、本作への導入指示として実行していない。

## 再編集とROM

`editor.cmd touhou-kouma` で「音楽」を開き、ID23／24を選択する。「ゲームへの割り当て」で第4面の道中／ボスに割当て、「保存」後にDebugまたはReleaseをビルドできる。UGEの音符編集は元UGEで行い、イベント・譜面・登録ハッシュを整合させる。

通常出力は `build/{Debug,Release}/touhou-kouma.gbc`。最新版の版付き出力は `touhou-kouma-v47.gbc`。ROMサイズ、SHA-256、最終検証結果は `projects/touhou-kouma/touhou-kouma-design/qa-v47.json` に記録する。

## 検証の範囲

正規Electronエディタの全16曲表示、設定変更・保存・再読込み・復元、結果曲編集のUndo、Debug／Releaseビルドを検証した。完成ROMは、通常の入力による第4面道中・ボスの練習経路で選曲・PCM出力・曲行進行・ポーズ無音化・復帰を検査した。魔理沙のボム中、効果音のCH1／CH4優先と、BGMのCH2／CH3および行進行の継続を確認した。BGBでも両経路の選曲・4チャンネルのポーズ無音化を確認した。

独立した診断ROMでは全16曲のループ先・2回の復帰、PCM出力、停止、SFX優先、ポーズをDMG／CGBで検査した。この診断ROMはゲーム本体ではなく、実ゲームの道中・ボス両曲を最後まで聴いた証拠にはしない。

生ログは `.cache/stage4-retake-20261013`。添付の音源検証・VALIDATIONは提供元の記録であり、上記のゲーム本体検証と区別する。

初回の `test.cmd` は6作品のDebugビルドに成功したが、UGE複製テストの準備処理が旧音源フォルダを固定していたため191件中1件が失敗した。試験用コピーを登録元ファイルから作るよう修正し、UGE関連4テストを再実行して合格した。その後 `test.cmd star-caravan` で、STARの再ビルド・TypeScript検査・同じ全191回帰テストを再実行し、191件すべて合格した。Doctorは警告0件。hello-gbのclean／Debug、STARと東方のDebug／Releaseも成功した。

第4面の死亡・復帰・ゲームオーバー（曲ID33）・コンティニューも通常の入力で検査し、コンティニュー後に新道中曲ID23が再開することを確認した。この経路はボス前にゲームオーバーとなったため、自然進行による道中→ボス切替の証拠にはしない。

Emuliciousは今回もEvaluateRequestがNullPointerExceptionで失敗し、実行の確認は成立していない。人間による試聴・音楽品質判断、GBC実機、全編連続クリア、自然進行での第4面道中からボスへの切替、ゲーム本体で両曲を末尾まで再生する検証は未実施。従来の処理落ちが改善したとは主張しない。
