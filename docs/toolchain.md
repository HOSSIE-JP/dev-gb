# ツールチェーン

固定版・取得URL・SHA-256・展開先は[`config/tools.lock.json`](../config/tools.lock.json)を参照してください。標準セットアップはWindows 10/11 x64用です。ライセンス条件は[外部ツール](third-party-tools.md)に記載しています。

| ツール | 役割 | 展開先 |
| --- | --- | --- |
| GBDK-2020 | Cコンパイラー、GBライブラリ、png2asset、romusage | `.tools/gbdk` |
| RGBDS | 独立したアセンブリ作品の開発 | `.tools/rgbds` |
| Node.js / Electron | エディターのビルド・実行 | `.tools/node` / `.tools/electron` |
| 美咲ゴシック | ROM用のかな・英数字フォント | `.tools/misaki` |
| BGB | ROMの確認・デバッグ | `.tools/bgb` |
| Emulicious + Java | Cソース、CPU、VRAM、OAMのデバッグ | `.tools/emulicious` |
| Visual Studio Code | ポータブルソースエディター | `.tools/vscode` |

BGBの公式x64 ZIP内の実行ファイル名は`bgb64.exe`です。ラッパーはこの実名を検出して起動します。

GBDK、RGBDS、VS Codeは公式に公開されたSHA-256を照合します。BGBとEmuliciousは公式チェックサムがないため、公式URLからの初回取得直後にSHA-256を計算してロックし、以後は必ず一致を要求します。URL、アーカイブ名、ハッシュ由来もロックへ保存します。

通常の`bootstrap.cmd`はロックを更新しません。`-Force`は同じ版を再取得・展開し、`-Offline`は検証済みキャッシュだけを使います。更新は`bootstrap.cmd -UpdateLock`だけで行い、差分、公式リリースノート、ライセンスを確認してからコミットしてください。

EmuliciousはJava同梱の公式Windows x64 ZIPを使うため、システムJavaや別の`.tools/java`は不要です。JavaはEmuliciousの配布ディレクトリ内に留まります。

ポータブルVS CodeにはMicrosoft C/C++とEmulicious Debuggerを導入し、版は`tools.lock.json`の`vscodeExtensions`にも記録します。通常bootstrapはその版を指定して導入し、`-UpdateLock`時だけMarketplaceの安定版を再解決します。

GBDK内のSDAS/SDCC系アセンブラとRGBDSのRGBASMは、構文・オブジェクト形式・リンカが別です。GBDK CプロジェクトへRGBDSオブジェクトを無検証で混ぜず、必要なら明確に別のビルド境界と変換手順を設計してください。

## 選択式セットアップ

`setup.cmd`を実行すると、基本ツールと任意ツールの利用条件・導入先を確認して導入できます。何も選ばずEnterを押すと基本ツールのみです。

基本ツールはGBDK、Node.js、Electron、美咲フォントです。エディターのnpm依存（Boytacean等）はロックファイルから復元します。BGB、Emulicious、RGBDS、VS Codeは任意です。

```bat
setup.cmd
bootstrap.cmd
bootstrap.cmd -OptionalTools bgb
bootstrap.cmd -OptionalTools "bgb,rgbds,vscode"
bootstrap.cmd -OptionalTools emulicious
bootstrap.cmd -OptionalTools bgb -List
```

`-List`は取得予定のURL・導入先・利用条件を表示し、取得・インストールしません。無人導入は`bootstrap.cmd`を使用します。`setup.cmd -OptionalTools bgb`も対話なしで同じ導入を行います。既存の任意ツールは、次回に選択しなくても削除しません。更新・修復の対象に含めたいときは再び選択してください。`-UpdateLock`も選択したツールだけを更新します。

Emuliciousは選択した場合だけ取得し、商用利用は利用者自身が権利者の許諾を確認します。VS Codeの拡張機能はVS Codeを選択した場合のみ導入し、`-SkipExtensions`で省略できます。`doctor.cmd`は未導入の任意ツールをエラーにしません。

## ポータブル環境の範囲

| 内容 | 保存場所 |
| --- | --- |
| SDK、Node、Electron、外部エミュレーター | `.tools/` |
| 元アーカイブ | `.downloads/` |
| npm依存 | `editor/node_modules/` |
| npmキャッシュ・ローカル設定 | `.cache/npm/`、`.cache/npm-*.npmrc` |
| セットアップ一時ファイル | `.cache/tmp/` |
| エディターの設定・SRAM・復旧・キャッシュ | `.cache/editor/` |
| VS Codeの設定・拡張 | `.tools/vscode/data/` |
| エミュレーターの作業ディレクトリ | `.cache/emulator/` |

セットアップと起動スクリプトはリポジトリ内の実行ファイルを使い、システムにSDK・Node・Java等をインストールしません。PATHやTEMPの変更は実行プロセスと子プロセスの範囲です。Windows 10/11 x64、PowerShell 5.1、ネットワーク接続は必要で、Git操作・診断にはGitを使用します。OSや第三者ツールが管理する一時情報まで含めて、ホストへの書込みが一切ないことを保証するものではありません。

フォルダーを移動した後も各スクリプトが自分の配置場所からパスを解決します。`.tools`や`.downloads`を含むコピーを他者へ配布する場合は、外部ツールの再配布条件が適用されます。公開用はソースとセットアップスクリプトを配布してください。
