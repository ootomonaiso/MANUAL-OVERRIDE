# sideScroller.ts PixelArt化仕様

## 対象ファイル

- `src/game/sideScroller.ts`（1515 行 / 描画ブロックは **755〜1217 行**に集中）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 新規。本ファイルが最初の利用者になる |
| `src/game/render/SpriteRenderer.ts` | 新規。アイテム描画で使用 |
| `src/game/render/PixelText.ts` | 新規。スコアポップアップ・GAME OVER で使用 |
| `src/data/sprites/item-*.json` | 新規。exp / hp / food / weapon の 4 スプライト |
| `src/data/config/pixelart.json` | 新規。量子化パラメータ |
| `src/game/entities.ts` | **変更しない。** `Hazard.color` / `shape` / `Item.type` を読むだけ |
| `src/data/config/hazard_vfx.json` / `background.json` / `ui.json` / `vfx.json` | **変更しない。** 既存の値をそのまま読む |

## 現状（Before）

描画は 755〜1217 行の 1 ブロックに閉じている。1〜754 行は状態・物理・更新、1218 行以降は
スポーン・パーティクル生成・`MutableWorld`・LearningSystem であり、**描画とロジックは既に分離済み**。
そのため本タスクの変更は 755〜1217 行の内側だけで完結する。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 756-853 | `_render()` | フレーム統括。`translate(shakeX, shakeY)` で画面シェイク。スコアポップアップは `fillText` に `'bold 15px "Courier New", monospace'` を**直書き**（804 行） |
| 856-903 | `_drawBackground()` | `createLinearGradient` による空グラデーション（縦モードは全画面、横モードは `gY` まで）。以降を プラグインへ委譲 |
| 905-934 | `_drawStarField()` | 決定論的ハッシュ（LCG）で星を配置し `arc()` で円を描く。1 フレーム約 72 個 |
| 937-952 | `_drawEnvironmentOverlay()` | `environment` 値に応じた全画面 `rgba` ティント。**色が switch 文に直書き** |
| 954-975 | `_drawGround()` | 地面グラデーション + 白いライン + 流れるダッシュ模様（`fillRect`） |
| 978-1009 | `_drawPlayer()` | 無敵点滅・スカッシュ＆ストレッチ（`scale`）・縦モードの `-90°` 回転を適用し、実際の描画はプラグインへ委譲 |
| 1012-1078 | `_drawHazard()` | `shadowBlur` グロー → 形状 switch → HP バー |
| 1080-1094 | `_drawRect()` | 縦グラデーション + `roundRect` + エッジ `stroke` |
| 1096-1108 | `_drawSpike()` | `moveTo`/`lineTo` の三角形 + `stroke` |
| 1110-1119 | `_drawPillar()` | 横 3 ストップグラデーション + キャップ `fillRect` |
| 1121-1133 | `_drawDiamond()` | 4 点の菱形 + `stroke` |
| 1135-1147 | `_lighten()` | HEX → `rgb()` の明度加算ヘルパー |
| 1150-1205 | `_drawItem()` | 4 種のアイテム。全て `shadowBlur` グロー付き。**色・半径・オフセットが直書き**（`#ffcc00` / `#ff5555` / `#66aa22` / `#ddbb55` 等） |
| 1207-1217 | `_drawStar()` | n 角星のパス |

計測値: `arc` 3 / `ellipse` 1 / グラデーション 5 / `roundRect` 1 / `lineTo` 9 / `stroke` 3 / `fillRect` 15 / `fillText` 4 / `shadowBlur` 6。

## 変更方針（PixelArt化の仕様）

### 1. 初期化

`_render()` の先頭で `ctx.imageSmoothingEnabled = false` を設定する。
`PixelCanvas` インスタンスはコンストラクタ（153-155 行で `ctx` を取得している箇所の直後）で
1 つだけ生成し、フィールドに保持する。

### 2. グラデーション → 帯グラデーション

`_drawBackground()` / `_drawGround()` / `_drawRect()` / `_drawPillar()` の
`createLinearGradient` を `px.bandGradient(..., PIXELART.gradientSteps)` に置換する。
空・地面が連続階調から `gradientSteps` 段の色帯になり、レトロゲームの空らしい見た目になる。
**ストップ位置・色の取得元（`plugin.skyColors` / `groundColors`）は変更しない。**

