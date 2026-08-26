import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InputManager } from '../../../src/game/InputManager'

describe('InputManager — focus-loss key clearing (#265)', () => {
  let mgr: InputManager

  beforeEach(() => {
    mgr = new InputManager()
  })

  afterEach(() => {
    mgr.dispose()
  })

  it('keydown でキーを追加し、blur イベントで keys と prevKeys が空になる', () => {
    mgr.keys.add('Space')
    expect(mgr.keys.size).toBe(1)

    window.dispatchEvent(new Event('blur'))

    expect(mgr.keys.size).toBe(0)
    // prevKeys も同時にクリアされるため、tick() 後に justPressed が誤発火しない
    mgr.tick()
    expect(mgr.justPressed.size).toBe(0)
  })

  it('keydown → visibilitychange(hidden=true) で keys と prevKeys が空になる', () => {
    mgr.keys.add('ArrowRight')
    expect(mgr.keys.size).toBe(1)

    const visEvent = new Event('visibilitychange')
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(visEvent)

    expect(mgr.keys.size).toBe(0)
    mgr.tick()
    expect(mgr.justPressed.size).toBe(0)
  })

  it('visibilitychange(hidden=false) ではクリアされない', () => {
    mgr.keys.add('Space')
    expect(mgr.keys.size).toBe(1)

    const visEvent = new Event('visibilitychange')
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(visEvent)

    // hidden=false ならクリアしてはいけない
    expect(mgr.keys.size).toBe(1)
    expect(mgr.keys.has('Space')).toBe(true)
  })

  it('dispose 後に blur イベントが発火してもキーが追加されない', () => {
    mgr.dispose()

    // dispose 後も blur ハンドラが呼ばれると keys に影響する可能性があるので確認
    window.dispatchEvent(new Event('blur'))

    expect(mgr.keys.size).toBe(0)
  })

  it('dispose 後に visibilitychange が発火してもキーが追加されない', () => {
    mgr.dispose()

    const visEvent = new Event('visibilitychange')
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(visEvent)

    expect(mgr.keys.size).toBe(0)
  })
})
