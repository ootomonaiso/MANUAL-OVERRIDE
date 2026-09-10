/**
 * game/systems/AquaticFeature.ts
 * 'pattern_descend' フィーチャー（aquatic）。
 *
 * 手作りのセグメントパターン（src/data/patterns/aquatic.json）をプールから均一確率で選び、
 * 固定長（AQUATIC_SEGMENT_LENGTH_PX）で縦方向に連結してエンドレスに生成する
 * （Runner の横エンドレス連結を縦方向に転用した第3の形。plan/spec-aquatic.md）。
 *
 * 重力・ジャンプ・一方通行足場への着地・流れゾーンの力・画面外死亡判定は
 * sideScroller.ts の _updateAquaticDescent が物理レイヤーとして担当する。
 * このクラスはセグメントの先読み生成のみを担当する（PatternRunnerFeature と同じ責務分割）。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { PatternEntry } from '../../engine/patternTypes'
import { Hazard } from '../entities'
import { getGenre } from '../../engine/GameRegistry'
import {
  AQUATIC_PATTERNS, AQUATIC_SEGMENT_LENGTH_PX, AQUATIC_REFERENCE_WIDTH_PX, pickRandomPattern,
} from '../../framework/PatternLoader'
import { HUD_SAFEZONE, AQUATIC_TUNING } from '../../data/tunables'

// カメラ（スクロール）より十分先にセグメントを生成しておく先読み距離（px）。セグメント長より大きく取る。
const SPAWN_LOOKAHEAD_PX = 1100

// 開始直後、ギミックを一切出現させない猶予期間（秒）。プレイヤーに操作を理解する時間を与える。
const GRACE_PERIOD_SEC = 3

// 猶予期間が明けて生成を再開する際、画面下端よりさらに奥から生成するための追加マージン（px）。
// これが無いとカメラ直前（画面内）に突然出現して見える。
const SPAWN_ENTRY_MARGIN_PX = 120

export class AquaticFeature implements FeatureSystem {
  readonly handles = ['pattern_descend'] as const

  private nextSegmentStartDepth = 0
  private lastPatternId: string | null = null
  private elapsedSec = 0
  private graceOver = false

  onInit(): void {
    this.nextSegmentStartDepth = 0
    this.lastPatternId = null
    this.elapsedSec = 0
    this.graceOver = false
  }

  onDisable(): void {
    this.nextSegmentStartDepth = 0
    this.lastPatternId = null
    this.elapsedSec = 0
    this.graceOver = false
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('pattern_descend')) return

    this.elapsedSec += dt
    if (this.elapsedSec < GRACE_PERIOD_SEC) return

    if (!this.graceOver) {
      this.graceOver = true
      // 猶予期間が明けた時点のプレイヤー位置「画面下端の外側」からセグメントの生成を
      // 開始する。distance をそのまま使うと画面内（可視範囲）に生成されて突然出現した
      // ように見えるため、下端より確実に外側から流れ込んでくるようにする。
      const offscreenMargin = world.canvas.height + SPAWN_ENTRY_MARGIN_PX
      this.nextSegmentStartDepth = world.distance + offscreenMargin
    }

    while (this.nextSegmentStartDepth - world.distance < SPAWN_LOOKAHEAD_PX) {
      this._spawnNextSegment(world)
    }
  }

  private _spawnNextSegment(world: MutableWorld): void {
    if (AQUATIC_PATTERNS.length === 0) {
      this.nextSegmentStartDepth += AQUATIC_SEGMENT_LENGTH_PX
      return
    }
    const pattern = pickRandomPattern(AQUATIC_PATTERNS, this.lastPatternId)
    const originDepth = this.nextSegmentStartDepth
    const H = world.canvas.height
    const { min: bandMinX, max: bandMaxX } = this._bandX(world)
    const scale = (bandMaxX - bandMinX) / AQUATIC_REFERENCE_WIDTH_PX

    for (const entry of pattern.entries) {
      world.spawnHazard(this._buildHazard(world, entry, originDepth, H, bandMinX, scale))
    }

    this.lastPatternId = pattern.id
    this.nextSegmentStartDepth = originDepth + AQUATIC_SEGMENT_LENGTH_PX
  }

  /** Aquatic の水平可動域（画面端の左右を除いた帯）。vstg と同じ比率を使う（platformer の _climbBandX と同じ考え方） */
  private _bandX(world: MutableWorld): { min: number; max: number } {
    const W = world.canvas.width
    return { min: W * HUD_SAFEZONE.vstgLeftRatio, max: W * (1 - HUD_SAFEZONE.vstgRightRatio) }
  }

  private _buildHazard(
    world: MutableWorld, entry: PatternEntry, originDepth: number, H: number, bandMinX: number, scale: number,
  ): Hazard {
    const plugin = getGenre(world.rules.genre)
    const pal = plugin.palette
    const gp = plugin.gimmickPalette
    const worldX = bandMinX + entry.x * scale
    const worldW = entry.w * scale
    // direction:'left' = 画面下から出現し上へ流れる（既存の縦スクロール規約）。
    // 生成時のYは「H + セグメント原点からの深さ - 現在の距離」で計算し、以後は
    // 毎フレームの一律スクロールに委ねる（PatternRunnerFeature の worldX = originX + entry.x
    // と同じ考え方を、直接Y移動方式の縦スクロールに合わせて置き換えたもの。plan/spec-aquatic.md）
    const worldY = H + originDepth + entry.y - world.distance

    if (entry.kind === 'spike') {
      const spec = gp?.spike ?? { color: pal.danger, glow: pal.dangerGlow }
      const hz = new Hazard(worldX, worldY, entry.w * scale, entry.h, spec.color, spec.glow, 'spike', 1, false, 0, 'left')
      hz.isGimmick = true
      return hz
    }

    if (entry.kind === 'current') {
      const hz = new Hazard(worldX, worldY, worldW, entry.h, 'rgba(80,180,255,0.18)', 'rgba(160,220,255,0.4)', 'rect', 1, true, 0, 'left')
      hz.isGimmick = true
      hz.isCurrentZone = true
      hz.currentVx = entry.currentVx ?? AQUATIC_TUNING.currentVxPxPerSec
      return hz
    }

    // oneWayPlatform: 岩本体（driftEnabled:true でふわふわ足場）。着地面（上端）の高さが
    // entry.y になるよう上端基準で配置する
    const spec = gp?.platform ?? { color: pal.safe, glow: pal.safeGlow }
    const hz = new Hazard(worldX, worldY, worldW, entry.h, spec.color, spec.glow, 'rect', 1, true, 0, 'left')
    hz.isPlatform = true
    hz.isOneWay = true
    hz.isGimmick = true
    hz.driftEnabled = entry.driftEnabled ?? false
    return hz
  }
}
