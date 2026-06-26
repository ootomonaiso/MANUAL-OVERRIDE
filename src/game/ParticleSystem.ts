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
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife
      const size  = p.size * (0.5 + alpha * 0.5)
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  clear(): void { this.particles = [] }
}
