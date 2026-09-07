/**
 * genres/GlitchPlugin.ts
 * 'glitch' ジャンル（壊れたゲーム）のプラグイン。
 *
 * 矛盾の蓄積でゲームが「壊れる」。色ずれ・反転・ノイズ・走査線。
 * base テーマの色を引き継ぎつつ、画面全体にディストーションを叠加する。
 * resolvable: false（通常到達不可、矛盾カード専用）。
 *
 * NOTE: DarkThemePlugin を継承することで、base と同じ遠景・中景の描画を
 * 再利用し、前景の glitch 演出のみを独自に実装する。
 */

import { DarkThemePlugin } from './BasePlugin'
import type { GenreId } from '../domain/types'
import { PixelCanvas } from '../game/render'
import { hash01 } from './hashUtil'
import { selectPlayerFrame } from './playerBaseAnim'
import type { PlayerAnimState } from '../engine/GenrePlugin'

// スクリーン tear の最大シフト量（px）
const TEAR_MAX_SHIFT = 12
// 色反転の周期（ms）
const INVERT_PERIOD = 4000

export class GlitchPlugin extends DarkThemePlugin {
  readonly id: GenreId = 'glitch'

  // base テーマの色を直接保持（DarkThemePlugin の抽象フィールドを上書き）
  readonly skyColors: readonly [string, string] = ['#0f0f23', '#1a1a3e']
  readonly groundColors: readonly [string, string] = ['#1e1e40', '#12122a']
  readonly farLayerColor = '#1a1a4a'
  readonly midLayerColor = '#151540'
  readonly starColor: string | undefined = '#ff00ff' // マゼンタ寄りの星（色ずれ感）
  readonly palette = {
    danger: '#ff2266', dangerGlow: '#ff6699',
    safe:   '#22ffaa', safeGlow:   '#66ffcc',
  }

  // base の spawnTable をそのまま使用（DarkThemePlugin の抽象フィールド）
  readonly spawnTable: readonly import('../engine/types').SpawnEntry[] = [
    { shape: 'rect',    placement: 'ground', weightStart: 10, weightEnd: 6,  wRange: [25, 45], hRange: [30, 55] },
    { shape: 'spike',   placement: 'ground', weightStart: 0,  weightEnd: 3,  wRange: [22, 40], hRange: [35, 55] },
    { shape: 'pillar',  placement: 'ground', weightStart: 0,  weightEnd: 2,  wRange: [14, 22], hRange: [60, 120] },
    { shape: 'diamond', placement: 'float',  weightStart: 0,  weightEnd: 2,  wRange: [30, 38], hRange: [30, 38] },
  ]

  // 遠景・中景は DarkThemePlugin を継承済み（override 不要）

  // ─── プレイヤー：base と同じ player_base を使用 ───────────────
  override drawPlayer(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    onGround: boolean,
    runCycle: number,
    animState?: PlayerAnimState,
  ): void {
    const px = new PixelCanvas(ctx)

    // 影
    px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(0,0,0,0.25)')

    const s: PlayerAnimState = animState ?? { vx: 0, vy: 0, onGround, runCycle, facing: 1 }
    const frame = selectPlayerFrame(s)
    const flipX = s.facing === -1
    px.sprite('player_base', 0, 0, w, h, { frame, flipX })
  }

  // ─── 前景：スクリーントゥイスト・色反転・ノイズ ───────────────
  override drawForeground(ctx: CanvasRenderingContext2D, _offsetX: number, W: number, H: number, _gY: number): void {
    const px = new PixelCanvas(ctx)
    const t = performance.now()

    // 1. スクリーントゥイスト（水平方向のシフト、時間関数で決定的）
    const tearCount = 3 + Math.floor(hash01(Math.floor(t / 300)) * 5)
    for (let i = 0; i < tearCount; i++) {
      const seed = Math.floor(t / 100) + i * 7919
      const tearY = hash01(seed) * H
      const tearH = 1 + hash01(seed + 1) * 6
      const tearShift = (hash01(seed + 2) - 0.5) * TEAR_MAX_SHIFT * 2
      if (Math.abs(tearShift) > 1) {
        px.withAlpha(1.0, () => {
          px.rect(tearShift > 0 ? -tearShift : 0, tearY, W, tearH, 'transparent')
        })
      }
    }

    // 2. 色反転（一定周期で画面の一部を反転）
    const invertPhase = (t % INVERT_PERIOD) / INVERT_PERIOD
    if (invertPhase > 0.85) {
      const invertAlpha = (invertPhase - 0.85) / 0.15 * 0.15
      px.withAlpha(invertAlpha, () => px.rect(0, 0, W, H, '#ffffff'))
    }

    // 3. ノイズ / 走査線（ドットのランダム点滅、時間関数で決定的）
    const noiseRowPeriod = 4
    const currentFrame = Math.floor(t / (1000 / 30))
    for (let row = 0; row < H; row += noiseRowPeriod) {
      const seed = row * 3571 + currentFrame
      if (hash01(seed) > 0.92) {
        const noiseAlpha = hash01(seed + 0.5) * 0.25
        px.rect(0, row, W, noiseRowPeriod, `rgba(255,255,255,${noiseAlpha})`)
      }
    }

    // 4. 走査線（一定間隔の水平線）
    const scanlineAlpha = 0.08 + Math.sin(t / 100) * 0.02
    for (let y = 0; y < H; y += 3) {
      px.rect(0, y, W, 1, `rgba(0,0,0,${scanlineAlpha})`)
    }

    // 5. ランダムな矩形フラッシュ（glitch 感）
    if (hash01(Math.floor(t / 500)) > 0.7) {
      const flashX = hash01(Math.floor(t / 500) + 1) * W
      const flashY = hash01(Math.floor(t / 500) + 2) * H
      const flashW = 20 + hash01(Math.floor(t / 500) + 3) * 80
      const flashH = 2 + hash01(Math.floor(t / 500) + 4) * 10
      px.withAlpha(0.15, () => px.rect(flashX, flashY, flashW, flashH, '#ff00ff'))
    }
  }

  // NOTE: 入力反転演出は LearningSystem 側で処理されるため、
  // 本プラグインでは視覚効果（スクリーントゥイスト・色反転・ノイズ）のみで表現する。
}

export default new GlitchPlugin()
