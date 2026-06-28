# GenrePlugin 実装ガイド

ジャンルの**視覚テーマ・スポーンテーブル・ジャンル固有フック**を1クラスに集約するインターフェース。

---

## 最小実装

```typescript
// src/genres/MyGenrePlugin.ts
import type { GenrePlugin } from '../engine/GenrePlugin'
import type { SpawnEntry } from '../engine/types'
import type { GenreId } from '../domain/types'

export class MyGenrePlugin implements GenrePlugin {
  readonly id: GenreId = 'my_genre'

  // ─── 必須: 視覚テーマ ───────────────────────────────────────────
  readonly skyColors    = ['#001020', '#002040'] as const
  readonly groundColors = ['#003060', '#001030'] as const
  readonly farLayerColor = '#002050'
  readonly midLayerColor = '#001540'
  readonly starColor    = '#88aaff'

  readonly palette = {
    danger:     '#ff4444', dangerGlow: '#ff8888',
    safe:       '#44ff88', safeGlow:   '#88ffcc',
  }

  // ─── 必須: スポーンテーブル ─────────────────────────────────────
  readonly spawnTable: readonly SpawnEntry[] = [
    { shape: 'rect',   placement: 'ground', weightStart: 8, weightEnd: 4, wRange: [35,65], hRange: [40,75] },
    { shape: 'spike',  placement: 'ground', weightStart: 1, weightEnd: 4, wRange: [35,55], hRange: [50,80] },
    { shape: 'diamond',placement: 'float',  weightStart: 0, weightEnd: 3, wRange: [40,55], hRange: [40,55] },
  ]

  // ─── 必須: 描画フック ───────────────────────────────────────────
  drawFarLayer(ctx, offsetX, W, gY) {
    // 山シルエットや遠景を描く
    ctx.globalAlpha = 0.3
    ctx.fillStyle = this.farLayerColor
    // ... 描画処理 ...
    ctx.globalAlpha = 1
  }

  drawMidLayer(ctx, offsetX, W, gY) {
    // 木・建物などを描く
  }

  drawPlayer(ctx, w, h, onGround, runCycle) {
    // プレイヤーの外見を描く（translate 済み座標系）
  }
}
```

### 登録

```typescript
// ファイル末尾で default export するだけ。
// src/genres/index.ts が import.meta.glob で自動収集するため index.ts の編集は不要。
export default new MyGenrePlugin()
```

> `BasePlugin.ts` のように複数クラスを `export default [new A(), new B()]` の配列で返すこともできる。

---

## SpawnEntry 詳細

```typescript
interface SpawnEntry {
  // ─ 必須 ─
  shape: 'rect' | 'spike' | 'pillar' | 'diamond'
  placement: 'ground' | 'air' | 'float'
  weightStart: number   // 距離0での出現重み
  weightEnd: number     // maxDist での出現重み（線形補間）
  wRange: [number, number]  // 幅 [min, max] px
  hRange: [number, number]  // 高さ [min, max] px

  // ─ 省略可 ─
  safeChance?: number         // 安全色で出現する確率 0〜1
  hpOverride?: number         // enemy_hp 時の HP（デフォルト SPAWN.enemyHpAmount=3）
  floatAmpRange?: [number, number] // float 時の浮遊振幅 [min, max] px
  pulseSpeed?: number         // パルスアニメ角速度 rad/s
  glowBlurOverride?: number   // グロー強度（0=無効）
  colorOverride?: string      // danger 色強制
  safeColorOverride?: string  // safe 色強制
  collisionGrace?: number     // 判定縮小ピクセル数（デフォルト 4）
  weightMaxDist?: number      // 補間の最大距離 px（デフォルト 3000）
  isBoss?: boolean            // true でスポーン時に onBossSpawn フック呼び出し
  minDist?: number            // 出現開始距離 px
  maxDist?: number            // 出現終了距離 px
  groupId?: string            // スポーングループ ID（将来拡張）
  spawnCondition?: (distance, rules) => boolean  // 動的条件
}
```

