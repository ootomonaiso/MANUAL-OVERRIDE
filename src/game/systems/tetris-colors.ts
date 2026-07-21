/**
 * game/systems/tetris-colors.ts
 * テトリミノの標準カラー定義（7種類）。
 *
 * TetrisFeature.ts と TetrisPlugin.ts の両方から参照される共有定数。
 * 色の一元管理により、片方だけ変更するミスを防ぐ。
 */

export const TETRIS_COLORS = {
  I: '#00f0f0', // シアン
  O: '#f0f000', // イエロー
  T: '#a000f0', // パープル
  S: '#00f000', // グリーン
  Z: '#f00000', // レッド
  J: '#0000f0', // ブルー
  L: '#f0a000', // オレンジ
} as const

export type TetrisColorId = keyof typeof TETRIS_COLORS
