# Caravan Editor 設計

```text
Electron main ─ 限定IPC ─ React / TypeScript / Canvas
       │                       └ shared/simulation.ts（即時プレビュー）
       ▼
assets-src/game.json + PNG（原本）
       │ GUI または build.cmd
       ▼
compiler.ts : 検証 → png2asset → 美咲文字サブセット → C生成
       │
engine/caravan/{runtime,render}.c + generated/*.c
       │ GBDK / SDCC / BankPack
       ▼
ROM検証 → build/{Debug,Release} → Boytacean / BGB / Emulicious
```

型と上限の正本は`editor/src/shared/model.ts`。`project.json`の`editor: {type: "caravan", source: "assets-src/game.json"}`が共通経路の入口です。非エディタ作品は従来のビルドを使用します。

`project-store.ts`がID・パス検証、PNG、保存ジャーナル、復旧を担当。読込時だけ`frames[].pixels`を付け、保存時はPNGを正本とします。画像パスは`images/<name>.png`へ限定し、パストラバーサルやジャンクション経由の外部参照を拒否します。

ElectronはcontextIsolation・sandbox有効、nodeIntegration無効。独自プロトコル`caravan://app`はアプリ4ファイルのみを配信、CSPで外部接続を拒否します。IPCは送信元メインフレームを照合し、任意コマンド／パスは公開しません。外部PNG入出力はネイティブダイアログで利用者が指定した場合のみ。多重起動は既存ウィンドウへ戻します。

## 変換とバンク

```text
png2asset <input.png> -o <output.c> -map -bpp 2 -noflip
  -keep_duplicate_tiles -tiles_only -no_palettes -keep_palette_order -bin
```

色順固定の中間PNGを渡し、生成2bppを元インデックスから算出した値と比較します。スプライト全フレームは常駐、画面背景は重複排除、美咲BDFは使用文字を8×8化。VRAMは背景／HUD128タイルとOBJ128タイルに分け、OBJ番号128〜255を使用します。

画像・マップ・地形は4096byte以下のデータ群に分け、BANKREFとautobankを使用。ランタイムとメタデータはROM0、描画はbank1。32KiB時はBankPackのMBC5配置結果がbanks0/1だけであることからROM-onlyへヘッダを確定し、チェックサムを更新。拡張時はMBC5、RAMなし。ROM0等の上限超過はリンクエラーを隠さず停止します。

作品ごとのPIDビルドロック、新規作業ディレクトリ、検証済み成果物の昇格を使用します。コンパイル失敗時は正常ROMに触れず、昇格中の通常書込エラーはROM・シンボル・マニフェストを巻き戻します。成果物昇格前にもジャーナルを永続化し、強制終了後の次回ビルドで最後の正常な一式へ戻します。昇格未完了のROMは読み込めません。原本保存は別途ジャーナルで保護します。任意のストレージ障害や全時点の電源断を保証するものではありません。

## 論理契約

Q4速度、16方向SIN/COS整数テーブルをC/TSで共有。経路は各区間の速度を事前に切り捨て、相対座標＋速度×経過時刻で評価。波形は16段階SIN、往復は三角波です。

更新順は自機入力／発射、カメラ、イベント、開始時に生存していた敵・弾・爆発、弾対敵、自機対地形・敵、時間、クリア／ステージ遷移。生成は最初の空き枠、枠不足は先着順で拒否し計数。走査線の描画落ちはシミュレーションへ反映しません。

診断用`ce_trace`はtick、シーン、座標、HP、得点、生存数、生成見送り、フェーズを公開し、途中更新の読込はフラグで拒否。`editor/tests/emulator.mjs`は公開BESS形式からWRAMを読み、C/TS結果を比較します。ハードウェア描画・音・実時間速度は別検査です。

診断フラグは論理更新開始から描画後のスナップショット確定まで保持し、敵・弾プールの座標と速度も同じ時点で照合します。上端HUDではLYC=16の短いLCD割込みでWindowを隠し、次のVBlankで再表示します。これによりHUDの2行より下を背景が占めます。下端HUDはWY=128を使用します。

```bat
.tools\node\node.exe editor\build.mjs
.tools\node\node.exe editor\node_modules\typescript\bin\tsc --noEmit -p editor\tsconfig.json
.tools\node\node.exe --test editor\tests\core.test.mjs
build.cmd star-caravan -Configuration Debug
.tools\node\node.exe --test editor\tests\rom.test.mjs
.tools\node\node.exe --test editor\tests\integration.test.mjs
```

統合テストは`.cache/portable space-*`に検証対象のみをコピーし、コピーに欠落フォント等を注入。終了後は一時コピーのみを削除し、元の`.tools`は変更しません。診断ROM・画像は`.cache/editor-qa`へ残します。


## ワークスペースの責務分割

- `renderer/index.tsx`: プロジェクト切替、編集履歴、保存・ビルドの状態と編集フォームの接続。
- `renderer/workspace.tsx`: エクスプローラー、概要、コマンドパレット、診断パネル、表示設定。
- `renderer/timeline.tsx`: ステージ時刻の操作。
- `renderer/canvases.tsx` / `tile-palette.tsx`: 素材・地形・画面・経路の編集。描画中の一時データは確定時に履歴へ渡し、元データが切り替わったドラフトは破棄。
- `shared/pixel-tools.ts`: 整数座標での連続線・矩形描画。ポインターイベント間の画素／タイルを補間。
- `renderer/preview.tsx`: 編集データの論理シミュレーション。
- `renderer/rom-preview.tsx`: WASMインスタンス、非同期読込世代、入力解除、音声キュー、ROMプレイ操作。
- `node/build-workflow.ts`: 必須ツールの検査、成果物昇格・復旧、ROMとマニフェストの照合。

保存とビルドは開いた時点の正規化リビジョンを受け取り、外部変更があれば拒否します。省略可能な旧形式の弾幕レイヤーは正規化して比較します。ビルドは承認した作品スナップショットとの一致をコンパイラ起動時にも確認します。成功マニフェストには構成・リビジョン・ROMハッシュ・所要時間・生成日時を記録し、ROM読込／書出経路を共通化します。

Windows向けロックと標準cmd入口を維持しています。コンパイラ内部ではホストの実行ファイル拡張子を解決するため、同じGBDK版を用意したLinuxでもROM検証が可能です。Linux向けの全ツール自動セットアップを提供する変更ではありません。