---

## オプショナルプロパティ

### 視覚チューニング

```typescript
// 視差スクロール係数（省略時は CAMERA の定数を使用）
readonly parallax = {
  stars: 0.02,  // 星が最も遅く流れる
  far:   0.08,  // 遠景
  mid:   0.25,  // 中景
}

// 星フィールドのカスタマイズ
readonly starConfig = {
  density:    24,             // セクターあたりの星数
  sizeRange:  [1, 3] as const,
  alphaRange: [0.2, 0.8] as const,
}

// ハザード演出のカスタマイズ
readonly hazardConfig = {
  glowBlur:       18,   // shadowBlur
  pulseSpeed:     2.0,  // rad/s
  pulseAmplitude: 0.12, // 0〜1
}

// プレイヤーのスケール（デフォルト 1.0）
readonly playerScale = 1.2

// パーティクル色上書き
readonly particleColors = {
  jump:  '#00ffaa',
  land:  '#00aa88',
  hit:   '#ff4444',
  death: ['#ff0000', '#ff8800', '#ffff00'] as const,
}

// 地面ラインの透明度（デフォルト 0.08）
readonly groundLineAlpha = 0.05

// スクロール速度ボーナス px/s
readonly scrollSpeedBonus = 50
```

---

## オプショナルフック一覧

| フック | タイミング | 主な用途 |
|---|---|---|
| `onGenreLocked(world)` | ジャンル確定直後に1回 | BGM変更・初期エフェクト |
| `onUpdate(world, dt)` | 毎フレーム | ジャンル全体の継続処理 |
| `drawHazard(ctx, hazard, sx, world)` | ハザード描画前 | カスタムハザード外見（`true` 返却でデフォルト描画をスキップ） |
| `drawForeground(ctx, offsetX, W, H, gY)` | パーティクルの後 | 前景レイヤー（波・霧など） |
| `drawGenreHUD(ctx, world, W, H)` | フレーム描画の最後 | ボスHPバー・タワー残数など |
| `onPlayerJump(world)` | ジャンプの瞬間 | ジャンプSEキュー・エフェクト |
| `onPlayerLand(world)` | 着地の瞬間 | ランディングエフェクト |
| `onHazardDestroyed(world, hazard)` | ハザード撃破時 | ドロップアイテム生成・撃破演出 |
| `onManualUpdated(world, versionKey)` | 説明書バージョン更新時 | テーマ変化・BGMテンポ更新 |

### drawHazard の使い方

```typescript
drawHazard(ctx, hazard, sx, world): boolean {
  if (hazard.shape !== 'diamond') return false  // false = デフォルト描画を使う

  // カスタム描画
  ctx.fillStyle = '#ff00ff'
  ctx.beginPath()
  ctx.arc(sx + hazard.w / 2, hazard.y + hazard.h / 2, hazard.w / 2, 0, Math.PI * 2)
  ctx.fill()
  return true  // true = デフォルト描画をスキップ
}
```

---

## DarkThemePlugin 継承

`src/genres/BasePlugin.ts` の `DarkThemePlugin` を継承すると山シルエット・建物シルエット・プレイヤー描画が共有できる。

```typescript
import { DarkThemePlugin } from './BasePlugin'

export class MyGenrePlugin extends DarkThemePlugin {
  readonly id: GenreId = 'my_genre'

  // 色とスポーンテーブルだけ上書きすればよい
  readonly skyColors = ['#001020', '#002040'] as const
  // ... その他のカラー ...
  readonly spawnTable = [ ... ]
}
```

`DarkThemePlugin` が提供するデフォルト実装:
- `drawFarLayer()` — sin 波合成の山シルエット
- `drawMidLayer()` — 疑似ランダム建物シルエット
- `drawPlayer()` — 人型キャラクタ（ランニングアニメ付き）
