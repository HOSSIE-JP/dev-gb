# Game Boy Development Kit / Caravan Editor

Game Boy／Game Boy Color向けのゲームを制作する、Windows 10/11 x64用のポータブル開発環境です。日本語GUIの **Caravan Editor** で縦・横スクロールSTGを編集し、GBDK-2020でROMをビルドして、内蔵エミュレーターでプレイできます。取得アイテム、段階強化、破壊可能BGにも対応します。Cで直接開発するプロジェクトと、独立したRGBDSアセンブリプロジェクトにも対応します。

## Windowsアプリを使う

[GitHub Releases](https://github.com/HOSSIE-JP/dev-gb/releases)から `Caravan-Editor-win-x64.zip` をダウンロードし、書込み可能なフォルダーへ全体を展開して `Caravan-Editor.exe` を起動します。Gitのクローン、Python、npmによるビルドは不要です。

初回のセットアップ画面でGBDK・実行用Node.js・日本語フォント・内蔵エミュレーターを取得します。「ツール」メニューから再セットアップ、外部エミュレーターの追加、試遊HTMLの書出しができます。アプリと同じフォルダーに制作環境と作品を保存するため、移動・バックアップはフォルダー全体で行ってください。Windows x64、Windows PowerShell 5.1、初回取得時のインターネット接続が必要です。

以下はソースから開発する場合の手順です。

ツールは公式配布元からリポジトリ内の`.tools`へ取得します。管理者インストール、恒久的なPATH変更、システムJavaは不要です。

> **ライセンス:** オリジナルのコード・文書・スキル・サンプルは[MIT](LICENSE)です。外部ツールは利用者がセットアップで公式配布元から取得し、各ツールの利用条件に従います。[ライセンスと配布](docs/licensing.md)も参照してください。

## ソースから開発する

Gitを用意し、Windowsのコマンドプロンプトから実行してください。

```bat
git clone https://github.com/HOSSIE-JP/dev-gb.git
cd dev-gb
setup.cmd
doctor.cmd
.tools\node\npm.cmd --prefix editor run build
editor.cmd nova-spear
```

エディターの「新規作品」でテンプレートを選び、独立した作品を作成します。画像・敵・弾幕・ボス・ステージ・画面を編集し、**F5**で保存・ビルド・プレイできます。元作品を編集する場合は、先に「作品を複製」しておくと比較しやすくなります。

### エディターをソースから開発する

`bootstrap.cmd` はロック済みのNode.js・Electron・GBDK・美咲フォントを`.tools`へ展開し、`editor/package-lock.json`から依存をインストールして、初回の開発ビルドまで行います。ソースを変更した後は、リポジトリ内のNode.jsを明示して開発ビルドできます。

```bat
.tools\node\npm.cmd --prefix editor run build
.tools\node\npm.cmd --prefix editor run typecheck
editor.cmd star-caravan
```

`editor.cmd`は開発ビルド済みのCaravan EditorをポータブルElectronで起動します。エディターの回帰検証は`.tools\node\npm.cmd --prefix editor run check`、全作品のクリーンビルド・ROMスモーク検査・エディター検証は`test.cmd`で実行します。BGBは任意ツールのため未導入時は`test.cmd`でもBGBスイートをINFOとして省略します。BGBの検証も行う場合は`setup.cmd`でBGBを選択してから`test.cmd`を再実行してください。

[エディター操作ガイド](docs/caravan-editor.md) / [AIによるゲーム制作](docs/ai-authoring.md) / [セットアップ詳細](docs/toolchain.md)

## サンプル

| プロジェクト | 内容 |
| --- | --- |
| [SIDE CARAVAN](projects/side-caravan/README.md) | 約3分の横スクロール道中＋ボス、4段階ショット、5種類のアイテム、281個の破壊BG。 |
| [NOVA SPEAR](projects/nova-spear/README.md) | 3ステージ、2種類のショット、多段階ボス、撃破演出・ファンファーレ、SRAMランキング。時間制限のないSTGテンプレート。 |
| [STAR CARAVAN](projects/star-caravan/README.md) | 1ステージ・2分制のキャラバンSTGテンプレート。SRAMランキングに対応。 |
| [CARAVAN LAB](projects/caravan-lab/README.md) | 地形・敵・自機設定を試せる編集サンプル。 |
| [hello-gb](projects/hello-gb/README.md) | Cプロジェクトの最小ビルドサンプル。 |

## コマンド

リポジトリのルートで実行します。

```bat
build.cmd nova-spear -Configuration Release
run.cmd nova-spear -Emulator BGB
build.cmd hello-gb -Configuration Debug
test.cmd
shell.cmd
vscode.cmd
```

Debugはデバッグ用シンボルを生成します。Releaseは配布用のビルド構成です。ROMは`projects/<作品ID>/build/<構成>/`に出力します。`shell.cmd`は開いたシェル内だけのツール設定、`vscode.cmd`はポータブルVS Codeの起動です。

`setup.cmd`は任意ツールを選べる対話セットアップです。`bootstrap.cmd`は基本ツールのみを無人導入します。BGBを追加する場合は`bootstrap.cmd -OptionalTools bgb`、複数なら`bootstrap.cmd -OptionalTools "bgb,rgbds,vscode"`を使用します。Emuliciousは明示選択時だけ取得します。

`bootstrap.cmd -Offline`は取得済みキャッシュからの再展開、`-Force`は固定版の再取得・修復、`-UpdateLock`は公式安定版への更新です。通常のセットアップはロックを更新しません。

## 対応範囲

- 標準セットアップとデスクトップアプリの対象はWindows 10/11 x64です。
- 出力ROMはDMG/GBC共通。GB画面は160×144、ハードウェアのOAMは40個、1走査線は最大10スプライトです。
- 混雑時はゲームの進行が遅くなります。ゲーム内タイマーと実時間の一致は保証しません。
- スコア保存にはMBC5＋8KiB RAM＋バッテリー相当の保存機能が必要です。
- 即時プレビューは論理シミュレーションです。描画・音・撃破演出・保存の確認にはビルドしたROMを使います。
- 自動テストは実機動作の保証ではありません。公開するROMは対象の実機・エミュレーターでも確認してください。

## 開発・配布

人が編集するデータは`projects/<作品ID>/assets-src`、共通ランタイムは`engine/caravan`、エディターは`editor`です。ツールの版・URL・SHA-256は`config/tools.lock.json`、npm依存は`editor/package-lock.json`で固定します。ツール本体、キャッシュ、ROM、セーブ、生成CはGit管理しません。

- [構成と設計](docs/architecture.md)
- [横スクロール・取得アイテム・破壊BG](docs/horizontal-stg.md)
- [アセット制作](docs/asset-pipeline.md)
- [デバッグ](docs/debugging.md)・[自動検証と受入確認](docs/caravan-editor-validation.md)
- [SRAM仕様](docs/caravan-sram.md)・[性能測定](docs/nova-spear-performance.md)
- [コントリビューション](CONTRIBUTING.md)・[Game Boy実装規約](docs/gb-programming-rules.md)
- [第三者ソフトウェア](THIRD_PARTY_NOTICES.md)・[利用と再配布の条件](docs/licensing.md)
- [開発日記：弾を増やしたいだけなのに](docs/development-diary.md) — 試行錯誤、効かなかった施策、検証で苦労したことの記録。
