# Third-Party Notices

本リポジトリは外部ツールのバイナリ、npmパッケージ、ROM、セーブをGitに含めません。セットアップ時に公式配布元から取得します。正確な版と取得元は`config/tools.lock.json`および`editor/package-lock.json`を参照してください。

- [外部ツールとライセンス一覧](docs/third-party-tools.md)
- [本リポジトリと成果物の利用・配布条件](docs/licensing.md)
- [エディターの第三者表示](editor/THIRD-PARTY-NOTICES.md)
- [オリジナル音楽のMIT License](engine/caravan/MUSIC-LICENSE.txt)

Emuliciousの商用利用、ツール一式の再配布、Boytacean WASMを含むHTML／アプリの配布には個別の確認事項があります。本リポジトリのオリジナル部分は[MIT License](LICENSE)です。第三者表示を同梱することだけで、権利未確認データの配布が許可されるわけではありません。

Windows EXEのアイコン・製品情報の設定には、ビルド時のみ `resedit` と `pe-library`（MIT）を使用します。これらを配布アプリの実行依存には含めません。専用アイコンと数字フォントは本リポジトリのオリジナルMIT素材です。
