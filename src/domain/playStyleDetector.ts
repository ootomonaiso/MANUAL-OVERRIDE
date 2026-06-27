import type { ActionStats, DetectedPlayStyle, PlayStyleResult, GenreParams, GenreParam } from './types'

// ─────────────────────────────────────────────────────────────
// プレイスタイル検出の閾値
// これらの値は実測データに基づいて調整する
// ─────────────────────────────────────────────────────────────

/** ジャンプレートの閾値 */
const JUMP_RATE_LOW = 0.015     // これ未満: low_jumper
const JUMP_RATE_HIGH = 0.07     // これ超過: jump_spammer

/** 左右移動比率の閾値 */
const LEFT_DOMINANCE_RATIO = 1.3  // left/right がこれ以上: left_runner

/** 衝突回数の閾値（ticks 1000あたり） */
const COLLISION_RATE_HIGH = 0.005  // これ超過: collision_prone

/** 右移動レートの閾値（高速移動判定） */
const SPEED_DEMON_RATE = 0.06  // これ超過: speed_demon

/** 射撃精度の閾値（sniper 判定） */
const SHOT_RATE_LOW = 0.02     // 慎重な射撃
const SHOT_RATE_MIN = 0.005    // 射撃がこれ以上ないと sniper 判定しない

/** 隠しジャンルボーナスの係数 */
const HIDDEN_GENRE_BONUS_MULTIPLIER = 1.5

/** プレイスタイル検出の最小ticks数（ゲーム開始直後は検出しない） */
const MIN_TICKS_FOR_DETECTION = 300

/** ナラティブ表示の最小強度（これ未満はナラティブを表示しない） */
const MIN_NARRATIVE_STRENGTH = 0.3

/**
 * Object.entries から取得したキーが GenreParam 型であるか検証する。
 * STYLE_GENRE_BONUS のキーはすべて GenreParam であることが保証されているため、
 * 実際には常に true を返す。ただし、TypeScript の型システムで安全な変換を行うために必要。
 */
function isGenreParam(key: string): key is GenreParam {
  return ['tempo', 'range', 'enemy', 'combo', 'growth', 'rhythm',
          'stealth', 'vertical', 'aerial', 'survive', 'craft', 'speed'].includes(key)
}

// 各プレイスタイルが誘導するジャンルパラメータ
const STYLE_GENRE_BONUS: Record<DetectedPlayStyle, GenreParams> = {
  low_jumper:      { stealth: HIDDEN_GENRE_BONUS_MULTIPLIER, survive: 1 },
  jump_spammer:    { aerial: HIDDEN_GENRE_BONUS_MULTIPLIER, combo: 1 },
  left_runner:     { craft: HIDDEN_GENRE_BONUS_MULTIPLIER, growth: 0.5 },
  collision_prone: { survive: HIDDEN_GENRE_BONUS_MULTIPLIER, enemy: 1 },
  speed_demon:     { speed: HIDDEN_GENRE_BONUS_MULTIPLIER, tempo: 1 },
  sniper:          { range: HIDDEN_GENRE_BONUS_MULTIPLIER, enemy: 0.5 },
}

/**
 * ActionStats からプレイスタイルを検出する。
 *
 * 各スタイルは独立して評価され、複数のスタイルが同時に検出される可能性がある。
 * strength は 0〜1 の値で、1に近いほどそのスタイルの傾向が強い。
 *
 * 閾値は実測データに基づいて調整する。初期値は経験値に基づく概算。
 */
