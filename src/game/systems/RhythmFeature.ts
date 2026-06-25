import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { BeatMarker } from '../entities'
import { RHYTHM_TUNING } from '../../data/tunables'

// JUST 判定の最低 quality 閾値（これを下回るとボーナスなし）
const JUST_QUALITY_THRESHOLD = 0.5
// JUST ボーナスの基準スコア（quality=1.0 時の最大値）
const JUST_BASE_SCORE = 150

interface RhythmState {
  beatInterval: number
  nextBeat: number
  beatCount: number
  beatMarkers: BeatMarker[]
  beatHazardInverted: boolean
  beatHits: number
  justWindowMs: number
}

export class RhythmFeature implements FeatureSystem {
  readonly handles = ['beat_hazard', 'just_input', 'beat_dash'] as const

  private state: RhythmState

  constructor(bpm = 120) {
    this.state = this._fresh(bpm)
  }

  private _fresh(bpm: number): RhythmState {
    const beatInterval = (60 / bpm) * 1000
    return {
      beatInterval,
      nextBeat: beatInterval,
      beatCount: 0,
      beatMarkers: [],
      beatHazardInverted: false,
      beatHits: 0,
      justWindowMs: RHYTHM_TUNING.justWindowSec * 1000,
    }
  }

  onInit(world: MutableWorld): void { this.state = this._fresh(world.rules.bpm) }
  onManualUpdated(world: MutableWorld): void { this.state = this._fresh(world.rules.bpm) }

  update(world: MutableWorld, input: InputSnapshot, dt: number): void {
    const r = world.rules
    const s = this.state
    const dtMs = dt * 1000

    const hasAnyRhythm = r.features.has('beat_hazard') || r.features.has('just_input') || r.features.has('beat_dash')
    if (!hasAnyRhythm) return

    // ビートクロックはリズム系フィーチャーが1つでも有効なら常に進める。
    // beat_hazard が無効でも just_input がビートクロックを参照できるようにするため。
    s.nextBeat -= dtMs
    s.beatMarkers.forEach(m => { m.t -= dtMs })
    s.beatMarkers = s.beatMarkers.filter(m => m.t > 0)

    if (s.nextBeat <= 0) {
      s.nextBeat += s.beatInterval
      s.beatCount++

      if (r.features.has('beat_hazard')) {
        s.beatHazardInverted = s.beatCount % 2 === 0
        s.beatMarkers.push({ t: 400, x: Math.random() * 600 + 100, strength: 1 })
      }
    }

    if (r.features.has('beat_hazard')) {
      world.setBeatHazardInverted(s.beatHazardInverted)
    }

    if (!r.features.has('just_input')) return

    const jumpKey  = r.controls.jump
    const shootKey = r.controls.shoot ?? 'z'
    if (input.justPressed.has(jumpKey) || input.justPressed.has(shootKey)) {
      const phase = (s.beatInterval - s.nextBeat) % s.beatInterval
      const dist  = Math.min(phase, s.beatInterval - phase)
      const quality = dist <= s.justWindowMs ? 1 - dist / s.justWindowMs : 0
      if (quality > JUST_QUALITY_THRESHOLD) {
        const bonus = Math.round(JUST_BASE_SCORE * quality)
        s.beatHits++
        world.addBeatHit()
        world.addScore(bonus)
        const p = world.player
        world.addScorePopup(p.x + p.w, p.y - 30, `JUST! +${bonus}`, '#ff00ff')
        world.addParticle(p.x + p.w / 2, p.y, 0, -80, 0.4, '#ff00ff', 4)
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('beat_hazard') || this.state.beatMarkers.length === 0) return

    const gY = world.canvas.height - 80
    ctx.save()
    for (const m of this.state.beatMarkers) {
      ctx.globalAlpha = (m.t / 400) * 0.3
      ctx.strokeStyle = '#ff00ff'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(m.x, 0)
      ctx.lineTo(m.x, gY)
      ctx.stroke()
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    ctx.restore()
  }
}
