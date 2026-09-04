# AGENTS.md

## 目的と適用範囲

このリポジトリは、GB Studioを使わず、GBDK-2020のCを主軸にGame Boy／Game Boy Color向けHomebrewを開発するためのポータブル環境です。必要な場合だけGBDK対応アセンブリ、または独立したRGBDSプロジェクトを使います。DMG互換を第一対象とし、原則としてリポジトリ外を変更しないでください。

`.tools`は取得物です。手編集・コミットをせず、`config/tools.lock.json`なしに版を変更しないでください。管理者権限、グローバルPATH、恒久環境変数、レジストリ、Gitのglobal設定に依存してはいけません。

## 標準コマンド

```bat
bootstrap.cmd
doctor.cmd
build.cmd
test.cmd
run.cmd
clean.cmd
shell.cmd
vscode.cmd
```

プロジェクト名は第1引数です。例: `build.cmd star-caravan -Configuration Debug`。

## C実装規約

- SDCC／GBDKが実際に対応するC機能と公式GBDK APIだけを使う。PC向けコンパイラで通ることだけを根拠にしない。
- 浮動小数点、`malloc`／`free`、再帰、大きなローカル配列を原則使わない。
- 8／16／32bit整数の範囲と符号を意識し、暗黙変換、オーバーフロー、毎フレームの32bit演算を避ける。
- `printf`は診断と最小サンプルに限定し、ゲームでは専用タイル描画を使う。
- 責務と型が明確な小さな関数を優先し、未使用コードや未使用データを残さない。

## Game Boy固有規約

- VRAM、OAM、LCDレジスタはVBlank中、LCD停止中、またはGBDKの安全なAPI経由で更新する。
- 割り込みは短く保ち、割り込み共有値には`volatile`と明確な同期方針を使う。
- OAM 40個、1走査線10個、タイル数、VRAM容量、小さいスタックを常に考慮する。
- 32KiBを超えるまではMBCなしを優先する。バンキングの責務を局所化し、遠隔関数・データ参照を無警戒に混在させない。
- SRAMでは書込み有効化と電源断を考慮する。DMG互換機能とCGB専用機能を混同しない。
- BGBだけでなくEmulicious、最終的にはDMG/CGB実機でも確認する。

## アセット規約

- 人が編集する元データは`assets-src`、自動生成物は`generated`へ置く。
- 生成C／H／BINを手編集しない。変換はGBDKの`png2asset`を第一候補とし、コマンドとオプションを再現可能にする。
- 2bpp、8x8タイル、パレット、メタスプライト構造を意識し、元アセットの出典とライセンスを記録する。

## ビルド・Git規約

- 変更後は最低限`build.cmd`と`test.cmd`を実行し、エラーや警告を隠さない。
- Debug／Releaseを混同せず、版依存オプションは同梱資料または公式文書で検証する。
- `.tools`、`.downloads`、ROM、セーブ、ステート、ビルド出力、生成物をコミットしない。
- 無関係な変更やユーザー変更を破棄しない。`git reset --hard`、`git clean -fdx`、履歴書換え、force pushは禁止。
- コミットは小さく目的を明確にし、バイナリ元アセットのライセンスを確認する。
- GBDKのSDAS/SDCC系ASMとRGBDS ASMは別構文・別ツールチェーンであり、オブジェクトを無検証で混在させない。

## 完了前の検証

```bat
doctor.cmd
clean.cmd hello-gb
build.cmd hello-gb -Configuration Debug
test.cmd
```

ゲーム変更時は`star-caravan`のDebug／Releaseもビルドし、BGBとEmuliciousの両方で確認してください。実行できない項目は、未実行理由と残るリスクを報告してください。
