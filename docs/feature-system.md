# FeatureSystem 実装ガイド

特定の `FeatureId` が有効なときだけ動く**ゲームメカニクス**を1クラスに封じ込めるインターフェース。

---

## 最小実装

```typescript
// src/game/systems/MyFeature.ts
import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'

export class MyFeature implements FeatureSystem {
  // 担当する FeatureId（複数の場合は配列で指定）
  readonly handles = ['my_feature'] as const

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('my_feature')) return

    // ゲームロジックをここに実装
    // world を経由してスコア加算・ハザード操作などが可能
  }
}
```

### 登録

```typescript
// src/game/systems/index.ts に1行追加するだけ
import { MyFeature } from './MyFeature'
registerFeature(new MyFeature())
```

---

## MutableWorld API

`update()` と `render()` は第1引数で `MutableWorld` を受け取る。

### 読み取り専用プロパティ

| プロパティ | 型 | 説明 |
|---|---|---|
| `player` | `Player` | プレイヤー状態（x, y, w, h, vx, vy, hp, exp, onGround…） |
| `hazards` | `Hazard[]` | 現在のハザードリスト（変更可） |
| `items` | `Item[]` | 現在のアイテムリスト |
| `bullets` | `Bullet[]` | 弾リスト（ShootFeature が同期） |
| `rules` | `RuntimeRules` | 現在のゲームルール（features, controls, scrollSpeed…） |
| `distance` | `number` | 走行距離 px |
| `survivedSec` | `number` | 生存時間 秒 |
| `canvas` | `HTMLCanvasElement` | Canvas 要素 |
| `ctx` | `CanvasRenderingContext2D` | 描画コンテキスト |
| `cameraX` | `number` | 横スクロール時のカメラX（ワールド→スクリーン変換に使用） |
| `gameStats` | `Readonly<GameStats>` | kills / combo / maxCombo / beatHits / beatHazardInverted |

### GameStats の読み方

```typescript
// kills や combo を参照する
const { kills, combo, beatHits } = world.gameStats
```

### スコア / UI メソッド

```typescript
world.addScore(amount)                         // プレイスコアに加算
world.addScorePopup(x, y, text, color)         // スコアポップアップ表示
world.triggerShake(intensity)                  // 画面シェイク
world.addParticle(x, y, vx, vy, life, color, size?)  // パーティクル生成
```

### ワールド操作メソッド

```typescript
world.spawnHazard(hazard)       // ハザードをスポーン
world.spawnItem(item)           // アイテムをスポーン
world.removeHazardById(hazard)  // ハザードを除去
```

### ゲーム状態操作メソッド

```typescript
world.modifyPlayerHp(delta)          // HP を増減（0になると死亡）
world.resetCombo()                   // コンボリセット
world.setTimescale(scale, duration?) // 時間スケール変更（スロー演出など）
```

### 統計書き込みメソッド（FeatureSystem 専用）

```typescript
world.setKills(n)                 // kills を直接セット
world.setCombo(n)                 // combo をセット（maxCombo も自動更新）
world.addBeatHit()                // beatHits をインクリメント
world.setBeatHazardInverted(v)    // beat_hazard の色反転フラグを更新
```

### 座標変換ヘルパー

```typescript
world.getHazardScreenX(hazard)    // ハザードのスクリーンX（モード非依存）
world.getPlayerWorldX()           // プレイヤーのワールドX（モード非依存）
```

---

## InputSnapshot

```typescript
interface InputSnapshot {
  keys:         ReadonlySet<string>   // 現在押されているキー
  justPressed:  ReadonlySet<string>   // このフレームで押されたキー
  justReleased: ReadonlySet<string>   // このフレームで離されたキー
}

// 使用例
const jumpKey = world.rules.controls.jump  // 'Space' など
if (input.justPressed.has(jumpKey)) { /* ジャンプ */ }
if (input.keys.has('z')) { /* Z を長押し */ }
```

---

## オプショナルフック一覧

| フック | 引数 | タイミング | 主な用途 |
|---|---|---|---|
| `render(ctx, world)` | ctx, world | フレーム描画時 | カスタム描画（弾・HUD） |
| `onInit(world)` | world | ジャンル確定時に1回 | 内部状態のリセット |
| `onPlayerHit(world)` | world | プレイヤー被弾時 | 被弾演出・状態変化 |
| `onPlayerDeath(world)` | world | プレイヤー死亡時 | 死亡演出 |
| `onManualUpdated(world, key)` | world, versionKey | 説明書更新時 | BPMリセット・難度調整 |
| `onComboChange(world, combo)` | world, number | コンボ変化時 | コンボエフェクト・倍率表示 |
| `onItemPickup(world, itemType)` | world, string | アイテム取得時 | アイテム別演出 |
| `onBossSpawn(world)` | world | ボススポーン時 | 警告演出 |
| `onPlayerJump(world)` | world | ジャンプの瞬間 | ジャンプ連動エフェクト |

---

## 実装例: カスタムシュートシステム

```typescript
import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { Bullet } from '../entities'

export class ChargeShot implements FeatureSystem {
  readonly handles = ['charge_shot'] as const

  private chargeTime = 0
  private readonly maxCharge = 1.5  // 秒

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const shootKey = world.rules.controls.shoot ?? 'z'

    if (input.keys.has(shootKey)) {
      this.chargeTime = Math.min(this.chargeTime + dt, this.maxCharge)
    }

    if (input.justReleased.has(shootKey) && this.chargeTime > 0.3) {
      const power = this.chargeTime / this.maxCharge
      const p = world.player
      world.bullets.push(new Bullet(
        p.x + world.cameraX + p.w,
        p.y + p.h / 2,
        900 * (1 + power),  // チャージが強いほど高速
        0,
      ))
      world.addScore(Math.round(power * 500))
      world.addScorePopup(p.x + p.w, p.y - 30, `CHARGE! ${Math.round(power * 100)}%`, '#ffaa00')
      world.triggerShake(power * 5)
      this.chargeTime = 0
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    // チャージゲージ描画
    if (this.chargeTime > 0) {
      const p = world.player
      const ratio = this.chargeTime / this.maxCharge
      ctx.fillStyle = `rgba(255, 170, 0, ${ratio})`
      ctx.fillRect(p.x - 4, p.y + p.h + 4, p.w * ratio, 3)
    }
  }

  onInit(): void {
    this.chargeTime = 0
  }
}
```

---

## handles の複数指定

1つのシステムで複数の FeatureId を担当できる。

```typescript
// いずれか1つでも active ならシステムが起動する
readonly handles = ['shoot', 'three_way', 'charge_shot', 'spread_shot'] as const

update(world, input, dt) {
  // 個別に機能を分岐
  if (world.rules.features.has('charge_shot')) { /* チャージ処理 */ }
  if (world.rules.features.has('three_way'))   { /* 三方向弾 */ }
}
```

---

## 座標系の注意

横スクロールモードでは**プレイヤーの `x` はスクリーン座標**、**ハザードの `x` はワールド座標**。  
`world.cameraX` を使って変換する。

```typescript
// ハザードの当たり判定（横スクロール時）
const hScreenX = hazard.x - world.cameraX  // ワールド → スクリーン

// 弾の発射位置（横スクロール時）
const spawnWorldX = world.player.x + world.cameraX  // スクリーン → ワールド

// 縦スクロール時はどちらもスクリーン座標なのでそのまま使う
const isVertical = world.rules.scrollAxis === 'y'
const playerX = isVertical ? world.player.x : world.player.x + world.cameraX
```
