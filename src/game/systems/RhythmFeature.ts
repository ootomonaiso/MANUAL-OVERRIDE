import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import type { BeatMarker } from '../entities'
import { RHYTHM_TUNING, UI, PIXELART } from '../../data/tunables'
import { soundManager } from '../../plugins/SoundManager'
import { PixelCanvas } from '../render'

interface RhythmState {
  beatInterval: number
  nextBeat: number
  beatCount: number
  beatMarkers: BeatMarker[]
  beatHazardInverted: boolean
  beatHits: number
  justWindowMs: number
  // beat_hazardの再有効化を検出する（無効→有効のトランジションでbeatHazardInvertedをリセット）
  prevBeatHazardActive: boolean
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
      prevBeatHazardActive: false,
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

    // beat_hazard の再有効化を検出。無効→有効のトランジションで beatHazardInverted をリセット。
    // これにより、無効期間中に進んだビートクロックの影響が再有効化時に反映されない。
    const beatHazardActive = r.features.has('beat_hazard')
    if (beatHazardActive && !s.prevBeatHazardActive) {
      s.beatHazardInverted = false
    }
    s.prevBeatHazardActive = beatHazardActive

    if (s.nextBeat <= 0) {
      s.nextBeat += s.beatInterval
      s.beatCount++
      soundManager.onBeat(r.bpm)

      if (beatHazardActive) {
        s.beatHazardInverted = s.beatCount % 2 === 0
        s.beatMarkers.push({ t: 400, x: Math.random() * 600 + 100, strength: 1 })
      }
    }

    if (beatHazardActive) {
      world.setBeatHazardInverted(s.beatHazardInverted)
    }

    if (!r.features.has('just_input')) return

    const jumpKey  = r.controls.jump
    const shootKey = r.controls.shoot ?? 'z'
    if (input.justPressed.has(jumpKey) || input.justPressed.has(shootKey)) {
      const phase = (s.beatInterval - s.nextBeat) % s.beatInterval
      const dist  = Math.min(phase, s.beatInterval - phase)
      const quality = dist <= s.justWindowMs ? Math.max(0, 1 - dist / s.justWindowMs) : 0
      if (quality > RHYTHM_TUNING.justInputMinQuality) {
        const bonus = Math.round(RHYTHM_TUNING.justInputScoreBase * quality)
        s.beatHits++
        world.addBeatHit()
        world.addScore(bonus)
        const p = world.player
        world.addScorePopup(p.x + p.w, p.y + RHYTHM_TUNING.justInputPopupOffsetY, `JUST! +${bonus}`, '#ff00ff')
        world.addParticle(p.x + p.w / 2, p.y, 0, RHYTHM_TUNING.justInputParticleVy, RHYTHM_TUNING.justInputParticleLife, '#ff00ff', RHYTHM_TUNING.justInputParticleSize)
        soundManager.onJustHit()
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void {
    if (!world.rules.features.has('beat_hazard') || this.state.beatMarkers.length === 0) return

    const px = new PixelCanvas(ctx)
    const gY = world.canvas.height - 80
    const s = Math.max(1, PIXELART.size)
    // setLineDash(UI.beatMarkerDash) の比率をセル単位に丸める。線幅も UI.beatMarkerLineW から
    const dashLen = Math.max(s, Math.round(UI.beatMarkerDash[0] / s) * s)
    const gapLen = Math.max(s, Math.round(UI.beatMarkerDash[1] / s) * s)
    const period = dashLen + gapLen
    const lineW = Math.max(s, Math.round(UI.beatMarkerLineW / s) * s)

    for (const m of this.state.beatMarkers) {
      px.withAlpha((m.t / UI.beatMarkerAlphaDivisor) * UI.beatMarkerMaxAlpha, () => {
        for (let y = 0; y < gY; y += period) {
          px.rect(m.x - lineW / 2, y, lineW, Math.min(dashLen, gY - y), UI.beatMarkerColor)
        }
      })
    }
  }
}
