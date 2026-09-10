/**
 * game/systems/PatternRunnerFeature.ts
 * 'pattern_runner' フィーチャー（runner / bullet_runner 共通）。
 *
 * 手作りの区間パターン（src/data/patterns/runner.json）をプールから均一確率で選び、
 * 固定長（RUNNER_PATTERN_LENGTH_PX）で連結してエンドレスに生成する。
 * 既存の spawnTable による重み付きランダム生成は使わない（plan/spec-pattern-system.md）。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { PatternEntry, BulletRunnerEnemySpot } from '../../engine/patternTypes'
import { Hazard } from '../entities'
import { getGenre } from '../../engine/GameRegistry'
import {
  RUNNER_PATTERNS, RUNNER_PATTERN_LENGTH_PX, pickRandomPattern, BULLET_RUNNER_ENEMY_OVERLAYS,
} from '../../framework/PatternLoader'
import { BACKGROUND, CAMERA } from '../../data/tunables'

// カメラより十分先に区間を生成しておく先読み距離（px）。パターン長より大きく取る。
const SPAWN_LOOKAHEAD_PX = 1400

// 開始直後、ギミックを一切出現させない猶予期間（秒）。プレイヤーに操作を理解する時間を与える。
const GRACE_PERIOD_SEC = 5

// 猶予期間が明けて生成を再開する際、画面右端よりさらに奥から生成するための追加マージン（px）。
// これが無いとカメラ直前（画面内）に突然出現して見える。
const SPAWN_ENTRY_MARGIN_PX = 120

// Bullet Runner: 倒せる敵の「ふわふわ浮遊」上下振幅（px）。壊せないトゲ（地面固定）と
// 見た目・挙動の両方で明確に区別するため使用する
const ENEMY_FLOAT_AMP_PX = 10

export class PatternRunnerFeature implements FeatureSystem {
  readonly handles = ['pattern_runner'] as const

  private nextPatternStartX = 0
  private lastPatternId: string | null = null
  private elapsedSec = 0
  private graceOver = false

  onInit(): void {
    this.nextPatternStartX = 0
    this.lastPatternId = null
    this.elapsedSec = 0
    this.graceOver = false
  }

  onDisable(): void {
    this.nextPatternStartX = 0
    this.lastPatternId = null
    this.elapsedSec = 0
    this.graceOver = false
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('pattern_runner')) return

    this.elapsedSec += dt
    if (this.elapsedSec < GRACE_PERIOD_SEC) return

    if (!this.graceOver) {
      this.graceOver = true
      // 猶予期間が明けた時点のプレイヤー位置「画面右端の外側」から区間パターンの
      // 生成を開始する。distance をそのまま使うと画面内（カメラ直前）に生成されて
      // 突然出現したように見えるため、右端より確実に外側から流れ込んでくるようにする。
      const offscreenMargin = Math.max(0, world.canvas.width - CAMERA.leadOffset) + SPAWN_ENTRY_MARGIN_PX
      this.nextPatternStartX = world.distance + offscreenMargin
    }

    while (this.nextPatternStartX - world.distance < SPAWN_LOOKAHEAD_PX) {
      this._spawnNextPattern(world)
    }
  }

  private _spawnNextPattern(world: MutableWorld): void {
    if (RUNNER_PATTERNS.length === 0) {
      this.nextPatternStartX += RUNNER_PATTERN_LENGTH_PX
      return
    }
    const pattern = pickRandomPattern(RUNNER_PATTERNS, this.lastPatternId)
    const originX = this.nextPatternStartX
    const gY = world.canvas.height - BACKGROUND.groundHeight
    for (const entry of pattern.entries) {
      world.spawnHazard(this._buildHazard(world, entry, originX, gY))
    }

    // Bullet Runner: enemy_hp 有効時のみ、パターンに対応する敵オーバーレイを重ねて生成する
    // （Runner 単体では enemy_hp が無効なため、この分岐は素通りする）
    if (world.rules.features.has('enemy_hp')) {
      const overlay = BULLET_RUNNER_ENEMY_OVERLAYS.get(pattern.id)
      if (overlay) {
        for (const spot of overlay.spots) {
          if (Math.random() < spot.spawnChance) {
            world.spawnHazard(this._buildEnemyHazard(world, spot, originX, gY))
          }
        }
      }
    }

    this.lastPatternId = pattern.id
    this.nextPatternStartX = originX + RUNNER_PATTERN_LENGTH_PX
  }

  private _buildHazard(world: MutableWorld, entry: PatternEntry, originX: number, gY: number): Hazard {
    const plugin = getGenre(world.rules.genre)
    const pal = plugin.palette
    const gp = plugin.gimmickPalette
    const worldX = originX + entry.x

    if (entry.kind === 'spring') {
      // 地面に乗る物体は「下端」を entry.y の高さに合わせ、上へ entry.h 分伸ばす
      // （上端基準にすると entry.y=0 のとき地面に埋まってしまう）
      const spec = gp?.spring ?? { color: pal.safe, glow: pal.safeGlow }
      const worldY = gY - entry.y - entry.h
      const hz = new Hazard(worldX, worldY, entry.w, entry.h, spec.color, spec.glow, 'diamond', 1, true)
      hz.isSpring = true
      hz.isGimmick = true
      return hz
    }

    if (entry.kind === 'spike') {
      // 地面に乗る物体は下端基準（spring と同様）
      const spec = gp?.spike ?? { color: pal.danger, glow: pal.dangerGlow }
      const worldY = gY - entry.y - entry.h
      const hz = new Hazard(worldX, worldY, entry.w, entry.h, spec.color, spec.glow, 'spike', 1, false)
      // トゲは壊せない障害物（isGimmick）として弾の当たり判定から除外する。
      // これにより「トゲ=壊せない」「浮遊する敵（diamond）=撃破可能」の区別が成立する（bullet_runner）
      hz.isGimmick = true
      return hz
    }

    // oneWayPlatform: 着地面（上端）の高さが entry.y になるよう上端基準で配置する
    const spec = gp?.platform ?? { color: pal.safe, glow: pal.safeGlow }
    const worldY = gY - entry.y
    const hz = new Hazard(worldX, worldY, entry.w, entry.h, spec.color, spec.glow, 'rect', 1, true)
    hz.isPlatform = true
    hz.isOneWay = true
    hz.isGimmick = true
    hz.driftEnabled = entry.driftEnabled ?? false
    hz.conveyorVx = entry.conveyorVx ?? 0
    return hz
  }

  /**
   * Bullet Runner 専用: 敵オーバーレイの1スポットから Hazard を生成する。
   * isGimmick を付けない（既定 false）ため ShootFeature の弾衝突対象になる。
   * ジャンプで回避することも、撃破することも可能（plan/spec-bullet-runner.md）。
   */
  private _buildEnemyHazard(world: MutableWorld, spot: BulletRunnerEnemySpot, originX: number, gY: number): Hazard {
    const pal = getGenre(world.rules.genre).palette
    const worldX = originX + spot.x
    const worldY = gY - spot.y - spot.h
    return new Hazard(
      worldX, worldY, spot.w, spot.h, pal.danger, pal.dangerGlow, 'diamond', spot.hpOverride, false,
      ENEMY_FLOAT_AMP_PX,
    )
  }
}
