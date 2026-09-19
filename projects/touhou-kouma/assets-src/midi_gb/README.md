# 東方MIDI・GB向け3声アレンジ

`th06_01_gb3.mid`〜`th06_15_gb3.mid`が3声へ改訂したMIDIです。
元MIDIの15曲は隣の`midi_org`にそのまま残しています。

2声初稿への「かなり音が平坦」というフィードバックを受け、ユーザー指定で3声へ改訂しました。定型伴奏を外し、副旋律とベースも元MIDIから独立して選び直し、強弱を付けています。`th06_01_gb2.mid`〜`th06_15_gb2.mid`は比較用に保持しています。機械的な仕様検査は、原曲らしさ・サビの選定・ループの自然さの合格を意味しません。

- 主旋律：パルスCH2、副旋律／和声：パルスCH1、ベース：波形CH3。各声は同時発音1音。
- SMF 1、480 PPQ、テンポ／区間マーカー＋3演奏トラック。演奏MIDIチャンネルは順に2、1、3です。
- 音域36〜95（C2〜B6）、16分音符単位、33〜64小節。
- 通常の曲は77〜100秒。元から短い3曲は53〜59秒。
- 末尾に短い休符を置き、曲の先頭へ戻るループです。独立した非ループ前奏はありません。

[3声試聴ページ](index3.html)には全曲・ループ境界・主旋律のみ・音量を合わせた2声→3声比較・全15曲ダイジェストがあります。
ブラウザーがローカルページ内の音声を読み込めない場合は、[試聴WAVフォルダー](../../generated/midi_gb3/audition)のファイルを音楽プレイヤーで開けます。
音声は書き出したMIDIからパルス2声と三角波で合成したものです。GBの実機APU録音ではありません。[2声初稿の試聴](index.html)も残しています。

[3声編曲レポート](REPORT3.md)に元区間の時刻、採用理由、サビとして優先した区間、省略区間、SHA-256を記載しています。
サビ位置は譜面上の主題・反復・高音域展開から選定しました。元MIDIの採譜の正確さ、原作録音との一致、人による聴感評価は未確認です。

## 編集・再生成

`arrangements3.json`が曲別の編集設定です。`originBeat`から数えた元MIDIの四分音符単位で採用区間を指定し、旋律・副旋律・ベースの候補トラックと音域を設定します。
`beatScale: 2`は演奏時間を半分にする指定ではなく、倍テンポ／倍小節数の譜面へ置き換えて細かい音型を残す指定です。

リポジトリのルートから次を実行します。外部パッケージやオンライン音楽生成サービスは不要です。

```powershell
.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/arrange3.cjs
.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/render3.cjs
.tools/node/node.exe projects/touhou-kouma/assets-src/midi_gb/verify3.cjs
.tools/node/node.exe --test projects/touhou-kouma/assets-src/midi_gb/midi.test.cjs projects/touhou-kouma/assets-src/midi_gb/midi3.test.cjs
```

生成されたMIDIをDAWで直接編集した場合、再生成するとその編集は上書きされます。編集版を別名で保存するか、元の編曲設定へ変更を反映してください。2声版の再生成手順は[初稿レポート](REPORT.md)に残しています。3声版の比較音声を再生成する際も2声版MIDIと`audit.json`が必要です。

## 検証資料とゲームへの取り込み

|ファイル|用途|
|---|---|
|`input-lock.json`|元MIDI15曲と既存ゲーム／音楽ソースのハッシュ|
|`audit3.json`|曲別のテンポ、長さ、区間、サビの音高照合、編集履歴|
|`validation3.json`|MIDI・音符の由来・発音位置・ループ境界・WAV・再現性の検査結果|
|`../../generated/midi_gb3/score.json`|全音符の元ノートIDと16ステップ譜面。`noteGrid`は休符0、タイ255、音高はMIDI番号−35|
|`../../generated/midi_gb3/audition/manifest.json`|61個のWAVのSHA-256と比較／ダイジェストの位置|
|`VERIFICATION.md`|標準コマンドの結果と未確認事項|

2026-09-20追記：ユーザー指定の14曲（`th06_02`〜`th06_15`）を、v44のゲーム試行用に登録しました。曲そのものは再編曲していません。`import.json`のSHA-256を検証してビルド時に取り込み、3声再生・velocityのGB音量への変換・効果音とのCH1共有を行います。対応表、再登録手順、効果音の変更は[取り込み説明](INTEGRATION.md)、実ROMの結果は[ゲーム検証レポート](../../../../docs/touhou-kouma-v44.md)を参照してください。

`REPORT3.md`と`VERIFICATION.md`はMIDI制作段階の記録です。そこにある「ゲーム未取り込み」「エンジン変更なし」は、その段階の検証範囲を示します。`input-lock.json`の元MIDIハッシュは現在も固定し、エンジンハッシュは取り込み前の比較基準として保持しています。

出典はユーザー提供の東方原作BGM採譜MIDIです。原曲・採譜・派生MIDIの権利は元の権利者に帰属し、このリポジトリのMITライセンスを付け直していません。
