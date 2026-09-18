# 東方 紅魔巡礼 GB v0.39 — 低優先度のグレイズ音

グレイズ時に控えめな「チッ」という短い音を鳴らします。従来の呼び出しは通常ショットと同じCH1を使い、発光が続く間は再発音しないため、連続グレイズで音を確認しにくい状態でした。

今回はCH4へ移し、音量4/15・約47msのハードウェア長さ制限を設定しました。CH1の通常ショットとCH2/CH3のBGMを変更しません。CH4を使う命中音・爆発・被弾音と、持続ボム・カットインを優先します。大きい効果音は再生中のグレイズ音を即座に上書きできます。空き待ちになったグレイズ音を後から鳴らすことはありません。[CH4のハードウェア仕様](https://raw.githubusercontent.com/gbdev/pandocs/master/src/Audio_Registers.md)

新しいグレイズがある場合だけ、12 VBlank（約0.2秒）以上の間隔で再発音します。発光時間と独立させたため、連続発光中にも適度な間隔で鳴ります。同じ弾の再加点や繰り返し発音は追加していません。スコア・判定・発光の設定は維持しています。

## 検証

- BoytaceanとBGBのGB/GBC診断ROMで、連続発光中の0・12・24フレームの発音、通常ショット／BGMの保持、上位音との優先度を両方の呼び出し順で確認しました。
- 既存のグレイズ診断ROMで、BG弾・OAM弾の338座標ケース／機種に加え、無敵・上限スコア・弾の再利用・発生直後・ボム／カットイン優先を確認。各機種787観測点が成功しました。
- 製品ROMを通常入力で操作し、魔理沙・7面ボス戦でGB/GBCとも実際のグレイズ発音を3回ずつ確認しました。音声はエミュレーターのCH4だけを分離してPCMを確認し、ROM／RAMは書き換えていません。
- Debug／Releaseは同一の2MiB ROM、警告0。静的WRAM＋shadow OAMは7,165バイト（2バイト増）、スタック予約1,024バイト以上。
- doctor警告0、hello-gb clean／Debug、TypeScript・標準166テスト成功。音声専用テストと音楽の2回帰テストも成功。star-caravan Debug／Release成功（既存警告4件ずつ）。
- BGBの製品ROMでv38と同じ5,000表示フレームの入力を再生したGBCボス経路は、56.80→56.80更新／秒で同じでした。全ステージ・全負荷の測定ではありません。

Emuliciousは起動・接続後、DAP evaluateのNullPointerExceptionで確認できませんでした。実機と人による聴感評価、通常キャンペーン通しクリアは未確認です。

## 配布物

- [GB／GBC共通ROM](../projects/touhou-kouma/build/Release/touhou-kouma-v39.gb)
- SHA-256: `e253097216410e9bdf44b99ab390d1a6f934d9828ac3f2e2ca65a03b89ef29b1`
- [グレイズ音の単体試聴](../projects/touhou-kouma/touhou-kouma-design/graze-v39/graze-preview.wav)（診断ROMの3回発音、聴きやすい音量へ正規化）
- [検証記録](../projects/touhou-kouma/touhou-kouma-design/qa-v39.json)

v38のBGM改修を含みます。プロジェクトリビジョン `9e3846650a76ac2b95ce417dc208b15044ea59b7508b15c65eb468a6ac31e0d5` は同じで、エンジンの効果音とグレイズの通知処理を変更しました。
