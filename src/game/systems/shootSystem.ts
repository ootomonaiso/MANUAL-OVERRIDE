import type { RuntimeRules } from '../../domain/types'
import { Bullet, Hazard, rectsOverlap } from '../entities'
import { SHOOT } from '../../data/tunables'

export interface ShootState {
  bullets: Bullet[]
  kills: number
  combo: number
  comboTimer: number   // コンボリセットまでの秒数
  shotCooldown: number // 秒
}

export function createShootState(): ShootState {
  return { bullets: [], kills: 0, combo: 0, comboTimer: 0, shotCooldown: 0 }
}

export interface ShootResult {
  scoreGain: number
  destroyedHazards: Hazard[]
  shotFired: boolean
}

/**
 * @param playerX  横スクロール時はワールドX、縦スクロール時はスクリーンX
 * @param playerY  スクリーンY（両モード共通）
 * @param playerH  プレイヤー高さ
 * @param viewportLeft  カリング左端（横モード: cameraX - margin、縦モード: 0）
 * @param viewportRight カリング右端（横モード: cameraX + canvasW、縦モード: canvasW）
 * @param viewportTop   カリング上端（縦モード: -100）
 */
export function updateShoot(
  state: ShootState,
  hazards: Hazard[],
  shootPressed: boolean,
  playerX: number,
  playerY: number,
  playerH: number,
  rules: RuntimeRules,
  dt: number,
  viewportLeft = -200,
  viewportRight = 9999,
  viewportTop = -200,
): ShootResult {
  state.shotCooldown -= dt
  state.comboTimer -= dt
  if (state.comboTimer <= 0) state.combo = 0

  const isVertical = rules.scrollAxis === 'y'
  let shotFired = false

  // ─── 発射 ────────────────────────────────────────────────
  if (shootPressed && state.shotCooldown <= 0 && rules.features.has('shoot')) {
    state.shotCooldown = SHOOT.shotCooldown
    const spd = SHOOT.bulletSpeed
    shotFired = true

    if (isVertical) {
      // 縦モード: プレイヤー上部中心から上方向へ
      const bx = playerX + SHOOT.bulletWidth / 2
      const by = playerY - SHOOT.bulletHeight
      if (rules.features.has('spread_shot')) {
        // 扇状に spreadShotCount 方向へ発射（基準方向: 上 = -Y）
        const half = (SHOOT.spreadShotCount - 1) / 2
        for (let i = 0; i < SHOOT.spreadShotCount; i++) {
          const angle = -Math.PI / 2 + (i - half) * SHOOT.spreadAngleStepRad
          state.bullets.push(new Bullet(bx, by, Math.cos(angle) * spd, Math.sin(angle) * spd))
        }
      } else if (rules.features.has('three_way')) {
        state.bullets.push(
          new Bullet(bx, by, 0, -spd),
          new Bullet(bx, by, -spd * SHOOT.threeWayYRatio, -spd * SHOOT.threeWaySpeedRatio),
          new Bullet(bx, by,  spd * SHOOT.threeWayYRatio, -spd * SHOOT.threeWaySpeedRatio),
        )
      } else {
        state.bullets.push(new Bullet(bx, by, 0, -spd))
      }
    } else {
      // 横モード: プレイヤー右端中央から右へ（playerX はワールドX）
      const bx = playerX + SHOOT.bulletWidth
      const by = playerY + playerH / 2 - SHOOT.bulletHeight / 2
      if (rules.features.has('spread_shot')) {
        // 扇状に spreadShotCount 方向へ発射（基準方向: 右 = +X）
        const half = (SHOOT.spreadShotCount - 1) / 2
        for (let i = 0; i < SHOOT.spreadShotCount; i++) {
          const angle = (i - half) * SHOOT.spreadAngleStepRad
          state.bullets.push(new Bullet(bx, by, Math.cos(angle) * spd, Math.sin(angle) * spd))
        }
      } else if (rules.features.has('three_way')) {
        state.bullets.push(
          new Bullet(bx, by, spd, 0),
          new Bullet(bx, by, spd * SHOOT.threeWaySpeedRatio, -spd * SHOOT.threeWayYRatio),
          new Bullet(bx, by, spd * SHOOT.threeWaySpeedRatio,  spd * SHOOT.threeWayYRatio),
        )
      } else {
        state.bullets.push(new Bullet(bx, by, spd, 0))
      }
    }
  }

  // ─── 弾移動 ──────────────────────────────────────────────
  for (const b of state.bullets) {
    b.x += b.vx * dt
    b.y += b.vy * dt
    // カリング
    if (isVertical) {
      if (b.y < viewportTop) b.alive = false
    } else {
      if (b.x > viewportRight || b.x < viewportLeft) b.alive = false
    }
  }

  // ─── 弾 × 障害物 衝突 ───────────────────────────────────
  let scoreGain = 0
  for (const b of state.bullets) {
    if (!b.alive) continue
    for (const h of hazards) {
      if (h.isSafe) continue
      if (rectsOverlap(b.rect, h.rect)) {
        b.alive = false
        if (rules.features.has('enemy_hp')) {
          h.hp--
          if (h.hp <= 0) {
            state.kills++
            state.combo++
            state.comboTimer = SHOOT.comboResetTime
            scoreGain += SHOOT.baseScorePerKill * state.combo
          }
        } else {
          h.hp = 0
          state.kills++
          state.combo++
          state.comboTimer = SHOOT.comboResetTime
          scoreGain += SHOOT.baseScorePerKill * state.combo
        }
        break
      }
    }
  }

  // 死亡 hazard 除去（除去前に記録）
  const destroyedHazards: Hazard[] = []
  for (let i = hazards.length - 1; i >= 0; i--) {
    if (hazards[i].hp <= 0) {
      destroyedHazards.push(hazards[i])
      hazards.splice(i, 1)
    }
  }

  // 死弾除去
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    if (!state.bullets[i].alive) state.bullets.splice(i, 1)
  }

  return { scoreGain, destroyedHazards, shotFired }
}
