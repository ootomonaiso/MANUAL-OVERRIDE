/**
 * PixelText の焼き込み倍率（docs/pixelart-rebuild/00-rendering-system.md §11.4）
 *
 * 焼き込みは実 canvas の measureText を必要とするため happy-dom では検証できない。
 * 倍率の決定だけを純粋関数として切り出してあるので、そこを直接検証する。
 */
import { describe, it, expect } from 'vitest'
import { computeBakeScale, parseFontSizePx } from '../../../../src/game/render/PixelText'
import { PIXELART } from '../../../../src/data/tunables'

describe('parseFontSizePx', () => {
  it('font 文字列から px 指定を取り出す', () => {
    expect(parseFontSizePx('bold 36px "Courier New", monospace')).toBe(36)
    expect(parseFontSizePx('16px monospace')).toBe(16)
    expect(parseFontSizePx('bold 14.5px sans-serif')).toBe(14.5)
  })

  it('px 指定が無い font は null を返す', () => {
    expect(parseFontSizePx('bold 1em sans-serif')).toBeNull()
    expect(parseFontSizePx('monospace')).toBeNull()
  })
})

describe('computeBakeScale — 焼き込み解像度の下限（R-02）', () => {
  const MIN = PIXELART.textMinBakePx
  const MAX = PIXELART.textScale

  // R-02 の回帰防止: 一律倍率では 16px の漢字が 5px まで縮んで潰れていた
  it('焼き込み後のサイズが textMinBakePx を下回らない', () => {
    // ゲーム内で実際に使われているフォント指定
    const fonts = [
      'bold 36px "Courier New", monospace',   // GAME OVER
      '16px "Courier New", monospace',        // 説明書を投げてください
      'bold 15px "Courier New", monospace',   // スコアポップアップ
      'bold 30px "Courier New", monospace',   // 第 N 問
      'bold 16px monospace',                  // ゴールへ滑り込め
      'bold 14px "Courier New", monospace',   // 操作説明
      'bold 48px "Courier New", monospace',   // TIME UP
    ]
    for (const font of fonts) {
      const size = parseFontSizePx(font)!
      const scale = computeBakeScale(font, MAX, MIN)
      const baked = size / scale
      expect(baked, `${font} が ${baked.toFixed(1)}px まで縮んでいる`).toBeGreaterThanOrEqual(MIN - 1e-9)
    }
  })

  it('大きい文字では textScale がそのまま効く（ドット感を維持する）', () => {
    // 36px は 36/3 = 12px ≧ 11px なので上限の textScale がそのまま使える
    expect(computeBakeScale('bold 36px monospace', MAX, MIN)).toBe(MAX)
    expect(computeBakeScale('bold 48px monospace', MAX, MIN)).toBe(MAX)
  })

  it('小さい文字では倍率が自動的に下がる', () => {
    expect(computeBakeScale('bold 14px monospace', MAX, MIN)).toBeLessThan(MAX)
    expect(computeBakeScale('16px monospace', MAX, MIN)).toBeLessThan(MAX)
  })

  // 拡大率が整数でないと最近傍拡大でドットの大きさが 1px/2px に混在し、
  // ドット絵らしさが損なわれる（§11.4「倍率を整数に限る理由」）
  it('倍率は常に整数になる', () => {
    for (let size = 1; size <= 80; size++) {
      const scale = computeBakeScale(`${size}px monospace`, MAX, MIN)
      expect(Number.isInteger(scale), `${size}px で倍率 ${scale} が非整数`).toBe(true)
    }
    expect(Number.isInteger(computeBakeScale('bold 1em sans-serif', MAX, MIN))).toBe(true)
  })

  it('倍率は 1 を下回らない（拡大方向へは働かない）', () => {
    expect(computeBakeScale('bold 8px monospace', MAX, MIN)).toBe(1)
    expect(computeBakeScale('bold 4px monospace', MAX, MIN)).toBe(1)
  })

  it('px 指定を取り出せない font は textScale をそのまま使う', () => {
    expect(computeBakeScale('bold 1em sans-serif', MAX, MIN)).toBe(MAX)
  })

  it('倍率は常に 1..textScale の範囲に収まる', () => {
    for (let size = 1; size <= 80; size++) {
      const scale = computeBakeScale(`${size}px monospace`, MAX, MIN)
      expect(scale).toBeGreaterThanOrEqual(1)
      expect(scale).toBeLessThanOrEqual(MAX)
    }
  })
})
