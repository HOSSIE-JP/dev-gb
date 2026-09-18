# v38 道中・ボス BGM

全7ステージの道中・ボス、計14曲を編曲しました。以前の独自旋律を発展させ、発音の刻み、伴奏の跳躍、ブレイク、転調、主題の再現を組み直しています。曲名・選択IDは維持します。

|ステージ|音色の方向性|道中 BPM（旧→新）|ボス BPM（旧→新）|転調の流れ（道中）|
|---|---|---:|---:|---|
|1 ルーミア|丸いリードと軽い低音|112→149|128→163|D minor→F major→G minor→D minor|
|2 チルノ|細いベル風の音と氷の分散和音|128→163|149→179|A major→C major→E major→A major|
|3 美鈴|撥弦風の減衰と裏拍|128→163|149→179|G dorian→Bb major→D minor→G dorian|
|4 パチュリー|オルガン風の音と分散和音|112→163|149→179|F# minor→A major→C# minor→F# minor|
|5 咲夜|金属的な音とシンコペーション|128→179|149→199|B minor→D minor→F# minor→B minor|
|6 レミリア|厚い鋸歯状の音と走る低音|112→163|149→179|E minor→G minor→C major→E minor|
|7 フランドール|歪んだ玩具風の音と跳躍|128→179|149→199|C# minor→E major→G minor→C# minor|

ボス曲も2つの転調先を持ち、ルーミア戦は C minor→Eb major→F minor→C minor、美鈴戦は G minor を起点にします。転調前の小節には次の調の属七和音を入れ、曲末も冒頭の調へ戻します。調名だけの変更ではなく、実際の旋律・伴奏を変えています。各曲36〜50小節、57.863〜60.274秒。全曲の正確な数値は `audit.json` にあります。

## 編集と再生成

`compose.cjs` が編集元です。保管した `../music-v13/score.json` の主題を読み、今回の `score.json`、`wave-bank.json`、`audit.json`、`midi/` とエンジン側の2つのJSONを再現します。v13の資料は上書きしません。

```powershell
node projects/touhou-kouma/touhou-kouma-design/music-v38/compose.cjs
node editor/build.mjs
node editor/tests/arranged-music.acceptance.mjs .cache/kouma-v38/music --all-audio
node projects/touhou-kouma/touhou-kouma-design/music-v38/package-audition.cjs .cache/kouma-v38/music
```

楽譜と波形はMITの独自制作です。原作曲の採譜、外部MIDI、録音の流用はありません。MIDIは編集用の音符確認であり、GBの音色を再現するものではありません。

## 再生処理

BGMはパルスCH2と波形CH3、効果音はCH1とノイズCH4を使います。32サンプル・4bitの波形を7つ追加し、既存の三角波を含めて8種類にしました。1小節35バイトの形式を維持し、音量バイトの未使用ビットに波形IDを格納します。音色を変えるときだけDACを止め、16バイトのWave RAMを書き換えます。効果音チャンネルやミキサーを書き換えません。[Pan DocsのWave RAM仕様](https://raw.githubusercontent.com/gbdev/pandocs/master/src/Audio_Registers.md)

テンポはVBlank基準です。既存の整数間隔に加えて5/6、4/5 VBlankを交互に使い、約163／199 BPMを刻みます。音符ごとの誤差は平均化され、小節・ループの周期は整数のVBlankに一致します。追加の常駐RAMバッファや毎フレームの波形転送はありません。タイトル・結果・ゲームオーバー・勝利・エンディングの譜面と他作品の既存の譜面は変更していません。

## 試聴

[全ステージの道中→ボスを順に聴く84秒サンプル](audition/v38-stage-boss-preview.mp3)。各曲のフル版は `audition/stage-N-road.mp3` と `audition/stage-N-boss.mp3` です。サンプルは各曲の8〜14秒を使用しています。

音楽専用GBDK ROMをCGBエミュレーターで実行して録音したAPU音声を、試聴用に音量正規化してMP3化しました。MIDIからの合成ではありません。効果音を含まない試聴用録音と、ゲーム本体の通常操作による検証を区別しています。再生結果・製品ROMの検証・未確認事項は `../qa-v38.json` と `../../../../docs/touhou-kouma-v38.md` に記録します。

|ステージ|道中フル版|ボスフル版|
|---|---|---|
|1|[宵闇の散歩道](audition/stage-1-road.mp3)|[月を隠すリボン](audition/stage-1-boss.mp3)|
|2|[こおりぼしのさざなみ](audition/stage-2-road.mp3)|[あさつゆのこおりあそび](audition/stage-2-boss.mp3)|
|3|[鉄門に舞う花](audition/stage-3-road.mp3)|[紅蓮の歩法](audition/stage-3-boss.mp3)|
|4|[六曜の書塵](audition/stage-4-road.mp3)|[月の余白](audition/stage-4-boss.mp3)|
|5|[秒針の迷廊](audition/stage-5-road.mp3)|[一瞬の銀](audition/stage-5-boss.mp3)|
|6|[胸壁の上の月](audition/stage-6-road.mp3)|[夜潮の冠](audition/stage-6-boss.mp3)|
|7|[灯らぬ七つの窓](audition/stage-7-road.mp3)|[暁の外の遊戯室](audition/stage-7-boss.mp3)|
