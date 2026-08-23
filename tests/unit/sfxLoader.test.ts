import { describe, it, expect } from 'vitest'
import { SFX_DEFS } from '../../src/framework/SfxLoader'
import type { SfxOscTrack, SfxNoiseTrack } from '../../src/framework/sfx-types'

const EXPECTED_IDS = [
  'jump', 'land', 'shoot', 'hit', 'death', 'genre_lock',
  'choice_reveal', 'choice_select', 'throw_start', 'throw_land',
  'beat', 'combo', 'milestone', 'near_miss', 'goal_achieved',
  'record_update', 'skin_select',
  // Phase 2: 新追加SE
  'tetris_move', 'tetris_rotate', 'tetris_hard_drop', 'tetris_lock', 'line_clear',
  'puzzle_slide', 'puzzle_clear', 'just_hit', 'enemy_destroyed', 'enemy_hit',
  'melee_attack', 'melee_hit', 'dash', 'slide', 'wall_jump',
  'item_pickup', 'color_touch', 'tower_fire', 'time_bonus', 'level_up',
  'hunger_damage', 'combo_milestone', 'boss_spawn', 'boss_defeated',
  'stealth_activate', 'shield_absorb', 'manual_update', 'learning_effect',
  'throw_release', 'throw_grab', 'score_reveal', 'grade_stamp',
  'surprise_ending', 'pause_toggle',
] as const

const VALID_WAVES = ['sine', 'triangle', 'square', 'sawtooth'] as const

describe('SfxLoader', () => {
  it('SFX_DEFS は空ではない', () => {
    expect(Object.keys(SFX_DEFS).length).toBeGreaterThan(0)
  })

  it('全51種のSFX id が SFX_DEFS に存在する', () => {
    expect(EXPECTED_IDS.length).toBe(51)
    expect(Object.keys(SFX_DEFS).length).toBe(EXPECTED_IDS.length)
    // SFX_DEFS の key 集合と EXPECTED_IDS 集合が完全一致すること（過不足なし）
    const defsKeys = new Set(Object.keys(SFX_DEFS))
    const expectedSet = new Set(EXPECTED_IDS)
    expect(defsKeys).toEqual(expectedSet)
    for (const id of EXPECTED_IDS) {
      expect(SFX_DEFS[id]).toBeDefined()
    }
  })

  it('SFX_DEFS の全定義について、id / tracks が妥当', () => {
    for (const [id, def] of Object.entries(SFX_DEFS)) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
      expect(def.id).toBe(id) // id 整合性

      expect(Array.isArray(def.tracks)).toBe(true)
      expect(def.tracks.length).toBeGreaterThan(0)

      for (const track of def.tracks) {
        expect(['osc', 'noise']).toContain(track.kind)

        if (track.kind === 'osc') {
          const t = track as SfxOscTrack
          expect(VALID_WAVES).toContain(t.wave)
          expect(typeof t.freq).toBe('number')
          expect(t.freq).toBeGreaterThan(0)
          expect(typeof t.durationSec).toBe('number')
          expect(t.durationSec).toBeGreaterThan(0)
          expect(typeof t.volume).toBe('number')
          expect(t.volume).toBeGreaterThanOrEqual(0)
          expect(t.volume).toBeLessThanOrEqual(1)
        } else {
          const t = track as SfxNoiseTrack
          expect(typeof t.durationSec).toBe('number')
          expect(t.durationSec).toBeGreaterThan(0)
          expect(typeof t.volume).toBe('number')
          expect(t.volume).toBeGreaterThanOrEqual(0)
          expect(t.volume).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('SFX_DEFS の全 id は一意（重複なし）', () => {
    const ids = Object.keys(SFX_DEFS)
    const unique = new Set(ids)
    expect(ids.length).toBe(unique.size)
  })
})
