# 外部ツールと依存ライブラリ

版・取得URL・SHA-256は[`config/tools.lock.json`](../config/tools.lock.json)、npm依存の正確な版とintegrityは[`editor/package-lock.json`](../editor/package-lock.json)で固定します。ここでは利用条件を整理します。

| 名称 | 条件・注意点 | 根拠 |
| --- | --- | --- |
| GBDK-2020 / SDCC | 複合ライセンス。ライブラリはGPLv2＋リンク例外、SDCC等の開発ツールはGPL、png2assetはMITなど。ツール再配布と生成ROMを分けて扱う | [固定版LICENSE](https://github.com/gbdk-2020/gbdk-2020/blob/4.5.0/LICENSE)、`.tools/gbdk/licenses/` |
| RGBDS | MIT。再配布時に著作権・許諾表示を保持 | [固定版LICENSE](https://github.com/gbdev/rgbds/blob/v1.0.3/LICENSE) |
| BGB | 独自配布。明確な再配布許諾を確認できていないため、公式配布元からの取得を案内 | [公式サイト](https://bgb.bircd.org/)、[マニュアル](https://bgb.bircd.org/manual.html) |
| Emulicious | 個人・非商用freeware。商用利用は事前許諾が必要。非商用のバイナリ再配布にも表示保持が必要 | [公式License.txt](https://emulicious.net/License.txt) |
| Emulicious同梱Java | Javaランタイム自身の条件を別途適用。Emuliciousの許諾だけで一式の再配布を判断しない | 取得ZIP内のJavaの`legal` / `LICENSE`等。一般配布は本プロジェクトの対象外 |
| Visual Studio Code製品バイナリ | Microsoft Software License Terms。ソースのMITと製品バイナリの条件は異なる | [製品ライセンス](https://code.visualstudio.com/license) |
| Microsoft C/C++拡張 | 拡張固有のMicrosoft条項。VS Code本体と別の条件 | [公式リポジトリのLicense](https://github.com/microsoft/vscode-cpptools/blob/main/License.txt)、取得VSIX |
| Emulicious Debugger拡張 | パッケージ表記はMIT。拡張の許諾はEmulicious本体の商用許諾を代替しない | [Marketplace](https://marketplace.visualstudio.com/items?itemName=emulicious.emulicious-debugger)、取得VSIX |
| Node.js / Electron | MITと同梱第三者コンポーネントの複合条件。Chromium等の表示も必要 | `.tools/node/LICENSE`、`.tools/electron/LICENSE`、`LICENSES.chromium.html` |
| React / React DOM / scheduler / pngjs | MIT。バンドルにも法文と著作権表示を同梱 | 固定npmパッケージの`LICENSE`と生成する`editor/build/THIRD-PARTY-LICENSES.txt` |
| Boytacean | パッケージはApache-2.0。ただし埋込み起動ROMに配布確認事項あり | [LICENSE](https://github.com/joamag/boytacean/blob/0.13.2/LICENSE)、[配布確認事項](licensing.md) |
| Bootix | CC0-1.0 | [公式LICENSE](https://github.com/Hacktix/Bootix/blob/master/LICENSE)、[同梱法文](../licenses/CC0-1.0.txt) |
| Boytacean CGB起動コード | SameBoy由来。Expatの著作権・許諾表示を保持 | [出典](https://github.com/joamag/boytacean/blob/0.13.2/src/boot/README.md)、[法文](../licenses/SameBoy-LICENSE.txt) |
| TypeScript | Apache-2.0。開発用 | 固定npmパッケージの`LICENSE.txt` |
| esbuild / Prettier / 型定義依存 | MIT（TypeScriptのプラットフォーム別パッケージはApache-2.0）。開発用 | 固定npmパッケージの法文・lockfile |
| 美咲ゴシック | 独自の寛容なフォント許諾。改変・複製・商用／非商用の再配布を許可、無保証 | [公式サイト](https://littlelimit.net/misaki.htm)、`.tools/misaki/misaki.txt` |

任意の原画再生成に使うPython/Pillow、動画編集に使うFFmpegなどは標準bootstrapの同梱物ではありません。それらの実行環境を配布する場合は別途、そのビルドと依存物のライセンスを確認してください。完成画像や動画の権利と、ツール実行ファイルの権利は別です。

この一覧は依存物を本リポジトリのライセンスで再許諾するものではありません。ライセンス不明の素材を追加せず、取得物の著作権表示を削除しないでください。
