# SIDE CARAVAN soundtrack

`side-score.json`は編集可能なオリジナル譜面です。`editor/scripts/compose-side-score.cjs`で再現できます。既存ID 0〜34は変更せず、35〜37を追加しています。

| ID | 曲 | 小節 | ループ長 |
| --- | --- | --- | --- |
| 35 | STARLIGHT IGNITION | 32 | 約60.0秒 |
| 36 | ORBITAL OVERDRIVE | 64 | 約102.9秒 |
| 37 | REACTOR HEART | 32 | 約42.9秒 |

道中曲は発進、飛行、開けた空間、ブレイク、炉心への上昇、終盤、折返しの7区間です。Eマイナーを中心に、Gメジャーの明るい旋律、コード進行、シンコペーション、オクターブの伴奏、区切りのフィル、パルスのデューティーと音量の変化を使っています。

1小節16ステップ。音程1=C2、0=休符、255=保持。Pulse 2が主旋律、Wave 3が伴奏で、Pulse 1とNoise 4は効果音用です。`speed`は1ステップのVBlank数で、ゲームの処理落ちとは別に再生を進めます。

`node editor/tests/side-music.acceptance.mjs`はGBDKで音楽専用ROMを作り、DMG/CGBの全小節・ループ・効果音チャンネル保持を検査します。CGBの実APU出力による試聴WAVを`.cache/side-v03/music`に出力します。WAVは試聴用に音量を正規化し、元の振幅測定値は`results.json`に記録します。
