# SurvivalFeature.ts PixelArt化仕様

## 対象ファイル

- `src/game/systems/SurvivalFeature.ts`（279 行 / 描画は `_drawMeleeSwing()` の **253-278 行のみ**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 新規 |
| `src/genres/SurvivalPlugin.ts` | 同ジャンルの背景・プレイヤー・HUD（[06](06-SurvivalPlugin.md)）。本ファイルとは別 |
| `src/data/config/survival.json` | **変更しない。** 斬撃の色・線幅・グローの定義元 |
| `src/game/ParticleSystem.ts` | レベルアップ演出の粒子（[02](02-ParticleSystem.md)）で対応済み |

## 現状（Before）

計測値: `arc` 2 / `ellipse` 0 / グラデーション 0 / `_roundRect` 0 / `lineTo` 0 /
`stroke` 2 / `fillRect` 0 / `shadowBlur` 1。

**ゲームロジックが厚く、描画は 1 メソッド（26 行）のみ。**

| 分類 | メソッド |
|---|---|
| **ゲームロジック（変更しない）** | `onInit` / `onManualUpdated` / `onDisable` / `_resetPlayer` / `update` / `_updateMeleeTimers` / `_updateHunger` / `_handleMeleeAttack` / `_resolveMeleeCollisions` / `_onEnemyKilled` / `_spawnLevelUpEffect` / `_processItemPickups` |
| **描画（対象）** | `render()`（78-83 行、`_drawMeleeSwing` を呼ぶだけ）/ `_drawMeleeSwing()`（253-278 行） |

`_drawMeleeSwing()` の現状:

```ts
ctx.globalAlpha = this.state.meleeActive / (SURVIVAL.meleeCooldown * SURVIVAL.meleeActiveRatio)
ctx.strokeStyle = SURVIVAL.meleeSwingStrokeColor
ctx.lineWidth   = SURVIVAL.meleeSwingLineWidth
ctx.shadowColor = SURVIVAL.meleeSwingShadowColor
ctx.shadowBlur  = SURVIVAL.meleeSwingShadowBlur

ctx.arc(cx, cy, range, -arc / 2, arc / 2)          // 右方向の弧
ctx.arc(cx, cy, range, Math.PI - arc / 2, ...)     // 左方向の弧
```

**特筆点: 色・線幅・グローがすべて `survival.json` から読まれており、
ハードコーディングが一切ない。** 本タスクの模範的な実装。

`range` = `SURVIVAL.meleeRange`、`arc` = `SURVIVAL.meleeArc` は
**当たり判定（`_resolveMeleeCollisions`）と同じ値を使っている。**
描画と判定が一致しているため、**描画側で範囲を変えてはならない。**

## 変更方針（PixelArt化の仕様）

### 1. 斬撃の弧（`_drawMeleeSwing`）

`ctx.arc()` + `stroke` による滑らかな円弧を、
**`px` 単位のブロックを円弧上に並べる**表現へ置換する。

`PixelCanvas` に `arcBlocks(cx, cy, r, startAngle, endAngle, color, thickness)` を追加し、
角度をステップ分割して各点を `_snap` した矩形として打つ。

```
現状:  ╭─╮   （アンチエイリアスされた円弧）
       │
変更:  ▪▪▪   （グリッドに整列したブロックの弧）
      ▪   ▪
```

- `range` / `arc` の値は**そのまま渡す**（当たり判定と一致させるため）
- `thickness` には `SURVIVAL.meleeSwingLineWidth` を渡す
- 右方向・左方向の 2 本を描く構造も変更しない

### 2. グロー

`shadowBlur`（`SURVIVAL.meleeSwingShadowBlur`）を `px.halo()` へ置換する。
`SURVIVAL.meleeSwingShadowColor` をハローの色として使う。
**JSON の値は引き続き参照する**（設定を無視してはならない）。

### 3. アルファ

`globalAlpha` の減衰（`meleeActive / (meleeCooldown * meleeActiveRatio)`）を
`px.withAlpha()` で `PIXELART.alphaSteps` 段に量子化する。
**計算式自体は変更しない。**

### 4. 変更しないもの（**本ファイルは特に厳格に**）

- 空腹の減衰と定期ダメージ（`_updateHunger`）
- 近接攻撃の当たり判定（`_resolveMeleeCollisions`）
- XP / レベルアップ曲線（`_onEnemyKilled`）
- アイテム取得（`_processItemPickups`）
- `onDisable` でのプレイヤー状態の復元
- `SURVIVAL` 設定（`survival.json`）の値
- `render()` の呼び出し条件

## 実際に行った作業内容（実装後に追記）

2026-08-23、P4 として実装完了。

- `_drawMeleeSwing()`: `ctx.arc`+`stroke` → `px.arcBlocks()`（新規使用箇所）。
  `range`/`arc` は当たり判定と同じ値をそのまま渡した（変更なし）。
  `thickness` は `SURVIVAL.meleeSwingLineWidth`（実px値）を
  `Math.round(値 / PIXELART.size)` でセル数に変換して渡した（JSONの値は読み続ける）
- `shadowBlur` → `px.halo()`
- **実装中に発見した注意点**: `px.halo()` は各段で `ctx.globalAlpha` を直接上書きするため、
  外側の `px.withAlpha()`（今回のフェードアウト計算）でネストして包んでも
  乗算されず後勝ちになる。そのため halo と本体の弧を別々の `withAlpha` 呼び出しに分離した
  （halo は等倍、本体の弧のみフェード計算を適用）。他の P1〜P4 実装済みファイルを
  確認したが、この入れ子パターンを使っていたのは本ファイルのみだった
- アルファの減衰式 `meleeActive / (meleeCooldown * meleeActiveRatio)` は無変更
- 空腹減衰・近接攻撃の当たり判定・XP/レベルアップ曲線・アイテム取得・
  `onDisable` でのプレイヤー状態復元は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `test:features`（9/9）✅。ブラウザで
`render()` を実行し例外なし。

## 懸念点・確認事項

1. **斬撃の視認性**: 斬撃は一瞬しか表示されないエフェクトのため、
   ブロック化して線が途切れがちになると**攻撃したことが分かりにくくなる**可能性がある。
   これは**推測**であり、実装後に実際にプレイして確認する。
   分かりにくい場合は `thickness` を厚くする方向で対応する
   （`meleeRange` / `meleeArc` は当たり判定と共有のため絶対に変えない）。
2. **本ファイルは描画とロジックの分離が既に良好**（`render()` が
   `_drawMeleeSwing()` を呼ぶだけ）。変更範囲を 1 メソッドに閉じ込めやすく、
   ゲームプレイ非侵害の確認もしやすい。
