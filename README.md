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
projects/     ROMプロジェクト、元アセット、生成物、build
tests/        ROMヘッダー等のスモークテスト
docs/         設計、デバッグ、アセット、実装規約
```

ツールのバイナリやROMは大きく、利用条件も個別で、別PCではCPU/OSに合う配布物の検証が必要なためGitへ含めません。追跡ファイルだけをクローンまたはコピーし、`bootstrap.cmd`を実行すれば同じロック版を再現できます。完全オフラインで再構築するには、同じ`.downloads`も別途安全にコピーしてください。

## Gitへ入れないもの

`.tools`、`.downloads`、`.cache`、`build`、`generated`の生成物、`.gb/.gbc`、デバッグ中間物、エミュレータのセーブ・ステート・設定はコミットしません。元画像や元データだけを`assets-src`へ置き、出典とライセンスを記録します。

## 既知の制限と次の段階

- スコアは現状RAM内のみで、カートリッジSRAMへは保存しません。
- GUIの見た目と音声は自動テスト対象外です。BGBとEmuliciousに加え、配布前はDMG/CGB実機で確認してください。
- VS Code拡張の導入失敗はブートストラップを止めません。推奨一覧から後で再試行できます。
- 次の発展候補はSRAMスコア保存、hUGETracker等の再現可能な音楽パイプライン、複数ステージ、実機CIです。

詳細は[ツールチェーン](docs/toolchain.md)、[構成](docs/architecture.md)、[デバッグ](docs/debugging.md)、[アセット](docs/asset-pipeline.md)、[GB実装規約](docs/gb-programming-rules.md)を参照してください。