export function detectPlayStyle(stats: ActionStats): PlayStyleResult {
  // ticks が少ない（ゲーム開始直後）場合は検出しない
  if (stats.ticks < MIN_TICKS_FOR_DETECTION) {
    return { styles: [], dominant: null, genreBonus: {} }
  }

  const styles: { style: DetectedPlayStyle; strength: number }[] = []

  // ── ジャンプレート分析 ─────────────────────────────────────
  const jumpRate = stats.jumps / stats.ticks
  if (jumpRate < JUMP_RATE_LOW && stats.jumps > 0) {
    // ジャンプをほとんどしない（ただし0回ではない）
    const strength = Math.max(0, 1 - jumpRate / JUMP_RATE_LOW)
    styles.push({ style: 'low_jumper', strength: Math.min(1, strength) })
  } else if (jumpRate > JUMP_RATE_HIGH) {
    // ジャンプ連打
    const strength = Math.min(1, (jumpRate - JUMP_RATE_HIGH) / JUMP_RATE_HIGH)
    styles.push({ style: 'jump_spammer', strength })
  }

  // ── 左右移動分析 ──────────────────────────────────────────
  const totalMove = stats.moveLeft + stats.moveRight
  if (totalMove > 0) {
    const leftRatio = stats.moveLeft / Math.max(1, stats.moveRight)
    if (leftRatio > LEFT_DOMINANCE_RATIO) {
      // 左に走り続けている
      const strength = Math.min(1, (leftRatio - LEFT_DOMINANCE_RATIO) / LEFT_DOMINANCE_RATIO)
      styles.push({ style: 'left_runner', strength })
    }

    // 右移動レート（高速移動判定）
    const rightRate = stats.moveRight / stats.ticks
    if (rightRate > SPEED_DEMON_RATE) {
      const strength = Math.min(1, (rightRate - SPEED_DEMON_RATE) / SPEED_DEMON_RATE)
      styles.push({ style: 'speed_demon', strength })
    }
  }

  // ── 衝突分析 ──────────────────────────────────────────────
  const collisions = stats.collisions ?? 0
  if (collisions > 0) {
    const collisionRate = collisions / stats.ticks
    if (collisionRate > COLLISION_RATE_HIGH) {
      const strength = Math.min(1, collisionRate / (COLLISION_RATE_HIGH * 3))
      styles.push({ style: 'collision_prone', strength })
    }
  }

  // ── 射撃分析 ──────────────────────────────────────────────
  if (stats.shots > 0) {
    const shotRate = stats.shots / stats.ticks
    if (shotRate >= SHOT_RATE_MIN && shotRate < SHOT_RATE_LOW) {
      // 慎重に射撃している（sniper）
      const strength = Math.min(1, (SHOT_RATE_LOW - shotRate) / SHOT_RATE_LOW)
      styles.push({ style: 'sniper', strength })
    }
  }

  // 強度でソート
  styles.sort((a, b) => b.strength - a.strength)

  // 最も強いスタイル
  const dominant = styles.length > 0 ? styles[0].style : null

  // ジャンルボーナスを計算（上位2つのスタイルを考慮）
  const genreBonus = computeGenreBonus(styles.slice(0, 2))

  return { styles, dominant, genreBonus }
}

/**
 * 検出されたプレイスタイルからジャンルボーナスパラメータを計算する。
 * 上位2つのスタイルのボーナスを合成する。
 */
function computeGenreBonus(styles: { style: DetectedPlayStyle; strength: number }[]): GenreParams {
  const bonus: GenreParams = {}

  for (const { style, strength } of styles) {
    const styleBonus = STYLE_GENRE_BONUS[style]
    for (const [key, value] of Object.entries(styleBonus)) {
      // 強度に比例してボーナスを付与
      if (isGenreParam(key)) {
        bonus[key] = (bonus[key] ?? 0) + value * strength
      }
    }
  }

  return bonus
}

/**
 * プレイスタイルを人間可读の文字列に変換する（デバッグ・UI表示用）。
 */
export function describePlayStyle(style: DetectedPlayStyle): string {
  const descriptions: Record<DetectedPlayStyle, string> = {
    low_jumper: '慎重に地面を走るスタイル',
    jump_spammer: '空中時間を好むスタイル',
    left_runner: '後退を繰り返すスタイル',
    collision_prone: '挑戦的に衝突するスタイル',
    speed_demon: '高速で駆け抜けるスタイル',
    sniper: '慎重に狙いを定めるスタイル',
  }
  return descriptions[style]
}

/**
 * プレイスタイルベースの隠し誘導メッセージを生成する。
 * EndingPanel で「あなたのプレイスタイルは〜」として表示される。
 */
export function generatePlayStyleNarrative(result: PlayStyleResult): string | null {
  if (!result.dominant || result.styles[0].strength < MIN_NARRATIVE_STRENGTH) {
    return null
  }

  const { style, strength } = result.styles[0]
  const narrativeMap: Record<DetectedPlayStyle, string[]> = {
    low_jumper: [
      'あなたはほとんどジャンプしなかった…',
      '地面に這うようなプレイだった。',
      'その慎重さが、別の世界を呼んだのかもしれな',
    ],
    jump_spammer: [
      'あなたは空中を好んだようだ…',
      '跳び続けるその姿は、まるで翼があるかのようだった。',
      '空中があなたの本当の舞台だったのかもしれな',
    ],
    left_runner: [
      'あなたは進まなかった…',
      '後退を繰り返すその姿は、まるで時間を止めたようだった。',
      '動かないことを選んだ結果、世界があなたを包み込んだのかもしれな',
    ],
    collision_prone: [
      'あなたは何度も倒れた…',
      'しかしその都度、立ち上がった。',
      'その執念が、より過酷な世界を呼んだのかもしれな',
    ],
    speed_demon: [
      'あなたは速かった…',
      '風を切り裂くような速度で。',
      'その速さが、レースの世界を呼んだのかもしれな',
    ],
    sniper: [
      'あなたは慎重だった…',
      '無駄な動きを排し、一撃を待った。',
      'その集中力が、シューティングの世界を呼んだのかもしれな',
    ],
  }

  const lines = narrativeMap[style]
  // 強度に応じて表示行数を変える
  const lineCount = strength > 0.7 ? 3 : strength > 0.4 ? 2 : 1
  return lines.slice(0, lineCount).join('\n')
}
