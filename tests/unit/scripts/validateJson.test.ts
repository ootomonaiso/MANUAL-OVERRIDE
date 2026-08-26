import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import Ajv from 'ajv'

/**
 * JSON Schema 検証テスト (#261)
 *
 * scripts/validate-json.mjs で使用されているのと同じ Ajv セットアップで
 * ジャンル JSON への正式な JSON Schema 検証が適用されることを検証する。
 *
 * 検証項目:
 * 1. 現行の全ジャンル JSON が Schema 検証をパスすること
 * 2. 不正な feature enum 値が検出されること
 * 3. 不正な theme 値が検出されること
 * 4. スキーマに定義のないプロパティが検出されること
 * 5. 補完済みの feature enum (lights_out 等 8 件) が有効であること
 */

const ROOT = process.cwd()

// スキーマ読み込み（validate-json.mjs と同じ方法）
const genreSchema = JSON.parse(
  readFileSync(join(ROOT, 'schemas/genre.schema.json'), 'utf8'),
)

// validate-json.mjs と同じ Ajv セットアップ
const ajv = new Ajv({ strict: false, allErrors: true })
const validateGenreSchema = ajv.compile(genreSchema)

// 全ジャンル JSON 読み込み
const genreFiles = readdirSync(join(ROOT, 'src/data/genres'))
  .filter((f) => f.endsWith('.json') && !f.startsWith('TEMPLATE'))

const genreData = genreFiles.map((f) => ({
  file: f,
  data: JSON.parse(readFileSync(join(ROOT, `src/data/genres/${f}`), 'utf8')),
}))

// 補完すべき feature enum 値
const EXPECTED_FEATURES = [
  'auto_run',
  'double_jump',
  'long_air',
  'wall_jump',
  'shoot',
  'three_way',
  'spread_shot',
  'enemy_hp',
  'hp',
  'exp',
  'item_pickup',
  'slow_precise',
  'grid_stop',
  'puzzle_solve',
  'beat_hazard',
  'just_input',
  'beat_dash',
  'vertical_scroll',
  'shield',
  'stealth_mode',
  'dash',
  'time_bonus',
  'tower',
  'boss',
  'lights_out',
  'melee_kill',
  'movement',
  'near_miss_combo',
  'survival_hunger',
  'survival_level',
  'survival_melee',
  'tetris_mode',
]

describe('genre JSON Schema validation', () => {
  it('現行の全ジャンル JSON が Schema 検証をパスすること', () => {
    for (const { file, data } of genreData) {
      const valid = validateGenreSchema(data)
      expect(valid, `${file}: ${JSON.stringify(validateGenreSchema.errors)}`).toBe(
        true,
      )
    }
  })

  it('不正な feature 値が検出されること', () => {
    const invalidData = { ...genreData[0].data }
    invalidData.enableFeatures = [...(invalidData.enableFeatures ?? []), 'fake_feature']
    const valid = validateGenreSchema(invalidData)
    expect(valid).toBe(false)
    expect(validateGenreSchema.errors).toBeDefined()
    expect(validateGenreSchema.errors!.some((e) => e.keyword === 'enum')).toBe(true)
  })

  it('不正な theme 値が検出されること', () => {
    const invalidData = { ...genreData[0].data }
    invalidData.theme = 'nonexistent_theme'
    const valid = validateGenreSchema(invalidData)
    expect(valid).toBe(false)
    expect(validateGenreSchema.errors).toBeDefined()
    expect(validateGenreSchema.errors!.some((e) => e.keyword === 'enum')).toBe(true)
  })

  it('スキーマに定義のないプロパティが検出されること', () => {
    const invalidData: Record<string, unknown> = { ...genreData[0].data }
    invalidData.unknownProperty = 'should not exist'
    const valid = validateGenreSchema(invalidData)
    expect(valid).toBe(false)
    expect(validateGenreSchema.errors).toBeDefined()
    expect(
      validateGenreSchema.errors!.some((e) => e.keyword === 'additionalProperties'),
    ).toBe(true)
  })

  it('補完済みの feature enum に lights_out 等 8 件が含まれること', () => {
    const enableEnum = genreSchema.properties.enableFeatures.items.enum
    const disableEnum = genreSchema.properties.disableFeatures.items.enum

    for (const feature of EXPECTED_FEATURES) {
      expect(enableEnum).toContain(feature)
      expect(disableEnum).toContain(feature)
    }

    // 追加された 8 件が実際に存在すること
    const newlyAdded = [
      'lights_out',
      'melee_kill',
      'movement',
      'near_miss_combo',
      'survival_hunger',
      'survival_level',
      'survival_melee',
      'tetris_mode',
    ]
    for (const feature of newlyAdded) {
      expect(enableEnum).toContain(feature)
      expect(disableEnum).toContain(feature)
    }
  })

  it('補完済みの feature 値が実際に使用されているジャンル JSON で有効であること', () => {
    // 各ジャンルが参照している feature 値が allOf に存在すること
    const enableEnum = new Set(genreSchema.properties.enableFeatures.items.enum)
    const disableEnum = new Set(genreSchema.properties.disableFeatures.items.enum)

    for (const { file, data } of genreData) {
      for (const feat of data.enableFeatures ?? []) {
        expect(enableEnum.has(feat), `${file}: enableFeatures "${feat}" is not in schema enum`).toBe(
          true,
        )
      }
      for (const feat of data.disableFeatures ?? []) {
        expect(disableEnum.has(feat), `${file}: disableFeatures "${feat}" is not in schema enum`).toBe(
          true,
        )
      }
    }
  })
})
