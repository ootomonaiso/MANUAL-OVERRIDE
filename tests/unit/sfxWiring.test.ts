/**
 * tests/unit/sfxWiring.test.ts
 *
 * 各ゲームロジックファイルに soundManager.onXxx() の配線が
 * 存在することを検証するユニットテスト。
 *
 * 行番号や前後の文脈には依存せず、対象ファイルに期待する呼び出し文字列が
 * 少なくとも1つ存在することをチェックする。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, test } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = join(__dirname, '..', '..')

/** 相対パス（src/ 基準）から絶対パスを構築 */
function srcPath(rel: string): string {
  return join(repoRoot, 'src', rel)
}

/** ファイル内容を読み込み、行ごとに分割して返す */
function readLines(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8')
  return content.split('\n')
}

/** 対象ファイルに targetString が含まれるかチェック */
function containsCall(lines: string[], targetString: string): boolean {
  return lines.some(line => line.includes(targetString))
}

// ─── 各ファイルの期待される soundManager.onXxx() 呼び出し ─────────────

interface WiringCheck {
  file: string
  calls: string[]
  description: string
}

const wiringChecks: WiringCheck[] = [
  {
    file: 'composables/useGameState.ts',
    description: 'useGameState: choiceReveal / genreLock / choiceSelect / throwStart / throwLand',
    calls: [
      'soundManager.onChoiceReveal(',
      'soundManager.onGenreLock(',
      'soundManager.onChoiceSelect(',
      'soundManager.onThrowStart(',
      'soundManager.onThrowLand(',
    ],
  },
  {
    file: 'game/sideScroller.ts',
    description: 'SideScroller: jump / land / death / genreLock',
    calls: [
      'soundManager.onJump()',
      'soundManager.onLand()',
      'soundManager.onDeath()',
      'soundManager.onGenreLock(',
    ],
  },
  {
    file: 'game/systems/RhythmFeature.ts',
    description: 'RhythmFeature: beat / justHit',
    calls: [
      'soundManager.onBeat(',
      'soundManager.onJustHit()',
    ],
  },
  {
    file: 'game/systems/PuzzleFeature.ts',
    description: 'PuzzleFeature: puzzleSlide / puzzleClear / hit',
    calls: [
      'soundManager.onPuzzleSlide()',
      'soundManager.onPuzzleClear()',
      'soundManager.onHit()',
    ],
  },
  {
    file: 'game/systems/ShootFeature.ts',
    description: 'ShootFeature: shoot / enemyDestroyed / enemyHit',
    calls: [
      'soundManager.onShoot()',
      'soundManager.onEnemyDestroyed()',
      'soundManager.onEnemyHit()',
    ],
  },
  {
    file: 'game/systems/SurvivalFeature.ts',
    description: 'SurvivalFeature: meleeAttack / meleeHit / itemPickup / levelUp / hungerDamage',
    calls: [
      'soundManager.onMeleeAttack()',
      'soundManager.onMeleeHit()',
      'soundManager.onItemPickup()',
      'soundManager.onLevelUp()',
      'soundManager.onHungerDamage()',
    ],
  },
  {
    file: 'game/systems/MovementFeature.ts',
    description: 'MovementFeature: dash / slide / wallJump',
    calls: [
      'soundManager.onDash()',
      'soundManager.onSlide()',
      'soundManager.onWallJump()',
    ],
  },
  {
    file: 'game/systems/RpgFeature.ts',
    description: 'RpgFeature: itemPickup / shieldAbsorb',
    calls: [
      'soundManager.onItemPickup()',
      'soundManager.onShieldAbsorb()',
    ],
  },
  {
    file: 'game/systems/SpecialFeature.ts',
    description: 'SpecialFeature: colorTouch / towerFire / timeBonus / bossSpawn / bossDefeated / stealthActivate',
    calls: [
      'soundManager.onColorTouch()',
      'soundManager.onTowerFire()',
      'soundManager.onTimeBonus()',
      'soundManager.onBossSpawn()',
      'soundManager.onBossDefeated()',
      'soundManager.onStealthActivate()',
    ],
  },
  {
    file: 'game/systems/TetrisFeature.ts',
    description: 'TetrisFeature: move / rotate / hardDrop / lock / lineClear',
    calls: [
      'soundManager.onTetrisMove()',
      'soundManager.onTetrisRotate()',
      'soundManager.onTetrisHardDrop()',
      'soundManager.onTetrisLock()',
      'soundManager.onLineClear()',
    ],
  },
  {
    file: 'App.vue',
    description: 'App.vue: pauseToggle / manualUpdate / learningEffect',
    calls: [
      'soundManager.onPauseToggle()',
      'soundManager.onManualUpdate()',
      'soundManager.onLearningEffect()',
    ],
  },
  {
    file: 'components/ThrowOverlay.vue',
    description: 'ThrowOverlay: throwRelease / throwGrab',
    calls: [
      'soundManager.onThrowRelease()',
      'soundManager.onThrowGrab()',
    ],
  },
  {
    file: 'components/EndingPanel.vue',
    description: 'EndingPanel: scoreReveal / gradeStamp / surpriseEnding',
    calls: [
      'soundManager.onScoreReveal()',
      'soundManager.onGradeStamp()',
      'soundManager.onSurpriseEnding()',
    ],
  },
]

// ─── テスト ──────────────────────────────────────────────────────────

describe('SFX wiring', () => {
  for (const check of wiringChecks) {
    describe(check.description, () => {
      const lines = readLines(srcPath(check.file))

      for (const call of check.calls) {
        test(`${call} が存在する`, () => {
          expect(
            containsCall(lines, call),
            `${check.file} に "${call}" が含まれていない`,
          ).toBe(true)
        })
      }
    })
  }
})
