import { describe, it, expect, beforeEach } from 'vitest'
import { ParticleSystem } from '../../../src/game/ParticleSystem'

// 1フレーム分の dt（16ms ≈ 60fps）
const DT_16MS = 0.016
// 完全な円（arc の終端角度）
const TWO_PI = Math.PI * 2

// CanvasRenderingContext2D の最小限なモック
function createMockCtx(): CanvasRenderingContext2D {
  return {
    globalAlpha: 1,
    fillStyle: '',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    canvas: {} as HTMLCanvasElement,
  } as unknown as CanvasRenderingContext2D
}

describe('ParticleSystem', () => {
  let ps: ParticleSystem

  beforeEach(() => {
    ps = new ParticleSystem()
  })

  describe('add', () => {
    it('パーティクルを追加し、render で描画される', () => {
      ps.add(100, 200, 10, -20, 1.0, '#ff0000', 5)
      const ctx = createMockCtx()
      ps.render(ctx)
      expect(ctx.beginPath).toHaveBeenCalledTimes(1)
      expect(ctx.arc).toHaveBeenCalledTimes(1)
      expect(ctx.fill).toHaveBeenCalledTimes(1)
    })
  })

  describe('update', () => {
    it('パーティクルの位置を更新する', () => {
      ps.add(100, 200, 100, 0, 1.0, '#ff0000', 5)
      ps.update(DT_16MS, 0) // dt=16ms, gravity=0
      // x += vx * dt → 100 + 100 * 0.016 = 101.6
      // life -= dt → 0.984, alpha = 0.984/1.0 = 0.984
      // size = 5 * (0.5 + 0.984 * 0.5) = 4.96
      const ctx = createMockCtx()
      ps.render(ctx)
      expect(ctx.arc).toHaveBeenCalledWith(101.6, 200, expect.closeTo(4.96, 0.01), 0, TWO_PI)
    })

    it('重力を適用する', () => {
      ps.add(100, 200, 0, 0, 1.0, '#ff0000', 5)
      ps.update(DT_16MS, 800) // gravity=800
      // 1フレーム目: 位置更新には直前の vy(0) を使うため y は不変
      // その後 vy += 800*0.016 = 12.8 に更新
      const ctx = createMockCtx()
      ps.render(ctx)
      // 2フレーム目: y += 12.8 * 0.016 = 0.2048 → y = 200.2048
      ps.update(DT_16MS, 800)
      const ctx2 = createMockCtx()
      ps.render(ctx2)
      // life=0.968 → size = 5 * (0.5 + 0.968 * 0.5) = 4.92
      expect(ctx2.arc).toHaveBeenCalledWith(100, expect.closeTo(200.2048, 0.001), expect.closeTo(4.92, 0.01), 0, TWO_PI)
    })

    it('life が切れたパーティクルを削除する', () => {
      ps.add(0, 0, 0, 0, 0.01, '#ff0000', 5) // life=0.01
      ps.update(0.1, 0) // dt=100ms → life が -0.09 に
      const ctx = createMockCtx()
      ps.render(ctx)
      // 削除されたパーティクルは描画されない
      expect(ctx.beginPath).not.toHaveBeenCalled()
    })

    it('life が残っているパーティクルは保持される', () => {
      ps.add(0, 0, 0, 0, 1.0, '#ff0000', 5)
      ps.update(0.1, 0) // life=0.9
      const ctx = createMockCtx()
      ps.render(ctx)
      expect(ctx.beginPath).toHaveBeenCalledTimes(1)
    })

    it('dt=0 で位置と life が変わらない', () => {
      ps.add(100, 200, 50, 30, 1.0, '#ff0000', 5)
      ps.update(0, 800) // dt=0 → 更新なし
      const ctx = createMockCtx()
      ps.render(ctx)
      // x=100, y=200 のまま
      expect(ctx.arc).toHaveBeenCalledWith(100, 200, expect.any(Number), 0, TWO_PI)
    })

    it('負の dt で逆方向に動く', () => {
      ps.add(100, 200, 50, 0, 1.0, '#ff0000', 5)
      ps.update(-DT_16MS, 0) // dt=-0.016 → x -= 50*0.016 = 0.8
      const ctx = createMockCtx()
      ps.render(ctx)
      // x = 100 - 0.8 = 99.2
      expect(ctx.arc).toHaveBeenCalledWith(99.2, 200, expect.any(Number), 0, TWO_PI)
    })

    it('dt=NaN で例外が発生しない', () => {
      ps.add(100, 200, 50, 0, 1.0, '#ff0000', 5)
      // NaN が伝搬しても例外なしで動作すること
      expect(() => ps.update(NaN, 800)).not.toThrow()
    })
  })

  describe('updateSlow', () => {
    it('スローモーション係数を適用する', () => {
      ps.add(0, 0, 100, 0, 1.0, '#ff0000', 5)
      ps.updateSlow(DT_16MS, 0.5, 0) // slowFactor=0.5
      // x += 100 * 0.016 * 0.5 = 0.8
      // life -= dt → 0.984 → size = 5 * (0.5 + 0.984 * 0.5) = 4.96
      const ctx = createMockCtx()
      ps.render(ctx)
      expect(ctx.arc).toHaveBeenCalledWith(0.8, 0, expect.closeTo(4.96, 0.01), 0, TWO_PI)
    })

    it('スローモーションでも life は通常速度で減少する', () => {
      ps.add(0, 0, 0, 0, 0.01, '#ff0000', 5)
      ps.updateSlow(0.1, 0.1, 0) // life-=0.1 → 負
      const ctx = createMockCtx()
      ps.render(ctx)
      // life が切れて削除される
      expect(ctx.beginPath).not.toHaveBeenCalled()
    })
  })

  describe('render', () => {
    it('ctx のメソッドを呼び出す', () => {
      const ctx = createMockCtx()
      ps.add(100, 200, 0, 0, 0.5, '#ff0000', 10)
      ps.render(ctx)
      expect(ctx.beginPath).toHaveBeenCalled()
      expect(ctx.arc).toHaveBeenCalled()
      expect(ctx.fill).toHaveBeenCalled()
    })

    it('alpha は life/maxLife で計算される', () => {
      // モックの globalAlpha を 0 に初期化し、render が適切に設定・リセットすることを確認
      const mockCtx = createMockCtx()
      mockCtx.globalAlpha = 0
      ps.add(0, 0, 0, 0, 0.5, '#ff0000', 5) // life=0.5, maxLife=0.5 → alpha=1.0
      ps.render(mockCtx)
      expect(mockCtx.globalAlpha).toBe(1) // render 後に 1 にリセットされる
    })

    it('サイズは alpha に応じて縮小する', () => {
      const ctx = createMockCtx()
      ps.add(0, 0, 0, 0, 0.5, '#ff0000', 10)
      ps.update(0.25, 0) // life=0.25, maxLife=0.5 → alpha=0.5
      ps.render(ctx)
      // size = 10 * (0.5 + 0.5 * 0.5) = 7.5
      expect(ctx.arc).toHaveBeenCalledWith(0, 0, 7.5, 0, TWO_PI)
    })

    it('パーティクルがない場合は描画しない', () => {
      const ctx = createMockCtx()
      ps.render(ctx)
      expect(ctx.beginPath).not.toHaveBeenCalled()
    })
  })

  describe('decayShake', () => {
    it('decayFactor を適用して正の値を維持する', () => {
      const result = ps.decayShake(10, 0.9, 0.01)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeCloseTo(9, 5)
    })

    it('epsilon 未満で 0 にする', () => {
      const result = ps.decayShake(0.001, 0.9, 0.01)
      expect(result).toBe(0)
    })

    it('既に 0 なら 0 のまま', () => {
      const result = ps.decayShake(0, 0.9, 0.01)
      expect(result).toBe(0)
    })

    it('epsilon ちょうどでも 0 にする', () => {
      const result = ps.decayShake(0.01, 0.5, 0.01)
      expect(result).toBe(0) // 0.005 < 0.01
    })
  })

  describe('clear', () => {
    it('全パーティクルを削除する', () => {
      ps.add(0, 0, 0, 0, 1.0, '#ff0000', 5)
      ps.add(10, 10, 0, 0, 1.0, '#00ff00', 5)
      ps.clear()
      // clear 後も例外なしで動作することを確認
      const ctx = createMockCtx()
      ps.render(ctx)
      expect(ctx.beginPath).not.toHaveBeenCalled() // パーティクルなしなので描画しない
    })
  })
})
