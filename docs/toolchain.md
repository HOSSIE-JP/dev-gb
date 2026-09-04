# ツールチェーン

実際の固定値は`config/tools.lock.json`を正とします。2026-09-05の初期構築では次を選定しました。

| ツール | 固定版 | 役割 | 公式配布元 | 展開先 |
|---|---:|---|---|---|
| GBDK-2020 | 4.5.0 | SDCC Cコンパイラ、GBライブラリ、`png2asset`、`romusage` | [GitHub Releases](https://github.com/gbdk-2020/gbdk-2020/releases/tag/4.5.0) | `.tools/gbdk` |
| RGBDS | 1.0.3 | RGBASM系の純アセンブリ開発・低レベル検証 | [GitHub Releases](https://github.com/gbdev/rgbds/releases/tag/v1.0.3) | `.tools/rgbds` |
| BGB x64 | 1.6.6 | 高精度動作確認とデバッガ | [公式サイト](https://bgb.bircd.org/) | `.tools/bgb` |
| Emulicious + Java x64 | ZIP内`WhatsNew.txt`の日付で固定 | Cソース、CPU、VRAM、OAMのデバッグ | [公式Downloads](https://emulicious.net/downloads/) | `.tools/emulicious` |
| Visual Studio Code x64 ZIP | 1.136.1 | ポータブルエディタ | [公式Download](https://code.visualstudio.com/Download) | `.tools/vscode` |

BGBの公式x64 ZIP内の実行ファイル名は`bgb64.exe`です。ラッパーはこの実名を検出して起動します。

GBDK、RGBDS、VS Codeは公式に公開されたSHA-256を照合します。BGBとEmuliciousは公式チェックサムがないため、公式URLからの初回取得直後にSHA-256を計算してロックし、以後は必ず一致を要求します。URL、アーカイブ名、ハッシュ由来もロックへ保存します。

通常の`bootstrap.cmd`はロックを更新しません。`-Force`は同じ版を再取得・展開し、`-Offline`は検証済みキャッシュだけを使います。更新は`bootstrap.cmd -UpdateLock`だけで行い、差分、公式リリースノート、ライセンスを確認してからコミットしてください。

EmuliciousはJava同梱の公式Windows x64 ZIPを使うため、システムJavaや別の`.tools/java`は不要です。JavaはEmuliciousの配布ディレクトリ内に留まります。

ポータブルVS CodeにはMicrosoft C/C++ 1.33.8とEmulicious Debugger 1.3.0を導入し、版は`tools.lock.json`の`vscodeExtensions`にも記録します。通常bootstrapはその版を指定して導入し、`-UpdateLock`時だけMarketplaceの安定版を再解決します。

GBDK内のSDAS/SDCC系アセンブラとRGBDSのRGBASMは、構文・オブジェクト形式・リンカが別です。GBDK CプロジェクトへRGBDSオブジェクトを無検証で混ぜず、必要なら明確に別のビルド境界と変換手順を設計してください。
