# 編集用素材

`game.json`と`images`の4階調PNGがゲームの編集元です。v0.3の自機、バリア機、雑魚3種、施設タイル、BGボスはImage Genの新規原画から制作しました。原画6枚、生成時のプロンプト、SHA-256、変換方式は[imagegen-v03](imagegen-v03/README.md)に保存しています。

自機24×16・各4コマ、雑魚16×16・各2コマ、ボス80×80のデザイン・2コマ、施設8×8タイル64個です。原画の高解像度画像をそのままROMへ入れるのではなく、4色の色番号と実ピクセルへ変換しています。

アイテム、弾、爆発、タイトル・結果・旧ボム画像は既存のオリジナル素材を保持しています。ボムはパレット点滅で動作します。道中は1マップ・285個の破壊物です。商用ゲームの画像・音楽・マップは使っていません。

新曲ID35／36／37はタイトル／道中／ボス用のオリジナル譜面です。`engine/caravan/assets-src/side-score.json`で編集できます。クリア6、ゲームオーバー7、撃破ファンファーレ8は既存曲です。曲とライセンスは`engine/caravan/assets-src/side-score.md`および`engine/caravan/MUSIC-LICENSE.txt`を参照してください。

制作レシピは`editor/scripts/create-side-caravan.cjs`、`revise-side-caravan-v02.cjs`、`revise-side-caravan-v03.cjs`です。旧版からの一度だけの変換用で、通常の保存・ビルドでデータを作り直すことはありません。オリジナル部分はルートのMIT Licenseに従います。
