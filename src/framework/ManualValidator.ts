/**
 * framework/ManualValidator.ts
 *
 * MANUAL_DECK の整合性チェック。
 * - すべての choices[].next が実在するキーを指しているか
 * - 循環参照がないか
 * - ルートキー '1.0' が存在するか
 * - 各エントリーの必須フィールドが存在し正しい型を持つか（実行時型ガード）
 *
 * 開発時に呼ぶことでデータ破損を早期検知できる。
 */

import type { ManualVersion } from '../domain/types'

// ──────────────────────────────────────────────────────────────────────
// 実行時型ガード — JSON ロード時に ManualVersion の構造を検証
// ──────────────────────────────────────────────────────────────────────

/**
 * 単一の ManualVersion エントリーが必須フィールドを持つか検証する。
 * エラーメッセージの配列を返す（空なら問題なし）。
 */
export function validateManualVersionStructure(key: string, v: unknown): string[] {
  const errs: string[] = []
  if (typeof v !== 'object' || v === null) {
    return [`"${key}": ManualVersion はオブジェクトである必要があります（${typeof v} が渡されました）`]
  }
  const obj = v as Record<string, unknown>

  // version
  if (typeof obj.version !== 'string' || obj.version === '') {
    errs.push(`"${key}".version: string が必要です`)
  }
  // manualText
  if (!Array.isArray(obj.manualText) || obj.manualText.some(t => typeof t !== 'string')) {
    errs.push(`"${key}".manualText: string[] が必要です`)
  }
  // choices
  if (!Array.isArray(obj.choices)) {
    errs.push(`"${key}".choices: 配列が必要です`)
  } else {
    obj.choices.forEach((c: unknown, i: number) => {
      if (typeof c !== 'object' || c === null) {
        errs.push(`"${key}".choices[${i}]: オブジェクトが必要です`)
        return
      }
      const ch = c as Record<string, unknown>
      if (typeof ch.id !== 'string')    errs.push(`"${key}".choices[${i}].id: string が必要です`)
      if (typeof ch.label !== 'string') errs.push(`"${key}".choices[${i}].label: string が必要です`)
      if (typeof ch.next !== 'string')  errs.push(`"${key}".choices[${i}].next: string が必要です`)
      if (typeof ch.genreParams !== 'object' || ch.genreParams === null || Array.isArray(ch.genreParams)) {
        errs.push(`"${key}".choices[${i}].genreParams: object が必要です`)
      }
    })
  }
  // hazards
  if (typeof obj.hazards !== 'object' || obj.hazards === null) {
    errs.push(`"${key}".hazards: object が必要です`)
  } else {
    const hz = obj.hazards as Record<string, unknown>
    if (!Array.isArray(hz.colors))     errs.push(`"${key}".hazards.colors: string[] が必要です`)
    if (!Array.isArray(hz.safeColors)) errs.push(`"${key}".hazards.safeColors: string[] が必要です`)
  }

  return errs
}

/**
 * デッキ全体のエントリー構造を検証し、エラー一覧を ValidationResult に追記する。
 * validateDeck() の前処理として使う。
 */
export function validateDeckStructure(deck: Record<string, unknown>): string[] {
  const errs: string[] = []
  for (const [key, value] of Object.entries(deck)) {
    errs.push(...validateManualVersionStructure(key, value))
  }
  return errs
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export function validateDeck(deck: Record<string, ManualVersion>): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // ── ルートキーの存在確認 ──────────────────────────────────────
  if (!deck['1.0']) {
    errors.push('ルートキー "1.0" が存在しません。MANUAL_DECK には必ず "1.0" エントリーが必要です。')
  }

  // ── choices[].next の参照チェック ─────────────────────────────
  for (const [key, ver] of Object.entries(deck)) {
    for (const choice of ver.choices) {
      if (!deck[choice.next]) {
        errors.push(
          `"${key}" → choice "${choice.id}" の next "${choice.next}" が見つかりません。`
        )
      }
      if (choice.next === key) {
        errors.push(`"${key}" の選択肢が自分自身を next に指定しています（直接循環）。`)
      }
    }
  }

  // ── 到達不可能なエントリーの検出（警告） ──────────────────────
  const reachable = new Set<string>()
  function traverse(key: string, visited: Set<string>): void {
    if (reachable.has(key) || visited.has(key)) return
    reachable.add(key)
    visited.add(key)
    const ver = deck[key]
    if (!ver) return
    for (const c of ver.choices) traverse(c.next, new Set(visited))
  }
  traverse('1.0', new Set())

  for (const key of Object.keys(deck)) {
    if (!reachable.has(key)) {
      warnings.push(`"${key}" はどこからも参照されていません（到達不可能）。`)
    }
  }

  // ── 深い循環参照の検出 ─────────────────────────────────────────
  for (const key of Object.keys(deck)) {
    // hasCycle は start を通る循環の存在確認のため、
    // choices の next から再び start に戻れるかをチェック
    const ver = deck[key]
    if (!ver) continue
    for (const c of ver.choices) {
      const pathVisited = new Set<string>()
      function canReach(from: string, target: string): boolean {
        if (from === target) return true
        if (pathVisited.has(from)) return false
        pathVisited.add(from)
        return (deck[from]?.choices ?? []).some(cc => canReach(cc.next, target))
      }
      if (canReach(c.next, key)) {
        errors.push(`循環参照を検出: "${key}" → "${c.next}" がやがて "${key}" に戻ります。`)
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * 開発環境でのみ検証を実行し、問題があればコンソールに出力する。
 * 型構造チェック → 参照整合性チェックの順で実施。
 */
export function devValidate(deck: Record<string, ManualVersion>): void {
  if (import.meta.env?.PROD) return   // 本番では実行しない

  // 1. JSON 構造型チェック（フィールド存在・型の確認）
  const structErrors = validateDeckStructure(deck as Record<string, unknown>)
  for (const e of structErrors) {
    console.error('[ManualValidator] ❌ 型エラー:', e)
  }
  if (structErrors.length > 0) {
    console.error('[ManualValidator] 型エラーがあるため、整合性チェックをスキップします。')
    return
  }

  // 2. 参照整合性チェック（next が存在するか・到達可能か・循環なしか）
  const result = validateDeck(deck)

  for (const w of result.warnings) {
    console.warn('[ManualValidator] ⚠️', w)
  }
  for (const e of result.errors) {
    console.error('[ManualValidator] ❌', e)
  }
  if (!result.ok) {
    console.error('[ManualValidator] デッキに問題があります。上記のエラーを確認してください。')
  } else if (result.warnings.length === 0) {
    console.warn('[ManualValidator] ✅ デッキの整合性チェック: 問題なし')
  }
}
