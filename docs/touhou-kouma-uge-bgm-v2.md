# 東方STG 新BGM16曲の統合・検証記録

対象は `C:\homebrew\projects\dev-gb` の `projects/touhou-kouma`。2026-10-08に、中断時の未コミット変更から継続した。開始時のHEADは `0160bd7bc220702dbdbc9090ea95fc5e9b1e0f23`。検証完了後、ユーザーの追加指示により統合ソース・元アセット・テスト・文書をコミット・pushする。ROM、元ZIP、キャッシュはコミット対象外とする。

## 保全と曲の割当

開始時の変更ファイルを `.cache/uge-integration-20261008/before/` に保存した。既存ROMも標準テストのclean前に `prior-roms/` に退避した。`bgm_v2.zip`、元UGE、イベントJSON、スコアJSON、旧MIDIと取り込みmanifestは保持した。

`game.json` は、今回変更した結果画面用楽譜 `musicTracks` を除く全内容が開始時と一致する。7ステージの順番、敵・弾幕・画像・動画・操作設定と中断時の新曲割当は保持している。16曲×3形式の48元ファイルは登録SHA-256と一致する。

| 場面 | UGE ID |
| --- | --- |
| タイトル／自機選択 | 16 |
| 1面 `stage-forest` 道中／ボス | 17 / 18 |
| 2面 `stage-lake` 道中／ボス | 19 / 20 |
| 3面 `stage-1` 道中／ボス | 21 / 22 |
| 4面 `stage-2` 道中／ボス | 23 / 24 |
| 5面 `stage-3` 道中／ボス | 25 / 26 |
| 6面 `stage-4` 道中／ボス | 27 / 28 |
| 7面 `stage-5` 道中／ボス | 29 / 30 |
| エンディング | 31（曲末停止） |

結果画面は従来の独立した楽譜をID32「夜明けの静かな神社」、ID33「灯へ帰る」、ID34「封印がほどける」に保持した。休符の後に単独で残っていた98個のタイを休符へ修正した。発音する音符と元のエンベロープは保持した。2声の結果曲を明示的に編集する際は、エディタの16段階音量形式へ変換する。閲覧のみでは元データを変更しない。

## 修正した内容

- `engine/caravan/music.h`：UGE無効時の `ce_uge_mute` 代替定義を実ファイルへ保存。非UGE作品のリンク失敗を解消した。
- `editor/src/node/music-data.ts`：保存した編集楽譜を優先し、UGEと従来曲のIDを分離。ID32～34を別のUGE曲へ勝手に置き換える処理を除去した。
- `editor/src/node/uge-export.ts`：各曲の登録UGEを直接読み、生成Cを作る。プロジェクト複製後も `CATALOG.json` の存在に依存しない。UGE内のFxxテンポ変更をイベントJSONと照合し、行ごとのテンポを1ビット表へ圧縮して16KiBバンクに収める。
- `engine/caravan/uge-player.c`：HOMEから音楽バンクを切り替え、再生後に元へ戻す。可変テンポに合わせた行進行、指定行へのループ、エンディングの停止を実装した。
- `engine/caravan/music.c`、`sound.c`：CH1の取得先を修正し、CH4も効果音へ貸す。継続中の効果音を同じ取得要求で消さない。ショット、長時間レーザーボム、取得終了時のBGM復帰を検証した。
- `engine/caravan/runtime.c`、`mainloop.c`：ポーズ中は効果音タイマーを止める。UGEに貸出中のCH1／CH4も明示的に無音化し、復帰時に持続効果音を再設定する。実ゲームのボム中ポーズで見つかった鳴り続ける問題を修正した。
- `editor/src/renderer/music-editor.tsx`、`index.tsx`：選択したUGE自身の曲名・テンポ・ループ情報を表示し、通常の場面割当を使えるようにした。UGE選択時に別曲の音符表や近似試聴を表示していた問題を修正した。
- `editor/src/shared/model.ts`、`music-project.ts`、`project-store.ts`：UGE登録、重複ID、元ファイルのSHA-256、保存・複製、撃破ファンファーレの非ループ条件を検査する。
- `editor/src/shared/music-score.ts`：保持した2声の結果曲を編集用に展開するときの音量を修正した。
- `docs/music-editor.md`：現在の16曲と3結果曲、UGEの設定・保存・再ビルド手順を記載した。

`hUGEDriver.h`、`hUGEDriver.lib` と `HUGE-LICENSE.txt` は中断時の依存物を保持した。libのSHA-256は `6c0a2664f7a6277293a9c1690f888dcecb086bdb9b9b4944831285bc5f9cac89`。取得元の正確なリリース版は本作業では確定していない。`.tools` の手編集・更新はしていない。

## 正規エディタでの操作

```bat
editor.cmd touhou-kouma
```

左側「音楽」→「編集する曲」で `(UGE)` 付きの曲を選択し、「ゲームへの割り当て」で場面を指定する。「この曲を割り当てる」→上部「保存」で確定し、DebugまたはReleaseを選択して「ビルド」を押す。再読込・複製後も登録元ファイルと曲設定を保持する。

UGEの音符・音色そのものは元 `.uge` をhUGETrackerで編集する。汎用エディタで行えるのはUGE曲の選択、場面設定、保存、再ビルド。UGEを従来の3声楽譜へ変換する機能は実装していない。対応する入力はUGE v6／VBlank再生／行テンポ最大2種類／終端のBxxジャンプ。Timer再生、途中のBxx／Dxx、独自routineなどは変換時に拒否する。元ファイルを変更する場合はイベント・スコア・SHA-256を整合させて再登録する必要がある。

