# NOVA SPEAR ピクセルアート原本

ゲーム用の4色ピクセル原画と、紹介用キービジュアルを管理します。ゲーム原画は独自のピクセル配列・図形で構成しています。

- 制作: NOVA SPEAR project（AIによる制作支援を使用）
- ライセンス: **MIT**。このディレクトリのオリジナル図案と `../images/*-f*.png` に[ルートLICENSE](../../../../LICENSE)を適用します。
- ゲーム原画の出典: `build_art.py` に記述した独自のピクセル配列と整数座標図形。
- `nova-spear-key-art.png`: AI生成の紹介用イラストです。ゲーム内PNGとは別素材で、`build_art.py`の出力ではありません。
- 許諾は提供者が保有する権利の範囲に限られ、独占権や第三者の商標権を保証するものではありません。既にCC0で提供した版への許諾は撤回しません。
- アンチエイリアス・自動減色・拡縮なし。PNG はインデックスカラー、各フレームが独立した画像です。

通常のゲームビルドは保存済み PNG を使用します。Python/Pillow は図案を再生成するときだけ必要です。エディターで変更した PNG を保持する場合は、その画像を別途保存するか図案へ変更を戻してから再生成してください。

```sh
python projects/nova-spear/assets-src/art/build_art.py
```

`manifest.json` にはアセット ID、サイズ、フレーム、原点、当たり判定、発射位置、パレットの役割、背景タイルの配置対応を記録しています。`paletteRole` は制作資料用の属性です。ゲームの `assets-src/game.json` へ取り込む際に `palette` 番号へ変換します。

| 色番号 | PNG の RGB | ゲーム上の役割 |
| --- | --- | --- |
| 0 | 255,255,255 | OBJ 透明 / 背景の最暗部 |
| 1 | 170,170,170 | 暗い輪郭・遠景・構造物 |
| 2 | 85,85,85 | 本体色・中間色 |
| 3 | 0,0,0 | ハイライト・発光部 |

PNG の濃淡は変換時の**色番号**を固定するための符号です。ゲームの CGB パレットは暗→明で割り当て、DMG の BGP/OBP は `0x1b` にします。これにより宇宙は黒、星と弾の中心は白となり、CGB と DMG の明暗が一致します。

## 素材予算

| 種別 | 使用量 |
| --- | --- |
| 常駐 OBJ | 97 / 128 タイル |
| 背景セット | 64 タイル × 3 セット（ステージ切替時にロード） |
| タイトル背景 | 重複排除後 43 タイル |
| クリア背景 | 重複排除後 32 タイル |
| ゲームオーバー背景 | 重複排除後 28 タイル |

大ボスは 32×32 = 16 OBJ、自機は 16×16 = 4 OBJ です。すべての射撃アセットに発射位置を一つだけ設定し、パターンの弾数をそのまま使用します。自機の当たり判定は中央の 6×7px、敵弾は中央の 4×4px です。

背景は細かい模様を全面に敷かず、中央の航路を空けて左右に大きな構造物を置く設計です。4×4 / 4×2 モジュールのタイル番号は `manifest.json` の `tilesetRoles` を参照してください。タイトルの NOVA SPEAR ロゴのみ背景へ描画済みで、操作説明・得点・画面見出しはエディターの画面テキストで重ねます。

## 宣伝用キービジュアル

`nova-spear-key-art.png` はOpenAI ImageGenで本作向けに生成したオリジナルの宣伝イラストです。ゲーム中の160×144px画面や、ビルドに使うピクセル原画とは別の画像です。本リポジトリで提供するオリジナル画像としてMITで利用できます。

生成指示（2026-09-08）:

> Create one finished original key visual for a Game Boy Color vertical space shooter called NOVA SPEAR. Use case: stylized-concept. Asset type: game cover artwork for the project's README and in-editor project documentation. Landscape 4:3 composition. A sleek white and cyan arrowhead starfighter with twin orange engines banking toward the viewer, an imposing magenta mechanical orbital fortress above, a tiny distant planet horizon and dark navy outer space. Rich late-1990s Japanese sci-fi game-box illustration, bold dark outlines, confident flat cel shading, restrained cyan / white / violet / hot orange palette, crisp graphic silhouettes, energetic diagonal composition, readable at small sizes. At top left, beautifully designed metallic pixel-inspired title logo reading exactly "NOVA SPEAR". Small secondary line "GAME BOY / COLOR" at bottom left. Original spacecraft design, no existing game characters or brands besides those exact textual words. No product mockup, no cartridge, no handheld device, no frame. Produce the actual illustration as one image.

ゲーム内のBGM7曲は`engine/caravan/music.c`に記述したオリジナル曲（MIT）です。効果音とテキスト描画には共通エンジンを使用します。テキストの美咲フォントのライセンスはリポジトリのブートストラップで取得する`.tools/misaki/misaki.txt`を参照してください。
