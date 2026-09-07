/**
 * genres/hashUtil.ts
 *
 * 乱数不使用の決定的ハッシュ関数（seed → [0,1)）。
 * GlitchPlugin / HorrorPlugin 等で再利用するためモジュール化した。
 */

/**
 * 決定的ハッシュ。seed を [0, 1) の数値に変換する。
 * 乱数を使わず、同じ seed なら常に同じ値を返す。
 */
export function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

// genres/index.ts の import.meta.glob 対策。
// このファイルはジャンルプラグインではなく、ハッシュ関数のみを提供する。
// null を default export することで glob による自動登録を回避する。
export default null
