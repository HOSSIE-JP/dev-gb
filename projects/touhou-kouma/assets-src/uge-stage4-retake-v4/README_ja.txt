軽量編集セット: 現在の2曲MP3、UGE、譜面、生成コード、音源確認ROMと検証を収録。旧MP3と重複した試聴音声のみ省略。

第4面道中を約179BPMのハイテンポな新曲に全面改作。ボスv3は承認済み音源・UGE・譜面をバイト単位で維持しています。

東方GB 第4面 道中・ボス リテイク（2026-10-12）

以前の全16曲オリジナルBGMセットの第4面2曲を、旋律から作り直した比較用改訂版です。既存の東方原曲の採譜・編曲ではありません。元の16曲パッケージ、ゲーム本体、GitHubリポジトリは変更していません。

■ 試聴
review.html をブラウザーで開くと現在の2曲を試聴できます。
audio/08_stage4_v4.mp3：道中「夜界を駆ける閃光」リテイク4（疾走版）
audio/09_boss4_v3.mp3：ボス「斜軸の氷冠」リテイク3
軽量版では主旋律単独音源、旧音源、ループ接続WAVを省略しています。
MP3本体はイントロ＋ループを各1回のみ収録し、2周で尺を水増ししていません。

■ 編集用
uge/stage4.uge と uge/boss4.uge がGB Studio用の編集可能なUGE v6です。
Pulse 1＝主旋律、Pulse 2＝対旋律、Wave＝ベース、Noise＝ドラム。
全4チャンネル使用。SEとの同時発音はゲーム本体で別途確認が必要です。
GB Studioプロジェクトのassets/musicにコピーしてエディターで選択できます。
旧UGEと譜面は previous/ に保存。旧音源は過去の納品とLibrary履歴に残っています。

■ 再生成
Python 3、Node.js 24、ffmpegが必要です。技術検証スクリプトはNumPy/SciPyを使用します。
python3 scores/stage4/compose.py
python3 scores/boss4/compose.py
python3 tools/arrange_score.py scores/stage4/score.json uge
python3 tools/arrange_score.py scores/boss4/score.json uge
node tools/render_uge.cjs uge/stage4.uge audio/08_stage4_v4
node tools/render_uge.cjs uge/boss4.uge audio/09_boss4_v3
主旋律単独は出力名末尾に _lead を付け、最後に --solo を追加します。
python3 validate_retake.py

■ 音源・検証の範囲
GB Studio公式hUGEDriverを含む音源確認ROMをbinjgbエミュレーターで動作させたAPU出力です。MIDI近似音源ではありません。音源確認用.gbはSTGゲーム本体ではありません。
48kHz・16bit・2ch（デュアルモノ）、20Hz DC除去、全体共通ゲイン1.5。MP3は192kbps。
UGEの全セルと楽譜イベントの一致、公式GB Studio 4.3.2/developパーサー読込、再生行・テンポ・ループ先、クリップ、主旋律の主要音高を検証しています。
譜面レビューと機械検証を実施。人間による全曲聴取合格、GB Studio GUI編集保存、物理GB実機、STG本体組み込み、SE共存は確認していません。
正確な秒数・音高検証結果・ハッシュはVALIDATION.json、構成と作曲意図はscores/<曲>/composition.txtを参照してください。

■ v4の変更
静かな探索の方向から疾走するステージ曲へ変更。旋律・リズム・低音・打楽器を新規作曲。テンポ約179.18BPM、初回123.226秒、ループ117.869秒。最初のサビは約16.073秒。単なる速度変更ではありません。
