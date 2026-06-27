import type { ScoreVars, ThrowResult, FinalScore } from './types'
import { SCORE_RATIO, THROW_SCORE_WEIGHTS } from '../data/gameBalance'

// ──────────────────────────────────────────────────────────────────────
// 安全なスコア式パーサ
// 許可: 数値リテラル, 変数名(英数字_), 演算子(+-*/), 括弧, 空白
// 禁止: eval, Function, 関数呼び出し, その他全て
// ──────────────────────────────────────────────────────────────────────
const SAFE_PATTERN = /^[\d\s+\-*/().a-z_]+$/i

const DEFAULT_FORMULA = 'distance * 0.5 + kills * 100'

// 最後に発生したパースエラーを呼び出し元が取得できるよう保持
let _lastFormulaError: string | null = null

/** evalScoreFormula() でエラーが発生した場合のメッセージを返し、取り出したらリセットする */
export function getLastFormulaError(): string | null {
  const e = _lastFormulaError
  _lastFormulaError = null
  return e
}

export function evalScoreFormula(formula: string, vars: ScoreVars): number {
  if (!SAFE_PATTERN.test(formula)) {
    const msg = `不正なスコア式 "${formula}" — デフォルト式で代替`
    console.warn('[scoreCalc]', msg)
    _lastFormulaError = msg
    try { return _parseExpr(DEFAULT_FORMULA, vars) } catch { return 0 }
  }
  // Function ではなく手書きパーサで評価（eval 禁止）
  try {
    return _parseExpr(formula.trim(), vars)
  } catch (e) {
    const msg = `スコア式パースエラー "${formula}" — デフォルト式で代替`
    console.warn('[scoreCalc]', msg, e)
    _lastFormulaError = msg
    try { return _parseExpr(DEFAULT_FORMULA, vars) } catch { return 0 }
  }
}

// ──────────────────────────────────────────────────────────────────────
// 式パーサ（四則演算 + 括弧 + 変数）
// ──────────────────────────────────────────────────────────────────────
function _parseExpr(src: string, vars: ScoreVars): number {
  let pos = 0

  const peek = () => src[pos]
  const consume = () => src[pos++]
  const skipSpace = () => { while (src[pos] === ' ') pos++ }

  function parseAddSub(): number {
    let left = parseMulDiv()
    skipSpace()
    while (peek() === '+' || peek() === '-') {
      const op = consume()
      const right = parseMulDiv()
      left = op === '+' ? left + right : left - right
      skipSpace()
    }
    return left
  }

  function parseMulDiv(): number {
    let left = parseUnary()
    skipSpace()
    while (peek() === '*' || peek() === '/') {
      const op = consume()
      const right = parseUnary()
      if (op === '*') {
        left = left * right
      } else if (right === 0) {
        console.warn('[scoreCalc] 0 除算を検出しました（式: "' + src + '"）— 0 で代替')
        left = 0
      } else {
        left = left / right
      }
      skipSpace()
    }
    return left
  }

  function parseUnary(): number {
    skipSpace()
    if (peek() === '-') { consume(); return -parsePrimary() }
    return parsePrimary()
  }

  function parsePrimary(): number {
    skipSpace()
    if (peek() === '(') {
      consume()
      const val = parseAddSub()
      skipSpace()
      if (peek() === ')') consume()
      return val
    }
    if (/\d/.test(peek() ?? '')) return parseNumber()
    if (/[a-z_]/i.test(peek() ?? '')) return parseVar()
    return 0
  }

  function parseNumber(): number {
    let s = ''
    while (/[\d.]/.test(peek() ?? '')) s += consume()
    return parseFloat(s)
  }

  function parseVar(): number {
    let name = ''
    while (/[a-z0-9_]/i.test(peek() ?? '')) name += consume()
    return (vars as unknown as Record<string, number>)[name] ?? 0
  }

  return parseAddSub()
}

// ──────────────────────────────────────────────────────────────────────
// 投擲スコア計算
// ──────────────────────────────────────────────────────────────────────
export function calcThrowScore(result: ThrowResult): number {
  const w = THROW_SCORE_WEIGHTS
  // airTime は秒単位。× 1000 でミリ秒スケールに変換して weight を乗算
  // 例: 2秒滞空 → 2000 × 0.5 = 1000点
  const airScore = result.airTime * 1000 * w.airTime
  const arcScore = result.arcHeight * w.arcHeight
  const speedPenalty = Math.max(0, result.speed - 800) * w.speedPenalty
  return Math.max(0, airScore + arcScore - speedPenalty)
}

// ──────────────────────────────────────────────────────────────────────
// 最終スコア合算
// ──────────────────────────────────────────────────────────────────────
export function calcFinalScore(playScore: number, throwScore: number): FinalScore {
  const play = Math.round(playScore * SCORE_RATIO.play)
  const thr  = Math.round(throwScore * SCORE_RATIO.throw)
  return { play, throw: thr, total: play + thr }
}
