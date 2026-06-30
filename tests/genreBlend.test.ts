/**
 * genreBlend.test.ts
 *
 * computeGenreBlendStyle / isBlendActive の単体テスト。
 * Node.js で実行可能（Vitest 不要）。
 */

import { computeGenreBlendStyle, isBlendActive, GENRE_THEME_COLORS_BLEND } from '../src/domain/genreBlend'

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
  } else {
    console.log(`  ✓ ${message}`)
  }
}

function assertClose(actual: number, expected: number, message: string, tolerance = 1): void {
  if (Math.abs(actual - expected) > tolerance) {
    console.error(`FAIL: ${message} (expected ~${expected}, got ${actual})`)
    process.exitCode = 1
  } else {
    console.log(`  ✓ ${message}`)
  }
}

// ─── テスト: computeGenreBlendStyle ──────────────────────────────

console.log('\n[computeGenreBlendStyle]')

// progress=0 → plain と同じ
{
  const result = computeGenreBlendStyle('stg', 0)
  assert(result['--blend-bg'] === '#0d120d', 'progress=0: bg is plain')
  assert(result['--blend-color'] === '#b8ffb8', 'progress=0: color is plain')
  assert(result['--blend-border'] === '#33aa55', 'progress=0: border is plain')
}

// progress=1 → target 完全
{
  const result = computeGenreBlendStyle('stg', 1)
  assert(result['--blend-bg'] === '#080818', 'progress=1: bg is stg')
  assert(result['--blend-color'] === '#a8d8ff', 'progress=1: color is stg')
  assert(result['--blend-border'] === '#1a66ff', 'progress=1: border is stg')
}

// progress=0.5 → 中間
{
  const result = computeGenreBlendStyle('stg', 0.5)
  // #0d120d → #080818: R: 13→8, G: 18→8, B: 13→24
  assertClose(parseInt(result['--blend-bg']!.match(/\d+/)![0]), 10, 'progress=0.5: bg R is interpolated')
}

// progress=-1 → clamp to 0
{
  const result = computeGenreBlendStyle('stg', -1)
  assert(result['--blend-bg'] === '#0d120d', 'progress=-1: clamped to 0, bg is plain')
}

// progress=2 → clamp to 1
{
  const result = computeGenreBlendStyle('stg', 2)
  assert(result['--blend-bg'] === '#080818', 'progress=2: clamped to 1, bg is stg')
}

// 未知のテーマ → 空文字列
{
  const result = computeGenreBlendStyle('nonexistent' as any, 0.5)
  assert(result['--blend-bg'] === '', 'unknown theme: returns empty strings')
}

// 全テーマが補間可能
{
  const themes = ['stg', 'rpg', 'puzzle', 'rhythm', 'horror', 'aquatic', 'runner', 'stealth', 'racing', 'platformer', 'dungeon', 'hack_slash', 'survival']
  for (const theme of themes) {
    const result = computeGenreBlendStyle(theme as any, 0.5)
    assert(result['--blend-bg'] !== '', `${theme}: can be interpolated at 0.5`)
    assert(result['--blend-color'] !== '', `${theme}: color can be interpolated at 0.5`)
    assert(result['--blend-border'] !== '', `${theme}: border can be interpolated at 0.5`)
  }
}

// ─── テスト: isBlendActive ──────────────────────────────────────

console.log('\n[isBlendActive]')

assert(isBlendActive(0) === false, 'progress=0: inactive')
assert(isBlendActive(0.04) === false, 'progress=0.04: inactive')
assert(isBlendActive(0.05) === true, 'progress=0.05: active')
assert(isBlendActive(0.5) === true, 'progress=0.5: active')
assert(isBlendActive(0.98) === true, 'progress=0.98: active')
assert(isBlendActive(0.99) === false, 'progress=0.99: inactive (locked)')
assert(isBlendActive(1) === false, 'progress=1: inactive (locked)')

// ─── テスト: GENRE_THEME_COLORS_BLEND 網羅性 ────────────────────

console.log('\n[GENRE_THEME_COLORS_BLEND coverage]')

{
  const requiredThemes = ['plain', 'stg', 'rpg', 'puzzle', 'rhythm', 'horror', 'aquatic', 'runner', 'stealth', 'racing', 'platformer', 'dungeon', 'hack_slash', 'survival']
  for (const theme of requiredThemes) {
    assert(GENRE_THEME_COLORS_BLEND[theme] !== undefined, `theme "${theme}" is defined`)
    const colors = GENRE_THEME_COLORS_BLEND[theme]
    assert(colors.bg.startsWith('#') || colors.bg.startsWith('rgba'), `${theme}: bg is hex or rgba`)
    assert(colors.color.startsWith('#') || colors.color.startsWith('rgba'), `${theme}: color is hex or rgba`)
    assert(colors.border.startsWith('#') || colors.border.startsWith('rgba'), `${theme}: border is hex or rgba`)
  }
}

// ─── 結果 ───────────────────────────────────────────────────────

if (process.exitCode === 1) {
  console.log('\n✗ Some tests failed')
} else {
  console.log('\n✓ All tests passed')
}