## 検証と証拠の範囲

検証ログとJSONは `.cache/uge-integration-20261008/` に保存した。最終結果一覧は `final-results.json` を参照。

| 検証 | 結果と範囲 |
| --- | --- |
| `doctor.cmd` | 成功、警告0件。`doctor-final.log` |
| `clean.cmd hello-gb` / `build.cmd hello-gb -Configuration Debug` | 成功。`hello-clean.log` / `hello-debug.log` |
| `test.cmd` | 6作品のclean・Debugビルド・ROM smoke、TypeScript検査、回帰190件がすべて成功。失敗・skipとも0。`test-final.log` / `final-results.json` |
| `star-caravan` Debug／Release | 両方成功。Debugは標準テスト、Releaseは `star-release-final.log` |
| 正規Electronエディタ | 全16曲の表示、割当変更→保存→再読込→元の割当へ戻す操作に成功。最終UIソースで結果曲の編集・保存・Undoも成功。ゲームrevisionと元ハッシュの保持も確認。`ui/results.json` / `ui-source-final/results.json` |
| エディタのDebug／Release | 両方4,194,304バイト。同じ保存プロジェクトから同一ROMを生成。`ui/results.json` |
| 完成ROM、Boytacean CGB | 元ROMを改変せず、通常の入力のみで7面×道中・ボスの14曲の選択、CH2／CH3音声、曲行進行、ポーズ無音化・復帰を確認。`game-final/results.json` |
| 完成ROM、タイトル | 自機選択画面で2回のループと指定行への復帰を確認 |
| 完成ROM、1面 | 道中→ボス→ゲームオーバーの切替、死亡・復活、ID33の進行、コンティニュー後の道中曲復帰を確認。道中・ボス双方でレーザーボムのCH1／CH4音声とボム中ポーズの停止を確認 |
| 完成ROM、BGB | 14場面すべて成功。通常入力・読取用breakpointで期待する曲IDとポーズ中APUの無音化を確認。`bgb-final/results.json` |
| 別の診断ROM、DMG／CGB | 各23項目成功。全16曲のPCM出力、ループ曲の2巡、可変テンポ、曲末停止、同曲再指定、ショット／CH1取得、360tickの持続ボム、取得終了、ポーズを確認。`diagnostic/results.json` |
| Emulicious | 最終ROMの起動・DAP接続を試行したが、状態取得が `EvaluateRequest: NullPointerException`。接続成功をゲーム動作確認には数えていない。`emulicious-final/results.json` |

追加した試験は `editor/tests/uge-music.test.mjs`、`uge-ui.acceptance.cjs`、`uge-game.acceptance.mjs`、`uge-bgb.acceptance.mjs`、`uge-runtime.acceptance.mjs` と `fixtures/uge_music_harness.c`。既存のMIDI／エンディング試験も、保持した旧曲と現行UGEの役割を区別するよう更新した。

通常出力先の東方Debugは `test.cmd`、Releaseは `build.cmd touhou-kouma -Configuration Release` でも再生成し、正規エディタの両ビルドと同一ハッシュであることを確認した。SDCC警告110（定数条件を含む最適化での制御フロー変更）・126（到達不能コード）は一部構成で残っている。抑制せず全ログに保存した。`doctor`の警告0件は、これらのコンパイラ警告が0件という意味ではない。

自動入力による追加検証を再実行する場合の例：

```bat
.tools\node\node.exe editor\tests\uge-game.acceptance.mjs projects\touhou-kouma\build\Debug\touhou-kouma.gb .cache\uge-game-recheck
.tools\node\node.exe editor\tests\uge-bgb.acceptance.mjs projects\touhou-kouma\build\Debug\touhou-kouma.gb .cache\uge-bgb-recheck
.tools\node\node.exe editor\tests\uge-runtime.acceptance.mjs
.tools\electron\electron.exe editor\tests\uge-ui.acceptance.cjs
```

UGE UI試験は作品と必要なローカルツールを `.cache` 内へコピーし、実Electron画面へキー・マウス入力を送り、保存結果を検査して正規コンパイラを起動する。診断ROM試験の出力先はスクリプトの既定値を使う。BGB／Emuliciousの起動は、この作業環境のGUI制限を越える実行許可が必要だった。

診断ROMの全曲PCM・ループ成功は、完成ROMの全曲を人が聴いた証拠にはならない。完成ROMではタイトルと14道中／ボス曲の実動作を確認した。7面通しクリアからエンディング曲ID31へ到達するプレイ、完成ROMで各道中・ボス曲を曲末まで流す長時間試験、人間による聴感・音量バランス・コントローラー評価、実機CGBは未検証。作品自体は元からCGB専用であり、診断ROMのDMG成功は作品のDMG対応を意味しない。

## 最終ROM

通常の出力先は次の2つ。両構成のROM SHA-256は `4bf64e8aa3e85f6401fd98d3b977adc3d7167dbfcccb1dbe4fa7af93e05b99bb`。

- `projects/touhou-kouma/build/Debug/touhou-kouma.gb`
- `projects/touhou-kouma/build/Release/touhou-kouma.gb`

正規エディタのビルドmanifest、MAP、シンボル類も出力とともに保持した。cleanで消えた既存ROM38ファイルを、今回再生成した通常ROMを上書きしない形で戻した。退避コピーも保持している。
