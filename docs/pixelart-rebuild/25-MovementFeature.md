# MovementFeature.ts PixelArt化仕様

> **判断に迷ったファイル（Q2）。ユーザー確認の結果、対象に含めることが決定した。**
> ゲームロジックは 210 行と厚いが、描画は 2 箇所のみ。

## 対象ファイル

- `src/game/systems/MovementFeature.ts`（210 行 / 描画は `render()` の **124-145 行のみ**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 新規 |
| `src/data/config/extra_movement.json` | **変更しない。** `dashTrailParticleColor` / `dashTrailAlphaMax` の定義元 |
| `src/data/config/physics.json` | **変更しない。** `dashDurationSec` 等の定義元 |
| `src/game/ParticleSystem.ts` | ダッシュ・スライドの粒子（[02](02-ParticleSystem.md)）で対応済み |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 0 / グラデーション 0 / `_roundRect` 0 / `lineTo` 0 /
`stroke` 0 / **`fillRect` 2** / `fillText` 0。

**ゲームロジックが厚い**（2 段ジャンプ、壁ジャンプ、重力反転、
クールダウン付きダッシュ、当たり判定が変わるスライド、ロングエア、縦スクロール移動）
一方で、描画は 22 行しかない。

```ts
render(ctx, world): void {
  // ─── ダッシュ軌跡 ───
  if (r.features.has('dash') && this.dash.timer > 0) {
    ctx.globalAlpha = (this.dash.timer / PLAYER_PHYSICS.dashDurationSec) * EXTRA_MOVEMENT.dashTrailAlphaMax
    ctx.fillStyle = EXTRA_MOVEMENT.dashTrailParticleColor       // JSON 由来
    for (let i = 1; i <= 3; i++) ctx.fillRect(p.x - i * 10, p.y + 6, p.w * 0.8, p.h - 12)
  }

  // ─── スライド中の簡易エフェクト ───
  if (r.features.has('slide') && this.slide.active) {
    ctx.globalAlpha = 0.3                    // ← 直書き
    ctx.fillStyle = '#cc9966'                // ← 直書き
    ctx.fillRect(p.x, p.y + p.h - 2, p.w, 2)
  }
}
```

**スコープ判断の根拠:** 描画は 2 箇所と少なく、ゲームプレイの比重が圧倒的に大きい。
`CLAUDE_OWNER.md` の「ほぼ骨組みのみ」には該当しないが「見た目の変更がほとんどない」とも
言えるため判断に迷った。Q2 でユーザーが対象に含めると判断した。

## 変更方針（PixelArt化の仕様）

### 1. ダッシュ残像

3 枚の矩形（`p.x - i * 10` に並ぶ）を `px.rect()` へ置換し、座標を `_snap` する。

さらに**ドット絵らしさを増すため、3 枚の残像に段階的な明度差を付ける**。

```
現状: 3 枚とも同じ色・同じアルファ（全体のアルファのみ減衰）
変更: 手前ほど明るく、奥ほど暗い 3 階調
```

色は `EXTRA_MOVEMENT.dashTrailParticleColor`（JSON 由来）を基準に、
`_lighten` 相当の計算で階調を作る。**JSON の値は引き続き参照する。**

残像の位置（`i * 10`）とサイズ（`p.w * 0.8`、`p.h - 12`）は**変更しない**。

### 2. スライドの砂埃

現状はプレイヤー足下の高さ `2` 実px の横線 1 本のみ（ソース上の値は実px）。

`px.rect()` へ置換し、座標を `_snap` する。
`2` 実px の線は 1 セル（既定 4 実px）より細いため、`_snapSize` の下限規則により
**スナップすると 1 セル（4px）に太る**。これは意図した挙動とする。

### 3. アルファ

両方の `globalAlpha` を `px.withAlpha()` で量子化する。
ダッシュ側の計算式（`dash.timer / dashDurationSec * dashTrailAlphaMax`）は変更しない。

### 4. 変更しないもの（**本ファイルは特に厳格に**）

- 2 段ジャンプ・壁ジャンプの判定
- 重力反転
- ダッシュのクールダウンと持続時間（`_updateDash`）
- **スライド時の当たり判定の変更**（`_updateSlide`。プレイヤーの `h` を変える）
- ロングエア、縦スクロール移動
- `preUpdate` / `update` の処理順
- `PLAYER_PHYSICS` / `EXTRA_MOVEMENT` 設定の値
- `render()` 冒頭の 2 つのフィーチャーフラグ判定

## 実際に行った作業内容（実装後に追記）

2026-08-23、P4 として実装完了。想定通り変更量は小さい。

- ダッシュ残像3枚: `px.rect()` に置換し、`_shade()`（新規の私的ヘルパー。
  既存の複数ファイル（`sideScroller`/`StgPlugin` 等）が持つ同名パターンを踏襲）で
  `-20 * (i-1)` の段階的な明度差を付けた。位置（`i*10`）・サイズは無変更
- スライドの砂埃: `px.rect()` に置換。`2` 実pxの線は `_snapSize` の下限規則により
  1セル（既定4px）に太る（仕様通り、意図した挙動）
- 両方のアルファは `px.withAlpha()` で量子化。計算式は無変更
- 直書きの `0.3` と `'#cc9966'`（スライド側）は仕様通り変更せず維持（懸念点2）
- 2段ジャンプ・壁ジャンプ・重力反転・ダッシュのクールダウン/持続時間・
  **スライド時の当たり判定変更（`p.h` 書き換え）**・縦スクロール移動は無変更。
  差分を確認し `render()` 以外に変更が無いことを確認済み

検証結果: `typecheck` ✅ / `lint` ✅ / `test:features`（9/9）✅。ブラウザで `render()` を
ダッシュ・スライド両方のフラグ付きで実行し例外なし。

## 懸念点・確認事項

1. **本ファイルは「見た目の変更が最小」なファイルの一つ。**
   PixelArt 化の効果は限定的で、実質「座標のスナップ + 残像の階調化」に留まる。
   Q2 で対象に含める判断をいただいたため実施するが、
   **差分は小さくなる見込み**であることを明記しておく。
2. **直書きされた `0.3` と `'#cc9966'`**（スライドの砂埃）:
   ダッシュ側は JSON 化されているのに対し、スライド側だけ直書きになっている。
   [22-SpecialFeature.md](22-SpecialFeature.md) 懸念点 1 と同じ論点であり、
   **本タスクでは既存の直書きを残し、報告のみ行う。**
   `extra_movement.json` への移設を希望される場合は指示を待つ。
3. **スライド中の当たり判定変更に注意**: `_updateSlide` はプレイヤーの
   高さを変える＝当たり判定を変えるゲームロジックである。
   描画の変更が誤ってここに及ばないよう、差分で厳密に確認する。
