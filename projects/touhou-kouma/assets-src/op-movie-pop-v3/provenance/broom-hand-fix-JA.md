# 箒の向き・持ち手の修正

2026-09-19。内蔵 image_gen で編集。

後続更新: クリップ03は庭園でのじゃれ合いへ変更済み。以下の戦闘カット・箒の指定について、クリップ03に関する部分は当時の変更記録。現行クリップ03には適用しない。クリップ01の飛行と画像修正は継続して採用。

- 添付された動画フレームの修正版: `../references/marisa-flight-broom-fixed.png`
- 更新した絵コンテ: `../storyboards/storyboard-01.png` の上段中央と下段中央。
- 木の柄の先端が進行方向を向き、穂は腰の後ろに続く。
- 魔理沙本人の右手で柄を握る。正面の画面では、その腕は画面左側の肩につながる。左手は登場カットで帽子、戦闘カットで八卦炉を扱う。
- 前回修正した一枚のスカートと白いドロワーズを維持。
- 動画プロンプト01の Shot 2・5、03の Shot 4 と、両クリップの retention_analysis に同じ指定を反映。

## 持ち手の指定文

```text
Marisa's anatomical right hand grips the broom shaft, with one thumb opposing four curled fingers. Her anatomical left hand touches the hat brim in the introduction and holds the octagonal focus in the action shot. Each hand remains connected to the same shoulder through camera motion and cuts. The bare wooden handle leads in the direction of travel; the tied straw bundle trails behind her hips on one continuous shaft.
```

魔理沙本人の右手で柄を握り、親指と巻き付けた4本の指を向かい合わせる。本人の左手は登場カットで帽子のつば、アクションカットで八卦炉を扱う。カメラ移動とカットを通じ、各手は同じ側の肩につながる。木の柄の先端が進行方向、束ねた穂が腰の後ろ。両端は一本の連続した柄でつながる。

## 生成記録と確認

添付フレームの編集指示全文・入力・出力・ハッシュは `broom-hand-correction.json`。絵コンテの編集指示全文と採用履歴は `image-generation.json` の storyboard-01-broom-hands-corrected。途中版で残った余分な手と分断された柄は再編集して解消した。

採用画像を目視確認し、プロンプトと参照資料の113項目の整合性チェックを実施。修正指定を使った動画の再生成は行っておらず、動画内で手の左右が維持されるかは未検証。
