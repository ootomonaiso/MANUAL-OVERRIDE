# RhythmFeature.ts PixelArt化仕様

## 対象ファイル

- `src/game/systems/RhythmFeature.ts`（122 行 / 描画は `render()` の **103-120 行のみ**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 新規 |
| `src/genres/RhythmPlugin.ts` | **ビート縦帯と視覚的に競合しうる**（[17](17-RhythmPlugin.md) 懸念点 1） |
| `src/data/config/rhythm_tuning.json` | **変更しない。** BPM・ビートウィンドウ幅の定義元 |
| `src/data/config/ui.json` | `beatMarkerColor`（未使用の設定値）の扱いを検討 |
| `src/game/entities.ts` | **変更しない。** `BeatMarker` インターフェースの定義元 |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 0 / グラデーション 0 / `_roundRect` 0 / `lineTo` 1 /
`stroke` 1 / `fillRect` 0 / `fillText` 0。

```ts
render(ctx, world): void {
  if (!world.rules.features.has('beat_hazard') || this.state.beatMarkers.length === 0) return

  const gY = world.canvas.height - 80          // ← 80 が直書き
  ctx.save()
  for (const m of this.state.beatMarkers) {
    ctx.globalAlpha = (m.t / 400) * 0.3        // ← 400 と 0.3 が直書き
    ctx.strokeStyle = '#ff00ff'                // ← 直書き
    ctx.lineWidth = 2                          // ← 直書き
    ctx.setLineDash([6, 4])                    // ← 直書き
    ctx.beginPath()
    ctx.moveTo(m.x, 0)
    ctx.lineTo(m.x, gY)
    ctx.stroke()
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.restore()
}
```

マゼンタの**縦の破線**がビートのタイミングでフェードアウトしていく。

### 重要な発見

`src/data/config/ui.json:16` に **`beatMarkerColor: "#ff00ff"` が定義済みだが、
どこからも参照されていない**（`src/framework/config-types.ts:221` に型があるだけ）。
`render()` は同じ色を直書きしている。

また `gY = world.canvas.height - 80` の `80` は、
`sideScroller` が使う `PHYSICS.groundYOffset` / `BACKGROUND.groundHeight`（ともに 80）と
**同じ値を独立に直書きしている**。

## 変更方針（PixelArt化の仕様）

### 1. 破線 → ドットのビートライン

`ctx.setLineDash([6, 4])` + `stroke` による破線を、
**`px.rect()` のブロックを縦に等間隔で並べる**表現へ置換する。

```
現状:  ┊  （アンチエイリアスされた 2px 幅の破線）
変更:  ▪  （グリッドに整列したブロックの列）
       ▪
       ▪
```

ドット絵における「点線」はまさにこの表現であり、
**PixelArt 化で最も自然に置き換わる要素の一つ。**

- ブロックのサイズ・間隔は現状の `[6, 4]` の比率を保ちつつ
  `PIXELART.size` の整数倍に丸める
- 線幅 `2` は `PIXELART.size` に合わせる
- `m.x` の座標は `_snap` する（**マーカーの生成タイミングと位置の計算は変更しない**）

### 2. アルファ

`(m.t / 400) * 0.3` のフェードを `px.withAlpha()` で
`PIXELART.alphaSteps` 段に量子化する。**計算式は変更しない。**

ビートに合わせて段階的に消えることで、
**むしろリズムの刻みが視覚的に分かりやすくなる**可能性がある。

### 3. `beatMarkerColor` の直書き解消

`'#ff00ff'` の直書きを、既に定義済みで未使用の
**`UI.beatMarkerColor`（`ui.json:16`、値は同一の `#ff00ff`）から読むよう修正する。**

- 色の値は変わらないため**見た目に影響しない**
- `CLAUDE_OWNER.md` の「ハードコーディングされた値の追加は禁止」の趣旨に沿う
- [01-sideScroller.md](01-sideScroller.md) 7. の `UI.popupFont` と同種の対応

**着手前に本書で報告済みの、当初の指示にない小変更**として扱う。

### 4. 変更しないもの（**本ファイルは特に厳格に**）

- BPM のビートクロック（`_fresh` / `update`）
- ビートウィンドウ内の `just_input` 判定
- ビートハザードのスポーンタイミング
- `beat_dash` の処理
- `RHYTHM_TUNING` 設定（`rhythm_tuning.json`）の値
- `render()` 冒頭のフィーチャーフラグ判定
- `beatMarkers` の生成・寿命管理

## 実際に行った作業内容（実装後に追記）

2026-08-23、P4 として実装完了。

- `setLineDash([6,4])` + `stroke` の破線 → `px.rect()` をビート方向へ等間隔に並べる
  ブロック列に置換
- **`ui.json` に定義済みで未使用だった `beatMarkerColor`/`beatMarkerLineW`/
  `beatMarkerDash`/`beatMarkerAlphaDivisor`/`beatMarkerMaxAlpha` の5値すべてを
  今回接続した。** 仕様書は `beatMarkerColor` のみ言及していたが、調査の結果
  同じ理由（直書きされているが同一値の設定が既に存在する）で他4値も未使用と
  判明したため、着手前の報告に加えて合わせて解消した（`UI.popupFont` と同種の対応）
- アルファ量子化: `(m.t / UI.beatMarkerAlphaDivisor) * UI.beatMarkerMaxAlpha` を
  `px.withAlpha()` で量子化（計算式自体は無変更）
- `gY = world.canvas.height - 80` の直書きは仕様通り変更せず、報告のみとする
  （懸念点2）。BPM・ビートウィンドウ判定・スポーンタイミング等のロジックは無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `test:features`（9/9）✅。ブラウザで
`render()` をfakeの `beatMarkers` で実行し例外なし。

## 懸念点・確認事項

1. **`RhythmPlugin` のビート縦帯との競合**（[17](17-RhythmPlugin.md) 懸念点 1）:
   本ファイルのマゼンタの縦点線と、`RhythmPlugin.drawMidLayer` の
   薄紫のビート縦帯は**どちらも縦線**。ドット化で輪郭が硬くなると
   見分けにくくなる可能性がある（**推測**）。実装後にプレイして確認する。
2. **`gY = world.canvas.height - 80` の直書き**: `80` は
   `PHYSICS.groundYOffset` / `BACKGROUND.groundHeight` と同じ値を独立に持っている。
   3 箇所が独立に同じ値を持つのは保守上の問題だが、
   **描画の見た目には影響しないため本タスクでは変更せず報告のみ行う。**
   （3 つのうち 1 つでも変更されると表示がずれるという既存のリスク）
3. **本ファイルは変更量が小さい**（実質 `render()` の 18 行のみ）。
