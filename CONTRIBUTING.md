# コントリビューションガイド

このリポジトリは、Windows上でポータブルに再現できるGame Boy開発環境と、その上で動くGBDK-2020製サンプルを管理する。主対象はDMG互換、追加対象はGBCである。GB Studio、管理者権限、システムインストール、恒久的なPATH変更を前提にしない。

作業を始める前に `AGENTS.md` と関連する `docs` を読むこと。ツールの正確な版と取得元は [`config/tools.lock.json`](config/tools.lock.json) が基準であり、文書やソースへ重複して固定しない。

## セットアップ

Windows 10/11 x64の `cmd.exe` から、次を実行する。

```bat
bootstrap.cmd
doctor.cmd
```

`bootstrap.cmd` は公式配布物をリポジトリ内の `.tools` へ展開する。システムPATH、ユーザー／システム環境変数、レジストリは変更しない。現在のシェルだけでツールを直接使う場合は次を利用する。

```bat
shell.cmd
```

ポータブルVS Codeは次で開く。

```bat
vscode.cmd
```

`.tools` を手動で編集して動作を合わせない。壊れた取得物は `bootstrap.cmd -Force` で同じロック版を復元し、版更新が必要なときだけ `bootstrap.cmd -UpdateLock` を使う。ロック更新は通常の機能変更と分けてレビューする。

## ブランチとコミット

- 1つの変更目的ごとに小さなブランチとコミットへ分ける。
- コミットメッセージは、例として `feat: add enemy wave`、`fix: clamp player movement`、`docs: explain sprite budget` のように目的が分かる形にする。
- 既存の利用者変更を破棄しない。`git reset --hard`、`git clean -fdx`、履歴書換え、強制pushを通常作業で行わない。
- 無関係な整形、改名、生成物更新を同じ差分へ混ぜない。
- Gitのglobal設定やidentityをこのリポジトリの作業から変更しない。
- コミット前に `git status --short` と `git diff --check` を確認する。

## プロジェクトの追加・変更

各ゲームは `projects/<name>` に置き、`project.json` をビルド宣言の入口にする。人が編集するものと生成物を次のように分離する。

```text
src/            Cまたはアセンブリのソース
include/        プロジェクト内ヘッダー
assets-src/     編集可能な元アセット
generated/      再生成可能な変換結果
build/          ROMと中間生成物
project.json    対象、ツールチェーン、出力、ソースの宣言
```

主系統はGBDKの `lcc` でビルドするCプロジェクトである。RGBDSは純アセンブリや低レベル検証の別系統として扱う。RGBASM構文とGBDKのSDAS系構文、双方のオブジェクト形式とABIを同一視しない。GBDKプロジェクトへRGBDSオブジェクトを混ぜる変更は、互換性を公式資料と最小検証で証明できない限り受け入れない。

## `star-caravan` の基本仕様

`projects/star-caravan` は、1ステージ・2分制のキャラバン型STGサンプルである。変更時は少なくとも次を維持する。

- タイトル、ゲーム、ポーズ、ゲームオーバー、クリア、スコアボードへ到達できる。
- 十字キー移動、A/B射撃、STARTポーズが一貫して動く。
- 残機3、雑魚ウェーブ、終盤ボス、得点、タイマーが機能する。
- 時間切れまたはボス撃破でクリア、全滅でゲームオーバーになる。
- 上位5スコアは2スロット＋CRC付きSRAMへ保存し、再起動後に復元する。
- 単一ROMがDMGとGBCの両方で動き、CGB固有色がなくても情報を判別できる。

仕様を変える場合は、プロジェクトREADME、操作説明、テスト、CHANGELOGも同じ変更で更新する。

## CとGame Boy固有の規約

詳細は [`docs/gb-programming-rules.md`](docs/gb-programming-rules.md) を参照する。レビューでは特に次を確認する。

- SDCC/GBDKが固定版で対応するC機能だけを使う。
- 動的メモリ、浮動小数点、再帰、大きなスタック確保を避ける。
- 整数の幅と符号を明示し、オーバーフローと暗黙変換を確認する。
- VRAM/OAMは安全な期間またはGBDKの安全なAPIを通して更新する。
- ISRを短くし、共有状態の `volatile` と同期方法を明示する。
- OAMの40個上限、1走査線上のOBJ上限、タイル／VRAM容量を予算化する。
- MBCは必要なROM容量と保存仕様に合わせる。Caravan作品はSRAMのため、32KiBでもMBC5を使用する。
- DMG互換処理とCGB専用処理を混同しない。
- 固定版GBDKの公式APIと一次仕様を優先し、古い例を無検証でコピーしない。

## アセットとライセンス

詳細は [`docs/asset-pipeline.md`](docs/asset-pipeline.md) を参照する。

- PNGなどの原本は `assets-src` に置き、変換結果は `generated` に置く。
- 生成されたC/H/BINを直接編集しない。
- 変換コマンドをスクリプト化し、固定された `png2asset` で再現できるようにする。
- 自作でない画像、音楽、効果音、フォント、コードには、作者、出典URL、ライセンス、必要な帰属、改変内容を記録する。
- ライセンスが不明、またはGame Boy ROMとしての再配布を許可しているか不明な素材を追加しない。
- 他作品の名称や見た目を参考にしても、画像、音、マップ、コードを転載しない。
- 新しい外部ツールを必須にする前に、公式配布元、安定版、ライセンス、ポータブル利用、固定方法を確認する。

## ビルドとテスト

最小の疎通確認は `hello-gb`、ゲーム変更の確認は `star-caravan` で行う。

```bat
doctor.cmd
clean.cmd hello-gb
build.cmd hello-gb -Configuration Debug
clean.cmd star-caravan
build.cmd star-caravan -Configuration Debug
build.cmd star-caravan -Configuration Release
test.cmd
```

ゲームプレイ変更では、加えて両エミュレーターで確認する。

```bat
run.cmd star-caravan -Emulator BGB
run.cmd star-caravan -Emulator Emulicious
```

DMGモードとCGBモードの双方で、起動、全シーン、操作、得点、タイマー、全滅、ボス撃破、時間切れ、スコア順位を確認する。可能なら実機でも検証する。GUIまたは実機確認を実行できない場合は、未確認事項と再現コマンドをレビュー説明へ記載する。

ビルドエラーや警告を抑止して通したことにしない。コンパイラやリンカーの新しいオプションを追加する場合は、固定版の公式資料または同梱例を根拠として示す。

## コミットしないもの

次はローカル取得物または生成物であり、コミットしない。

- `.tools/`、`.downloads/`、`.cache/`
- 各プロジェクトの `build/` と `generated/` 内の自動生成物
- `.gb`、`.gbc`、オブジェクト、マップ、シンボル、依存ファイル
- BGB/Emuliciousの設定、セーブ、RTC、ステート、ログ
- ポータブルVS Codeの `data/` と拡張機能本体
- ローカル上書き設定、資格情報、トークン

一方、ソース、ヘッダー、元アセット、変換スクリプト、`project.json`、VS Code共有設定、文書、`config/tools.lock.json` は再構築に必要なため追跡する。

## プルリクエスト／レビューの記載事項

変更の説明には次を含める。

- 何を、なぜ変更したか。
- DMGとCGBへの影響。
- ROM/RAM、タイル、OAM、フレーム時間への顕著な影響。
- 実行したコマンドと結果。
- エミュレーターまたは実機で確認したシーン。
- 未実行項目、その理由、残るリスク。
- 新しい外部アセットやツールの出典とライセンス。
