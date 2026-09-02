/**
 * PixelCanvas の幾何検証（docs/pixelart-rebuild/00-rendering-system.md §11.7）
 *
 * テスト環境は happy-dom で実 canvas を持たないため getImageData による
 * ラスタ検証はできない。代わりに CanvasRenderingContext2D のモックを注入し、
 * 発行された fillRect の座標・寸法を直接検証する。
 * 幾何の正しさを問う本件では、ラスタ検証より厳密で決定的である。
 */
import { describe, it, expect } from 'vitest'
import { PixelCanvas } from '../../../../src/game/render/PixelCanvas'
import { PIXELART } from '../../../../src/data/tunables'

interface Emitted {
  x: number
  y: number
  w: number
  h: number
  color: string
}

/** fillRect の発行内容を記録する最小の 2D コンテキストモック */
function createMockCtx(): { ctx: CanvasRenderingContext2D; emitted: Emitted[] } {
  const emitted: Emitted[] = []
  let alpha = 1
  const ctx = {
    fillStyle: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    save: () => { alpha = ctx.globalAlpha },
    restore: () => { ctx.globalAlpha = alpha },
    setTransform: () => {},
    translate: () => {},
    rotate: () => {},
    fillRect(x: number, y: number, w: number, h: number) {
      emitted.push({ x, y, w, h, color: String(ctx.fillStyle) })
    },
  } as unknown as CanvasRenderingContext2D
  return { ctx, emitted }
}

function draw(body: (px: PixelCanvas) => void): Emitted[] {
  const { ctx, emitted } = createMockCtx()
  body(new PixelCanvas(ctx))
  return emitted
}

const SIZE = PIXELART.size

/** 発行された矩形群の外接範囲 */
function bounds(rects: Emitted[]): { left: number; right: number; top: number; bottom: number } {
  return {
    left: Math.min(...rects.map(r => r.x)),
    right: Math.max(...rects.map(r => r.x + r.w)),
    top: Math.min(...rects.map(r => r.y)),
    bottom: Math.max(...rects.map(r => r.y + r.h)),
  }
}

