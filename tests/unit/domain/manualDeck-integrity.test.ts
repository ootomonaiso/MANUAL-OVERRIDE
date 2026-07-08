import { describe, it, expect } from 'vitest'
import { validateDeck, validateDeckStructure } from '../../../src/framework/ManualValidator'
import { MANUAL_DECK } from '../../../src/data/manualDeck'

/**
 * バグ調査用の再現テスト（docs/bug-report.md 参照）。
 *
 * ManualValidator.devValidate() は import.meta.env.PROD で早期 return するため、
 * 本番ビルドでは MANUAL_DECK の参照整合性チェックが一切実行されない。
 * また scripts/validate-json.mjs も src/data/manuals/*.json に対して
 * トップレベルの id/entries の存在しか見ておらず、next 参照や循環は検査しない。
 * このテストは、実データ (MANUAL_DECK) に対して ManualValidator の
 * 検証ロジックを直接実行し、実際に検出される問題があるかを確認する。
 */
describe('MANUAL_DECK integrity (validateDeck against real data)', () => {
  it('構造チェック: 型エラーがないこと', () => {
    const structErrors = validateDeckStructure(MANUAL_DECK as unknown as Record<string, unknown>)
    if (structErrors.length > 0) {
      console.log('[structErrors]', structErrors)
    }
    expect(structErrors).toEqual([])
  })

  it('参照整合性チェック: next 切れ・循環参照がないこと', () => {
    const result = validateDeck(MANUAL_DECK)
    if (result.errors.length > 0) {
      console.log('[validateDeck errors]', result.errors)
    }
    if (result.warnings.length > 0) {
      console.log('[validateDeck warnings]', result.warnings)
    }
    expect(result.errors).toEqual([])
  })
})
