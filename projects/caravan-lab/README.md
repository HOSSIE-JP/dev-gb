# CARAVAN LAB

Caravan EditorのGUIでSTAR CARAVANから独立複製した編集例です。元の`star-caravan`の画像・作品定義は変更していません。

```bat
editor.cmd caravan-lab
build.cmd caravan-lab -Configuration Debug
```

GUIで自機画像の青い1ドット、敵HP、自機弾の速度、ボスHP、マップ左上の壁、かなタイトル「スター キャラバン」を変更し、保存・再起動・ROMビルドを確認しました。作品定義は`assets-src/game.json`、PNGは`assets-src/images`です。

ゲームのルール・制約は[STAR CARAVAN](../star-caravan/README.md)、操作は[エディタガイド](../../docs/caravan-editor.md)を参照してください。
