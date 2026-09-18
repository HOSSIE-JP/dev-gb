# 東方 紅魔巡礼 GB v0.38 — ハイテンポBGM

道中7曲・ボス7曲を編曲しました。道中は旧112〜128から149〜179 BPM、ボスは旧128〜149から163〜199 BPMへ変更。小節数を増やして各曲を約58〜60秒に保ち、Bメロと展開部で転調し、冒頭の調へ戻ってループします。イントロ、旋律の応答、分散和音、裏拍、ブレイク、再現の構成も見直しました。

ステージごとに、丸いリード、氷のベル、撥弦、オルガン、金属的な音、鋸歯状の厚い音、歪んだ玩具風の音を目標に7つの波形を追加しました。パルス音の幅・減衰と伴奏も使い分けます。音色の名称はチップ音による表現であり、生楽器の録音ではありません。全曲のテンポと転調先は[編曲資料](../projects/touhou-kouma/touhou-kouma-design/music-v38/README.md)にあります。

## 再生と負荷

BGMはCH2/CH3、効果音はCH1/CH4。既存の35バイトの小節バッファを使い、波形IDと半フレームのテンポを未使用ビットへ格納しました。追加の常駐RAMは0バイトです。音色変更時にだけWave DACを止めて16バイトを書き換えます。[ハードウェア仕様](https://raw.githubusercontent.com/gbdev/pandocs/master/src/Audio_Registers.md)

BGB 1.6.6でv37とv38に同じ5,000表示フレームの入力を再生し、7面・魔理沙の道中／ボス選択を比較しました。値はゲーム更新／秒です。

|経路|v37|v38|
|---|---:|---:|
|CGB 道中|56.40|56.42|
|CGB ボス|56.80|56.80|
|DMG 道中|35.50|35.44|
|DMG ボス|28.51|28.53|

この測定は選んだ2経路の回帰確認です。全ステージ・全負荷の網羅や常時60fpsの保証ではありません。入力ハッシュと120更新区間の値を検証JSONに保存しています。ゲーム設定と難易度は変更していません。

## 検証

- Debug／Releaseとも警告なしで成功し、同一の2MiB ROM。静的WRAM＋shadow OAMは7,163バイトで前版と同じ、スタック予約1,024バイト以上。
- 音楽専用GBDK ROMで、GB／GBCそれぞれ全19曲の全小節・ループ・PCMを確認。新しい14曲の音符と音色を検査し、0.5フレーム刻みのテンポ、ポーズ、3,520更新の正確なループ、8種類のWave RAM保持を確認しました。
- 製品ROMを通常のメニュー入力で操作し、GB／GBC × 全7面 × 道中／ボスの28経路で選曲・発音・ポーズ／再開を確認。魔理沙ボムの効果音はBGMをエミュレーターのミキサー側だけで分離し、4条件でPCMの発音を確認しました。
- doctor警告0、hello-gb clean／Debug、TypeScriptと標準166テスト成功。star-caravan Debug／ReleaseとROM・統合・BGBの4テスト成功。star-caravanには既存のコンパイラー警告が各構成4件あります。
- 旧作品の音楽、SIDE CARAVAN全3曲×2機種、タイトル・結果・ゲームオーバー・勝利・エンディングの譜面保持も確認しました。
- Emuliciousは最終ROMを起動・接続しましたが、DAP evaluateがNullPointerExceptionで失敗。プレイ確認済みとは扱いません。実機、人による聴感評価、通常キャンペーン通しクリアは未確認です。

## 配布物と編集元

- [GB／GBC共通ROM](../projects/touhou-kouma/build/Release/touhou-kouma-v38.gb)
- SHA-256: `351287f47c8341bc3bc17e4bac1199526503ed630c3b77ad1192b4e22aaa000c`
- [全14曲の84秒サンプル](../projects/touhou-kouma/touhou-kouma-design/music-v38/audition/v38-stage-boss-preview.mp3)
- [全曲試聴・楽譜・再生成手順](../projects/touhou-kouma/touhou-kouma-design/music-v38/README.md)
- [検証記録](../projects/touhou-kouma/touhou-kouma-design/qa-v38.json)

試聴MP3は音楽専用ROMの実APU出力を音量正規化したもので、MIDIの音源ではありません。各曲のフル版、MIDI、編曲スクリプト、波形・譜面JSONをmusic-v38へ保存しました。v13の資料と元画像は保持しています。プロジェクトリビジョンは `9e3846650a76ac2b95ce417dc208b15044ea59b7508b15c65eb468a6ac31e0d5` のまま、エンジン側の楽譜と再生処理を更新しました。
