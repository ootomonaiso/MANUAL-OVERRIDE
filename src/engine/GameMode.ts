/**
 * engine/GameMode.ts
 *
 * ジャンルが「コアループの完全置換」を宣言するためのインターフェース。
 * 提供された場合、エンジン側はデフォルトの「スクロール+障害物+衝突」パイプラインの代わりに
 * この Mode の update / render を呼ぶ。Mode は自前のエンティティ（ノーツ・競争相手・タワー等）を
 * 内部状態として持ち、world はスコア/生存/入力の共有バスとして使う。
 *
 * ── 新モードを追加するには ──────────────────────────────────────
 * 1. src/game/modes/ に MyMode.ts を作る（GameMode を実装）
 * 2. 対応する GenrePlugin に gameMode = new MyMode() を追加
 *    → src/genres/index.ts の登録ループが自動で GameRegistry.registerMode() を呼ぶ
 * ────────────────────────────────────────────────────────────────
 */

import type { MutableWorld } from './types'

export interface GameMode {
  readonly id: string
  /** Mode 開始時（ジャンル確定時）に一度だけ呼ばれる。 */
  setup?(world: MutableWorld): void
  /** 毎フレーム。Mode がゲーム進行を完全に制御する。 */
  update(world: MutableWorld, dt: number): void
  /** 毎フレーム。Mode 固有の描画（自前エンティティ等）。 */
  render(ctx: CanvasRenderingContext2D, world: MutableWorld): void
  /** 勝利条件（true でランを「成功終了」させる。既存の死亡→投擲ではなく別ルート）。 */
  isWon?(world: MutableWorld): boolean
  /** 敗北条件（true で死亡扱い。衝突死亡の代わりに Mode が失敗を定義）。 */
  isLost?(world: MutableWorld): boolean
}
