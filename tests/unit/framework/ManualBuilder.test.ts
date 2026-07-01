import { describe, it, expect } from 'vitest'
import { ManualBuilder } from '../../../src/framework/ManualBuilder'

describe('ManualBuilder', () => {
  it('基本的なビルドが動作する', () => {
    const [key, version] = new ManualBuilder('test-key', '1.0').build()
    expect(key).toBe('test-key')
    expect(version.version).toBe('1.0')
    expect(version.manualText).toEqual([])
    expect(version.choices).toEqual([])
    expect(version.hazards).toEqual({ colors: ['red'], safeColors: ['blue'] })
  })

  it('text で本文行を追加できる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .text('line1')
      .text('line2')
      .build()
    expect(version.manualText).toEqual(['line1', 'line2'])
  })

  it('texts で複数行をまとめて追加できる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .texts(['a', 'b', 'c'])
      .build()
    expect(version.manualText).toEqual(['a', 'b', 'c'])
  })

  it('image で画像パスを設定できる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .image('test.png', 'Test image')
      .build()
    expect(version.image).toBe('/manuals/test.png')
    expect(version.imageAlt).toBe('Test image')
  })

  it('image で絶対パスを使用できる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .image('/absolute/path.png')
      .build()
    expect(version.image).toBe('/absolute/path.png')
  })

  it('hazards で色を上書きできる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .hazards({ colors: ['green', 'yellow'], safeColors: ['cyan'] })
      .build()
    expect(version.hazards.colors).toEqual(['green', 'yellow'])
    expect(version.hazards.safeColors).toEqual(['cyan'])
  })

  it('choice で選択肢を追加できる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .choice('Go fast', { tempo: 3 }, '2.0-fast', 'c1', 'hint text')
      .build()
    expect(version.choices).toHaveLength(1)
    expect(version.choices[0].id).toBe('c1')
    expect(version.choices[0].label).toBe('Go fast')
    expect(version.choices[0].genreParams).toEqual({ tempo: 3 })
    expect(version.choices[0].next).toBe('2.0-fast')
    expect(version.choices[0].hint).toBe('hint text')
  })

  it('choice の id を省略すると自動生成される', () => {
    const [, version] = new ManualBuilder('mykey', '1.0')
      .choice('Option A', { tempo: 1 }, '2.0')
      .choice('Option B', { range: 2 }, '3.0')
      .build()
    expect(version.choices[0].id).toBe('mykey-choice-0')
    expect(version.choices[1].id).toBe('mykey-choice-1')
  })

  it('tutorialHint を設定できる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .tutorialHint('Press Space to jump!')
      .build()
    expect(version.tutorialHint).toBe('Press Space to jump!')
  })

  it('narrative を設定できる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .narrative('The game evolves...')
      .build()
    expect(version.narrative).toBe('The game evolves...')
  })

  it('runtimeConfig を設定できる', () => {
    const [, version] = new ManualBuilder('k', '1.0')
      .runtimeConfig({ scrollSpeed: 400, environment: 'sky', bpm: 140 })
      .build()
    expect(version.runtimeConfig?.scrollSpeed).toBe(400)
    expect(version.runtimeConfig?.environment).toBe('sky')
    expect(version.runtimeConfig?.bpm).toBe(140)
  })

  it('メソッドチェーンで複数の設定を組み合わせられる', () => {
    const [key, version] = new ManualBuilder('full-test', '3.0')
      .text('Rule 1')
      .text('Rule 2')
      .image('art.png', 'Art')
      .hazards({ colors: ['purple'] })
      .choice('Fast', { tempo: 5 }, '4.0-fast')
      .choice('Slow', { combo: 3 }, '4.0-slow')
      .tutorialHint('New controls!')
      .narrative('Chapter 3')
      .runtimeConfig({ gravity: 1200 })
      .build()

    expect(key).toBe('full-test')
    expect(version.manualText).toEqual(['Rule 1', 'Rule 2'])
    expect(version.image).toBe('/manuals/art.png')
    expect(version.hazards.colors).toEqual(['purple'])
    expect(version.choices).toHaveLength(2)
    expect(version.tutorialHint).toBe('New controls!')
    expect(version.narrative).toBe('Chapter 3')
    expect(version.runtimeConfig?.gravity).toBe(1200)
  })

  it('build は immutable なコピーを返す', () => {
    const builder = new ManualBuilder('k', '1.0').text('line1')
    const [, v1] = builder.build()
    const [, v2] = builder.build()
    v1.manualText.push('extra')
    expect(v2.manualText).not.toContain('extra')
  })
})
