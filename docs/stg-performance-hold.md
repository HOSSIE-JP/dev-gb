# STG性能改善 v27 / v28 の保留

2026-09-17、ユーザー判断により今回の性能改善を保留する。

- 保存ブランチ: `codex/stg-performance-hold`
- mainの継続地点: `e22cc52dfeeb18061bfe1d92fbd218bc5b3cab58`
- 対象: v27の三段階改善と、v28のGBC専用バックエンド。mainへの統合はしない。
- 理由: 本編の大きな速度改善を確認できず、霊夢の道中は旧版より遅くなった。60更新/秒の性能目標は未達。

再開時は [v27計測報告](stg-three-stage-performance.md)、[v28計測報告](stg-gbc-performance.md)、`projects/touhou-kouma/touhou-kouma-design/qa-v27.json` と `qa-v28.json` を参照する。検証結果を保存したチェックポイントであり、完成・採用・リリース承認を意味しない。

ROM、デバッグシンボル、`.cache`内の実行ログと比較素材はローカルに保持し、Gitには追加しない。v27/v28のバージョン付きROMは `projects/touhou-kouma/build/Release/` に残す。

今後の別作業はmainで進める。将来このブランチへmainを取り込む場合は、未達の性能結果と回帰試験の対象ROMを混同せず、同じ入力条件で再測定する。
