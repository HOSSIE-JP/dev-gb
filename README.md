# Game Boy Development Kit / Caravan Editor

Game Boy／Game Boy Color向けのゲームを制作する、Windows 10/11 x64用のポータブル開発環境です。日本語GUIの **Caravan Editor** で縦スクロールSTGを編集し、GBDK-2020でROMをビルドして、内蔵エミュレーターでプレイできます。Cで直接開発するプロジェクトと、独立したRGBDSアセンブリプロジェクトにも対応します。

ツールは公式配布元からリポジトリ内の`.tools`へ取得します。管理者インストール、恒久的なPATH変更、システムJavaは不要です。

> **ライセンス:** オリジナルのコード・文書・スキル・サンプルは[MIT](LICENSE)です。外部ツールは利用者がセットアップで公式配布元から取得し、各ツールの利用条件に従います。[ライセンスと配布](docs/licensing.md)も参照してください。

## はじめる

Gitを用意し、Windowsのコマンドプロンプトから実行してください。

```bat
git clone https://github.com/HOSSIE-JP/dev-gb.git
cd dev-gb
setup.cmd
doctor.cmd
editor.cmd nova-spear
```

エディターの「新規作品」でテンプレートを選び、独立した作品を作成します。画像・敵・弾幕・ボス・ステージ・画面を編集し、**F5**で保存・ビルド・プレイできます。元作品を編集する場合は、先に「作品を複製」しておくと比較しやすくなります。

[エディター操作ガイド](docs/caravan-editor.md) / [AIによるゲーム制作](docs/ai-authoring.md) / [セットアップ詳細](docs/toolchain.md)

## サンプル

| プロジェクト | 内容 |
| --- | --- |
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
- [アセット制作](docs/asset-pipeline.md)
- [デバッグ](docs/debugging.md)・[自動検証と受入確認](docs/caravan-editor-validation.md)
- [SRAM仕様](docs/caravan-sram.md)・[性能測定](docs/nova-spear-performance.md)
- [コントリビューション](CONTRIBUTING.md)・[Game Boy実装規約](docs/gb-programming-rules.md)
- [第三者ソフトウェア](THIRD_PARTY_NOTICES.md)・[利用と再配布の条件](docs/licensing.md)