### 3. 星フィールド → ブロック星

`_drawStarField()` の `arc()` を `px.rect()` に置換する。
星のサイズ（`sizeMin` + ハッシュ由来の増分）を仮想ピクセル単位に丸め、
1〜2 セルの正方形として描く。**配置ハッシュ・セクタ計算・視差係数は一切変更しない**
（変更するとフレーム間で星が飛ぶため）。
アルファは `px.withAlpha()` で `PIXELART.alphaSteps` 段に量子化する。

### 4. 地面

- 地面グラデーション → `bandGradient`
- 白いラインとダッシュ模様は既に `fillRect` なので、座標を `_snap` するだけ
- ダッシュの開始位置 `startX` の計算式（`cameraX * parallaxGround % dashInterval`）は変更しない

### 5. ハザード形状

| 現状 | 変更後 |
|---|---|
| `_drawRect`: グラデーション + `roundRect` + `stroke` | `px.bandGradient` + 角の切り欠き（角丸をやめ、1 セル分の階段状ベベルにする）+ `px.line` のエッジハイライト |
| `_drawSpike`: `moveTo`/`lineTo` 三角形 | `px.tri(..., 'up', color)` の階段状三角形 |
| `_drawPillar`: 横グラデーション | `px.bandGradient(axis:'h')` + キャップは `px.rect` |
| `_drawDiamond`: 4 点パス | `px.tri` を上下 2 枚合わせた階段状の菱形（新規に `px.diamond` を設けず `tri` の合成で済ませる） |
| `shadowBlur` グロー | `px.halo()` によるブロックハロー。段数は `PIXELART.haloSteps` |

`_lighten()` は色計算ヘルパーであり PixelArt と衝突しないため**そのまま残す**
（帯グラデーションの各段の色算出に再利用する）。

### 6. アイテム → スプライト

`_drawItem()` の 4 分岐（`exp` / `hp` / `food` / `weapon`）を
`src/data/sprites/item-exp.json` 等のスプライト参照に置き換える。

```
現状: arc / ellipse / fillText('♥') / パスによる剣 + shadowBlur
変更: px.sprite('item_' + item.type, sx, y, item.w, item.h)
```

- `item.w = item.h = 22`（`entities.ts:103-115`）をそのまま `drawImage` の転送先サイズに渡すため、
  **見た目のサイズと当たり判定は完全に一致したまま**
- バウンス `Math.sin(item.pulse) * 4` は残す（アイテムの視認性に寄与するため）
- グローは `px.halo` に置換
- これにより `_drawStar()`（1207-1217）は `exp` スプライトに吸収され不要になる。
  他に呼び出し元がないことを確認のうえ削除する
- 直書きされていた色（`#ffcc00` 等）はスプライト JSON の `palette` へ移す
  → **ハードコーディング削減にもなる**

### 7. 文字

- スコアポップアップ（804 行）: `PixelText` 経由に変更。
  あわせて、**現在直書きされているフォント文字列を、既に定義済みだが未使用の
  `UI.popupFont`（`src/data/config/ui.json:6`）から読むよう修正する。**
  これは「見た目以外の変更」ではなく直書き解消であり、`CLAUDE_OWNER.md` の
  ハードコーディング禁止ルールに沿う（着手前に本書で報告済み）
- GAME OVER / `'説明書を投げてください'`（830-835 行）: `PixelText` 経由。
  フォント指定は `UI.deathTitleFont` / `UI.deathSubFont` のまま

### 8. ドット化しないもの（`00-rendering-system.md` D3）

- 死亡オーバーレイの黒フェード
- 被ダメージフラッシュ（赤）・ジャンルロックフラッシュ（白）
- `_drawEnvironmentOverlay()` の全画面ティント

いずれも均一な半透明の全画面塗りであり、ドット絵作品でも一般的な演出のため現状維持とする。
ただし `_drawEnvironmentOverlay()` の **switch 文に直書きされた 6 色は
`src/data/config/pixelart.json`（または新規の環境色セクション）へ移すか検討する** → 懸念点参照。

