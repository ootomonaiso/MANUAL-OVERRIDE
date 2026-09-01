# ShootFeature.ts PixelArt化仕様

## 対象ファイル

- `src/game/systems/ShootFeature.ts`（240 行 / 描画は `render()` の **47-65 行のみ**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 新規 |
| `src/data/config/hazard_vfx.json` | **変更しない。** `glowBlur` を参照している |
| `src/data/config/shoot.json` | **変更しない。** 弾速・連射間隔・ダメージの定義元 |
| `src/game/entities.ts` | **変更しない。** `Bullet`（`w=14, h=5`、`trail` 配列）の定義元 |
| `src/genres/StgPlugin.ts` / `AerialStgPlugin.ts` | 弾と敵の見た目の整合を確認する（[04](04-StgPlugin.md) / [05](05-AerialStgPlugin.md)） |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 0 / グラデーション 0 / `_roundRect` 0 / `lineTo` 0 /
`stroke` 0 / **`fillRect` 2** / `shadowBlur` 1。

**ゲームロジックが厚く、描画は 19 行のみ。** しかも既に `fillRect` のみで構成されており、
**PixelArt との相性が最も良いファイルの一つ。**

```ts
render(ctx, world): void {
  if (world.bullets.length === 0) return
  const isVertical = world.rules.scrollAxis === 'y'

  ctx.save()
  ctx.shadowColor = '#ffff88'                        // 直書き
  ctx.shadowBlur  = HAZARD_VFX.glowBlur * 0.6        // JSON 由来 × 直書きの係数
  ctx.fillStyle   = '#ffff00'                        // 直書き
  for (const b of world.bullets) {
    const sx = isVertical ? b.x : b.x - world.cameraX
    if (isVertical) ctx.fillRect(sx - 2, b.y - 4, 4, 8)   // 縦向きの弾
    else            ctx.fillRect(sx - 4, b.y - 2, 8, 4)   // 横向きの弾
  }
  ctx.restore()
}
```

- スクロール軸によって弾の向き（縦長 / 横長）を切り替えている
- 弾の描画サイズは `4×8` / `8×4` の**直書き**
- `Bullet` は `trail: {x,y}[]` を持つが（`entities.ts:91`）、**現状は描画に使われていない**

## 変更方針（PixelArt化の仕様）

### 1. 弾本体

`fillRect` 2 箇所は既にドット絵と親和的。座標を `_snap` するのみ。

ただし現状は**単色のベタ塗り**のため、ドット絵らしさを増すために
**2 階調のブロック**にする。

```
現状:  ████     （単色 #ffff00）
変更:  ▓███▓    （中心は明色、両端は 1px の中間色）
```

弾は小さく高速に動くため、階調を増やしすぎると視認性が落ちる。
**2 階調にとどめる**。

### 2. グロー

`shadowBlur` を `px.halo()` へ置換する。
`shadowColor = '#ffff88'` をハローの色として使う。

弾のグローは STG の視認性に直結するため、
**ハローの段数は他より 1 段多くしたくなる可能性がある**が、
まずは共通設定（`PIXELART.haloSteps`）で実装し、
不足であればユーザーに相談する。

### 3. `HAZARD_VFX.glowBlur * 0.6` の係数

`0.6` は直書きだが、`px.halo()` への置換で `shadowBlur` を使わなくなるため、
この係数の扱いを決める必要がある。

**方針:** ハローの段数を `Math.round(PIXELART.haloSteps * 0.6)` のように
既存の係数で減衰させるのではなく、
**弾には共通の `haloSteps` をそのまま使う**（係数は不要になる）。
係数が消えることで直書きが 1 つ減る。

### 4. 変更しないもの（**本ファイルは特に厳格に**）

- 発射クールダウン・オートファイア（`_tickTimers` / `_fireBullets`）
- 3 方向・拡散の発射パターン（`_spawnVerticalBullets` / `_spawnHorizontalBullets`）
- 弾の移動（`_moveBullets`）
- **弾とハザードの衝突判定**（`_resolveBulletHazardCollisions`）
- 敵 HP・コンボ・スコア（`_applyScoreAndEvents` / `_syncWorldStats`）
- `onComboChange` の他システムへの通知
- `SHOOT` 設定（`shoot.json`）の値
- `isVertical` によるスクロール軸の分岐
- **弾の描画サイズ `4×8` / `8×4`**（衝突判定は `Bullet.w=14, h=5` を使っており
  描画サイズとは既に異なるが、見た目の大きさを変えると
  プレイヤーの当たり判定の認識が変わるため触らない）

## 実際に行った作業内容（実装後に追記）

2026-08-23、P4 として実装完了。

- `shadowBlur` → `px.halo()`。`glowColor` は `#ffff88`（元の直書き値のまま）。
  `HAZARD_VFX.glowBlur * 0.6` の係数は仕様通り不要になり、`PIXELART.haloSteps` を
  そのまま使用（`HAZARD_VFX` のimportも不要になり削除）
- 弾本体を2階調のブロックに変更（外周1セルが `#e0e000`、内側が元の `#ffff00`）
- 弾の描画サイズ（`4×8`/`8×4`）・`isVertical` の分岐・全ゲームロジック
  （発射クールダウン・衝突判定・スコア・コンボ等）は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `test:features`（9/9）✅。ブラウザで
`render()` を横スクロール・縦スクロール両方の弾で実行し例外なし。

## 懸念点・確認事項（更新）

上記の未変更方針に加え、以下は報告のみで対応していない（元々の仕様書の指摘通り）:
1. 描画サイズ（`4×8`/`8×4`）と当たり判定サイズ（`Bullet.w=14,h=5`）の不一致は
   PixelArt化以前からの既存差異であり、本タスクでは変更しない。
2. `Bullet.trail` は引き続き未使用（仕様追加にあたるため有効化しない）。

## 懸念点・確認事項

1. **描画サイズと当たり判定の不一致（既存）**: `Bullet` は `w=14, h=5` だが
   描画は `8×4` / `4×8` であり、**当たり判定より小さく描かれている**。
   これは PixelArt 化以前からの既存の状態であり、
   本タスクでは変更せず**報告のみ行う**。
2. **`trail` 配列が未使用**: `Bullet.trail`（`entities.ts:91`）は
   定義されているが描画で使われていない。デッドコードと**推測**される。
   ドット絵の弾に軌跡を付けると見栄えが良くなるが、
   **未使用の機能を有効化するのは仕様追加**にあたるため本タスクでは行わない。
   希望があればユーザーの指示を待つ。
3. **本ファイルは変更量が最小級**（実質 `render()` の 19 行のみ）。
