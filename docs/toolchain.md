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