describe('PixelCanvas — 円系プリミティブのセル整数演算（§11.2）', () => {
  // C-02 の回帰防止: 端数の半幅を行ごとにスナップすると左右がずれる。
  //
  // 検証する不変条件は「全行の中心が一致すること」。
  // 直径が奇数セルの図形はセル中心に乗るため、図形の中心は指定した cx から
  // 半セルずれうる（グリッド上では避けられない）。ずれても図形自体は対称であり、
  // 全行が同じ中心を共有していれば左右対称は保たれている。
  it('circle は全行の中心が一致する（左右対称）', () => {
    for (const r of [2, 6, 8, 12, 20, 37, 40]) {
      const rects = draw(px => px.circle(200, 200, r, '#fff'))
      const centers = rects.map(rect => rect.x + rect.w / 2)
      const uniq = [...new Set(centers)]
      expect(uniq.length, `r=${r} で行の中心が ${uniq.join(',')} とばらついた`).toBe(1)
    }
  })

  it('circle は指定中心からのずれが半セル以内に収まる', () => {
    for (const r of [2, 6, 8, 20, 37, 40]) {
      const rects = draw(px => px.circle(200, 200, r, '#fff'))
      const b = bounds(rects)
      const center = (b.left + b.right) / 2
      expect(Math.abs(center - 200), `r=${r} で中心が ${center} までずれた`).toBeLessThanOrEqual(SIZE / 2)
    }
  })

  it('circle は中心に対して上下対称になる', () => {
    const cy = 200
    for (const r of [8, 20, 40]) {
      const rects = draw(px => px.circle(200, cy, r, '#fff'))
      const b = bounds(rects)
      expect(cy - b.top, `r=${r} の上下幅が一致しない`).toBe(b.bottom - cy)
    }
  })

  // C-01 の回帰防止: 行の刻みが 1 セルを下回ると _snapSize の下限で図形が膨張する
  it('circle の直径がセル量子化後の期待値と一致する（膨張しない）', () => {
    for (const r of [2, 3, 4, 5, 7, 8, 12, 20, 40]) {
      const dia = Math.max(1, Math.round((r * 2) / SIZE)) * SIZE
      const rects = draw(px => px.circle(200, 200, r, '#fff'))
      const b = bounds(rects)
      expect(b.bottom - b.top, `r=${r} の高さが期待値と違う`).toBe(dia)
      expect(b.right - b.left, `r=${r} の幅が期待値と違う`).toBe(dia)
    }
  })

  // 半径量子化だと直径が必ず偶数セルになり、小さな円（泡・松明の炎）が倍に膨らむ
  it('小さい円が膨張しない（直径量子化の確認）', () => {
    // r=2 → 直径 4px = ちょうど 1 セル
    const r2 = bounds(draw(px => px.circle(200, 200, 2, '#fff')))
    expect(r2.bottom - r2.top).toBe(SIZE)
    expect(r2.right - r2.left).toBe(SIZE)
    // r=6 → 直径 12px = 3 セル（奇数セルも表現できること）
    const r6 = bounds(draw(px => px.circle(200, 200, 6, '#fff')))
    expect(r6.bottom - r6.top).toBe(3 * SIZE)
  })

  it('ellipse の高さが量子化後の直径と一致する（1.5倍に膨張しない）', () => {
    // ry=4 は 9 プラグインのキャラクター足元の影で使われている実値
    for (const [rx, ry] of [[14, 4], [20, 4], [14, 3], [8, 2]]) {
      const diaY = Math.max(1, Math.round((ry * 2) / SIZE)) * SIZE
      const rects = draw(px => px.ellipse(200, 200, rx, ry, '#fff'))
      const b = bounds(rects)
      expect(b.bottom - b.top, `ry=${ry} の高さが期待値と違う`).toBe(diaY)
    }
  })

  it('ellipse は全行の中心が一致する（左右対称）', () => {
    for (const [rx, ry] of [[14, 4], [20, 8], [30, 12], [14, 3], [8, 2]]) {
      const rects = draw(px => px.ellipse(200, 200, rx, ry, '#fff'))
      const uniq = [...new Set(rects.map(rect => rect.x + rect.w / 2))]
      expect(uniq.length, `rx=${rx},ry=${ry} で行の中心がばらついた`).toBe(1)
    }
  })

  it('すべての行がちょうど 1 セル高で発行される', () => {
    const rects = draw(px => {
      px.circle(200, 200, 30, '#fff')
      px.ellipse(400, 200, 20, 9, '#fff')
      px.halfCircle(600, 200, 16, 'up', '#fff')
    })
    for (const r of rects) expect(r.h).toBe(SIZE)
  })

  it('halfCircle は指定した向きの半分だけを描く', () => {
    const cy = 200
    const up = draw(px => px.halfCircle(200, cy, 20, 'up', '#fff'))
    const down = draw(px => px.halfCircle(200, cy, 20, 'down', '#fff'))
    expect(bounds(up).bottom).toBe(cy)
    expect(bounds(down).top).toBe(cy)
  })

  // R-01 の回帰防止（本命）。
  // 「行数が変わらないこと」ではなく「既存の行が動かないこと」を検証する。
  // 旧実装は行の刻みを r から算出していたため、r が少し変わるだけで
  // すべての行境界がずれ、輪郭が沸き立って見えていた。
  // 正しい実装では半径が伸びても既存行は同じ y に留まり、外側に行が増えるだけになる。
  it('半径が伸びても既存の行位置が動かない（行構成が組み替わらない）', () => {
    const rowsAt = (r: number): Set<number> =>
      new Set(draw(px => px.circle(200, 200, r, '#fff')).map(rect => rect.y))

    let prev = rowsAt(30)
    for (let i = 1; i <= 40; i++) {
      const r = 30 + i * 0.1
      const cur = rowsAt(r)
      const lost = [...prev].filter(y => !cur.has(y))
      expect(lost, `r=${r.toFixed(1)} で既存の行 y=${lost.join(',')} が消えた（行構成が組み替わっている）`).toEqual([])
      prev = cur
    }
  })

  it('半径の変化に対し直径は 1 セル単位でのみ変わる', () => {
    let prevDiameter = -1
    for (let i = 0; i <= 40; i++) {
      const rects = draw(px => px.circle(200, 200, 30 + i * 0.1, '#fff'))
      const b = bounds(rects)
      const d = b.bottom - b.top
      if (prevDiameter >= 0) {
        const delta = Math.abs(d - prevDiameter)
        expect(delta % SIZE, '直径がセルの整数倍以外で変化した').toBe(0)
        expect(delta, '直径が一度に 1 セルを超えて変化した').toBeLessThanOrEqual(2 * SIZE)
      }
      prevDiameter = d
    }
  })
})

