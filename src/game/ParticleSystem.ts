import { PixelCanvas } from './render'
import { PIXELART } from '../data/tunables'

export interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number; maxLife: number
  color: string; size: number
}

/**
 * パーティクルの生成・更新・描画を管理するクラス。
 * SideScroller 本体からパーティクル処理を切り出し、単一責務にする。
 */
export class ParticleSystem {
  private particles: Particle[] = []

  add(x: number, y: number, vx: number, vy: number, life: number, color: string, size: number): void {
    this.particles.push({ x, y, vx, vy, life, maxLife: life, color, size })
  }

  /** 通常フレーム更新 */
  update(dt: number, gravity: number): void {
    for (const p of this.particles) {
      p.x  += p.vx * dt
      p.y  += p.vy * dt
      p.vy += gravity * dt
      p.life -= dt
    }
    this.particles = this.particles.filter(p => p.life > 0)
  }

  /** 死亡演出用スローモーション更新 */
  updateSlow(dt: number, slowFactor: number, gravity: number): void {
    for (const p of this.particles) {
      p.x  += p.vx * dt * slowFactor
      p.y  += p.vy * dt * slowFactor
      p.vy += gravity * dt * slowFactor
      p.life -= dt
    }
    this.particles = this.particles.filter(p => p.life > 0)
  }

  render(ctx: CanvasRenderingContext2D): void {
    const px = new PixelCanvas(ctx)
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife
      const raw   = p.size * (0.5 + alpha * 0.5)
      const cells = Math.max(1, Math.round(raw / PIXELART.size)) * PIXELART.size
      px.withAlpha(alpha, () => {
        px.rect(p.x - cells / 2, p.y - cells / 2, cells, cells, p.color)
      })
    }
  }

  clear(): void { this.particles = [] }
}