### 9. ゲームプレイ非侵害

- カリング判定（`sx < -60 || sx > W + 60` など）は変更しない
- `_drawPlayer()` の squash / stretch / 回転の**計算式**は変更しない。
  `ctx.scale` へ渡す直前に倍率を量子化するのみ
- 1017 行と 1042 行にある `drawHazard` の二重呼び出しは**既存の挙動であり、
  本タスクでは修正しない**（描画以外の副作用を持つプラグインがあった場合に挙動が変わるため）
  → 懸念点参照

## 実際に行った作業内容（実装後に追記）

2026-08-23、P1 として実装完了。

- コンストラクタで `PixelCanvas` を 1 つ生成しフィールド `px` に保持（153-155 行付近、方針通り）
- `_render()` 先頭で毎フレーム `ctx.imageSmoothingEnabled = false` を設定
- `_drawBackground()`: 縦モード／横モードいずれの空グラデーションも
  `px.bandGradient(..., PIXELART.gradientSteps)` に置換。ストップ位置・色は変更なし
- `_drawStarField()`: `ctx.arc` を `px.rect(x-size, y-size, size*2, size*2, color)` に置換。
  サイズの事前量子化はせず、`px.rect` 内部のデバイス空間スナップ（`_snapSize`）に一本化した
  （00-rendering-system.md §3 の「スナップは PixelCanvas 側で行う」方針に合わせ、
  呼び出し側での二重の量子化を避けた）。アルファは `px.withAlpha` で量子化。
  配置ハッシュ・セクタ計算・視差係数は無変更
- `_drawGround()`: 地面グラデーションを `px.bandGradient` に置換。地面ラインとダッシュ模様は
  `ctx.fillRect` → `px.rect` に置換（座標のデバイス空間スナップが自動的にかかる）。
  ダッシュの開始位置計算式は無変更
- `_drawEnvironmentOverlay()`: 仕様通り**変更していない**（下記の懸念点1を参照。ユーザー確認が
  取れていないため現状維持）
- ハザード描画（`_drawHazard` とその補助メソッド群）:
  - `shadowBlur` によるグローを `px.halo()` に置換。新設した `_drawHazardHalo()` が
    形状ごとに拡張後の輪郭を `px.halo` のコールバックへ渡す（spike は `px.tri`、
    diamond は `px.tri` 2 枚、pillar と rect は共通のバウンディング矩形 halo にまとめた
    ―― 同一ロジックの重複を避けるため、仕様書には無かった簡略化）
  - `_drawRect`: `createLinearGradient` → `px.bandGradient`。`roundRect` による角丸は廃止し、
    四隅を `HAZARD_RECT_BEVEL_CELLS`（=1 セル）ぶん描かずに残すことで階段状ベベルにした
    （`px.roundedRect` は角ごとに個別の帯色を持てないため流用せず、同じ「角を描かない」
    考え方を `bandGradient` の呼び出しに直接組み込んだ）。エッジは `px.line` に置換
  - `_drawSpike`: `px.tri(..., 'up', color)` + `px.line` によるエッジ（3 辺）
  - `_drawPillar`: 3 ストップの `px.bandGradient(axis:'h')` + キャップは `px.rect`
    （仕様書のサンプルコードと同じ形）
  - `_drawDiamond`: `px.tri` を上下 2 枚（'up' + 'down'）合わせて菱形にし、
    4 辺を `px.line` でエッジハイライト
  - HP バーは仕様書に変更対象として明記されていないため無変更（`ctx.fillRect` のまま）
  - `edgeHighlightLineW`（1.5）/ `diamondEdgeLineW`（2）は `Math.max(1, Math.round(...))` で
    セル数に変換して `px.line` の thickness に渡した（実px指定だった既存値をセル単位API に
    合わせて変換。値そのものは JSON から読んだままで直書きしていない）
  - `hazard_vfx.json` の `glowBlur` / `rectCornerRadius` は読まなくなった
    （`shadowBlur` / `roundRect` を廃止したため）。JSON ファイル自体は変更していない
