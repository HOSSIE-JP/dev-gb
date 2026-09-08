# Portable Game Boy Development Kit

GB Studioを使わず、GBDK-2020のCでGame Boy／Game Boy Color向けHomebrewを作るWindows 10/11 x64用リポジトリです。SDK、エミュレータ、エディタはすべて`.tools`へポータブル配置され、システムPATH、レジストリ、管理者インストールを変更しません。低レベル検証用にRGBDSも同梱導線を用意しています。

## 収録プロジェクト

- `hello-gb`: ツールチェーン確認用の最小ROM。
- `star-caravan`: オリジナルの2分キャラバン縦STG。タイトル、プレイ、ゲームオーバー、ステージクリア、上位5件スコアボードを備え、単一ROMでDMG/GBCに対応します。

## 初回セットアップ

```bat
git clone <repository-url> gb-dev
cd gb-dev
bootstrap.cmd
doctor.cmd
```

`bootstrap.cmd`は`config/tools.lock.json`の版とSHA-256だけを公式配布元から取得します。通常実行では版を更新しません。キャッシュ済みZIPから再構築する場合は`bootstrap.cmd -Offline`、同じ版を修復する場合は`bootstrap.cmd -Force`、公式の新しい安定版へ明示更新する場合だけ`bootstrap.cmd -UpdateLock`を使います。

## ビルドと実行

日本語デスクトップ版 **Caravan Editor** を追加しました。`editor.cmd star-caravan`で、画像・スプライト・敵・弾幕・ボス・マップ・各画面を編集し、即時プレビュー、ROMビルド、内蔵Boytaceanでのプレイができます。作品の新規作成・複製、通常モードの複数ステージにも対応します。

[操作ガイドと制約](docs/caravan-editor.md) / [設計](docs/caravan-editor-architecture.md) / [検証記録](docs/caravan-editor-validation.md)

```bat
build.cmd hello-gb -Configuration Debug
build.cmd star-caravan -Configuration Release
run.cmd star-caravan -Emulator BGB
run.cmd star-caravan -Emulator Emulicious
test.cmd
clean.cmd -AllBuilds
```

Debugは`lcc -debug`でCDBなどのシンボルを生成し、EmuliciousやBGBでの解析に使います。Releaseはそのデバッグ指定を付けません。BGBは高速な動作・互換確認、EmuliciousはCソースレベルデバッグ、VRAM/OAM/CPU解析に向きます。

`shell.cmd`はそのcmd.exeだけにGBDK/RGBDS等のPATHとローカルTEMPを設定します。`vscode.cmd`は`.tools/vscode/data`を使う完全ポータブルなVS Codeでリポジトリを開きます。

### Caravan Editor のワークフロー

プロジェクト概要 → ステージ・素材を編集 → 診断を確認 → **F5でビルドしてプレイ**。全素材検索、Ctrl+Pのコマンドパレット、Undo/Redo、タイルパレット、直線・矩形描画、ROMの表示倍率・速度変更・書出に対応します。外部変更との保存競合、復旧コピー破損、古いROMの誤読込を検出します。

`editor`フォルダから`npm start -- star-caravan`でも起動できます。`npm run check`で型検査と利用可能な回帰テスト、`npm run build:release`で本番用アプリバンドルを生成します。Windowsのポータブル環境を対象とするGitHub Actionsも追加しています。

## 操作（star-caravan）

- 十字キー: 自機移動
- A / B: ショット（押し続け可能）
- START: 決定／開始

2分間に敵編隊を倒して得点を稼ぎ、後半に現れるコアボスの撃破を狙います。ボス撃破、または残機を保って時間満了するとクリアです。スコアボードはその起動中のRAM内上位5件で、電源を切るとリセットされます。

## ディレクトリ

```text
.tools/       取得・展開したポータブルツール（Git対象外）
.downloads/   検証済み配布ZIPのキャッシュ（Git対象外）
.cache/       一時領域とエミュレータ設定（Git対象外）
config/       版・URL・SHA-256ロック
scripts/      安全なPowerShell実装
editor/       Electron・React・TypeScriptのCaravan Editor
engine/       作品データを実行する共通GBDKランタイム
projects/     ROMプロジェクト、元アセット、生成物、build
tests/        ROMヘッダー等のスモークテスト
docs/         設計、デバッグ、アセット、実装規約
```

ツールのバイナリやROMはGitへ含めません。`bootstrap.cmd`で同じロック版を再現できます。エディタ依存は`editor/package-lock.json`の版・integrityで固定します。完全オフラインで再展開するには`.downloads`と`.cache/npm`もコピーしてください。

## Gitへ入れないもの

`.tools`、`.downloads`、`.cache`、`build`、`generated`の生成物、`.gb/.gbc`、デバッグ中間物、エミュレータのセーブ・ステート・設定はコミットしません。元画像や元データだけを`assets-src`へ置き、出典とライセンスを記録します。

## 既知の制限と次の段階

- スコアは現状RAM内のみで、カートリッジSRAMへは保存しません。
- GUIは手動確認、内蔵WASM ROMの論理と音声サンプルは自動検査します。実機DMG/CGBは未確認です。
- エディタ共通ランタイムには処理落ちが残り、ゲーム内120秒と実時間120秒の一致は未達です。容量や同時出現数の境界は操作ガイドを参照してください。
- VS Code拡張の導入失敗はブートストラップを止めません。推奨一覧から後で再試行できます。
- 次の発展候補は処理速度最適化、SRAMスコア保存、音楽パイプライン、実機CIです。

詳細は[ツールチェーン](docs/toolchain.md)、[構成](docs/architecture.md)、[デバッグ](docs/debugging.md)、[アセット](docs/asset-pipeline.md)、[GB実装規約](docs/gb-programming-rules.md)を参照してください。