describe('PixelCanvas — 経路追従プリミティブの重複描画（§11.3）', () => {
  const cellKey = (r: Emitted): string => `${r.x},${r.y}`

  // C-03 の回帰防止: 半透明で描くと重複セルだけ二重合成されて明点になる
  it('arcBlocks は同一セルを 2 度描かない（全周でも）', () => {
    for (const [r, a0, a1] of [[40, 0, Math.PI * 2], [24, 0, Math.PI], [60, -0.5, 0.5]]) {
      const rects = draw(px => px.arcBlocks(200, 200, r, a0, a1, '#fff', 1))
      const keys = rects.map(cellKey)
      expect(new Set(keys).size, `r=${r} で重複セルが発行された`).toBe(keys.length)
    }
  })

  it('line は同一セルを 2 度描かない', () => {
    const cases: Array<[number, number, number, number]> = [
      [20, 40, 100, 40],   // 水平
      [20, 20, 20, 120],   // 垂直
      [20, 20, 100, 70],   // 斜め
      [20, 20, 300, 44],   // 浅い角度
    ]
    for (const [x0, y0, x1, y1] of cases) {
      const rects = draw(px => px.line(x0, y0, x1, y1, '#fff', 1))
      const keys = rects.map(cellKey)
      expect(new Set(keys).size, `(${x0},${y0})-(${x1},${y1}) で重複セルが発行された`).toBe(keys.length)
    }
  })

  it('line が途切れない（隣接セルが連続する）', () => {
    const rects = draw(px => px.line(20, 20, 300, 120, '#fff', 1))
    const sorted = [...rects].sort((a, b) => a.x - b.x)
    for (let i = 1; i < sorted.length; i++) {
      const gapX = Math.abs(sorted[i].x - sorted[i - 1].x)
      expect(gapX, '線に途切れがある').toBeLessThanOrEqual(SIZE)
    }
  })
})

describe('PixelCanvas — アルファ合成（S8 F-03 の回帰防止）', () => {
  it('withAlpha は現在の globalAlpha に乗算する（上書きしない）', () => {
    const { ctx } = createMockCtx()
    const px = new PixelCanvas(ctx)
    const seen: number[] = []
    px.withAlpha(0.5, () => {
      px.withAlpha(0.5, () => { seen.push(ctx.globalAlpha) })
    })
    expect(seen[0]).toBeCloseTo(0.25, 5)
    // スコープを抜けたら元に戻る
    expect(ctx.globalAlpha).toBe(1)
  })

  it('halo の各段は外側のアルファより暗くなる', () => {
    const { ctx } = createMockCtx()
    const px = new PixelCanvas(ctx)
    const seen: number[] = []
    px.withAlpha(0.5, () => {
      px.halo((_expand, _c) => { seen.push(ctx.globalAlpha) }, '#fff', 2)
    })
    expect(seen.length).toBe(2)
    for (const a of seen) expect(a).toBeLessThan(0.5)
  })
})