- アイテム描画（`_drawItem`）: 4 分岐を `src/data/sprites/item_{exp,hp,food,weapon}.json`
  への `this.px.sprite('item_' + item.type, sx, y, item.w, item.h)` 呼び出しに置換。
  バウンド演出（`Math.sin(item.pulse) * 4`）は維持。`item.w`/`item.h`（22×22）をそのまま
  転送先サイズに渡しているため当たり判定と見た目のサイズは一致したまま。
  グローは `px.halo` に置換し、色はスプライト JSON の palette に追加した `G` キー
  （`frames` では未使用の予約色）から読む形にした。`_drawStar()` は他に呼び出し元が
  無いことを確認のうえ削除
- スプライト JSON はファイル名を `id` と一致させる必要がある（`validate-json.mjs` の
  `basename(file) === data.id` チェック）ため、仕様書中の例示パス `item-exp.json`
  ではなく `item_exp.json`（アンダースコア区切り）で作成した。これは仕様書の記載誤りの
  訂正であり、内容面の変更ではない

検証結果: `typecheck` ✅ / `lint` ✅ / `validate`（112 passed、新規スプライト4件を含む）✅ /
`build` ✅ / `bundle-size`（JS 433.4KB/800KB, CSS 80.4KB/100KB）✅ / `check-doc-links` ✅ /
`test:features`（9/9）✅ / `test:unit`（177/180、失敗3件は P0 で報告済みの既存バグ
`ShootFeature`/`featureRegression.test.ts` の型不整合で、本タスクとは無関係。
`git diff --stat` で該当ファイルが無変更であることを確認済み）/ `reach-sim` 実行し
ジャンル分布に異常なし。

ブラウザでの動作確認: dev サーバー上で開始画面 → チュートリアル → ゲーム本編まで
遷移してコンソールエラー無し、全 JSON（新規スプライト4件含む）が 200 で読み込まれることを
確認。実行環境の制約で実機スクリーンショットは撮れなかった（Browser pane 非表示のため
`requestAnimationFrame` が発火せず、ゲーム本体の描画ループを画面上で確認できなかった）ため、
代わりに Vite の動的 import で `PixelCanvas` / `SpriteRenderer` / `PixelText` を
ページ内で直接インスタンス化し、`rect` / `bandGradient` / `circle` / `tri` / `line` /
`halo` / `sprite('item_exp')` / `text()` を実行して `getImageData` でピクセルを検証。
期待通りの色（例: `item_exp` の塗り色 `#ffcc00` = `rgb(255,204,0)`）が出力され、
例外も発生しないことを確認した。**実際のゲーム画面での見た目の最終確認は未実施であり、
今後ユーザー側での目視確認を推奨する。**

## 懸念点・確認事項

1. **`_drawEnvironmentOverlay()` の色の直書き**: 6 色が switch 文に直書きされている。
   PixelArt 化では色を変えないため必須ではないが、ハードコーディング禁止ルールの観点で
   JSON へ移すべきか。**本タスクのスコープを広げるため、ユーザー確認が必要と考える。**
   確認が取れるまでは現状維持（色そのものは変更しない）とする。**P1 でも未着手のまま。**
2. **`drawHazard` の二重呼び出し（旧 1017 行 / 1042 行、現行の行番号は前後の編集でずれている）**:
   調査で見つけた既存の不具合と**推測**される。1 つ目の呼び出しは `ctx.save()` の前にあり、
   `false` を返すプラグインでは 1 フレームに 2 回描画される。PixelArt 化とは独立した問題であり、
   `CLAUDE_OWNER.md` の「見た目以外の変更は行わない」に抵触しないか判断が必要なため、
   **本タスクでは手を付けず、報告のみ行う。**（P1 でも無変更のまま維持）
3. `UI.popupFont` は 7. の通り P1 で解消済み（スコアポップアップが JSON から読むようになった）。
   `UI.beatMarkerColor` は未使用のまま。`24-RhythmFeature.md` を参照。
4. **実機での目視確認が未実施**: 上記の通り実行環境の制約でスクリーンショットが撮れなかった。
   ハザードのベベル・ハロー・アイテムスプライトの見た目が意図通りかは、
   ユーザー側でのブラウザ実行による確認を推奨する。
